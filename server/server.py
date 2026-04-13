"""
Protokollbrowser Exchange Server
Leichtgewichtiger HTTP-Server für Sync zwischen DOCUframe und PWA.

Verzeichnisstruktur:
  data/
    subscriptions.json             Abo-Verwaltung (Device -> Projekte)
    dfexport/                      DOCUframe -> App (von DF geschrieben)
      projekte.json                  Projekt-Katalog (Hub)
      {ProjektId}/
        protokolle.json
        manifest.json
    dfimport/                      App -> DOCUframe (flach!)
      progrp{OID}_{UUID}.json        eine Datei je App-Upload
      done/                          von DOCUframe verarbeitet
      archive/                       ZIP-Archive der Uploads
      photos/                        Notfall-Puffer fuer Fotos

Starten: uvicorn server:app --host 0.0.0.0 --port 8080
"""

import json
import logging
import os
import re
import shutil
import sys
import time
import uuid
from pathlib import Path
from datetime import datetime

# Server-Verzeichnis in sys.path, damit core/models/schemas/routers importiert werden
_server_dir = Path(__file__).resolve().parent
if str(_server_dir) not in sys.path:
    sys.path.insert(0, str(_server_dir))

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware


def read_json_auto_encoding(path: Path):
    """JSON-Datei lesen mit automatischer Encoding-Erkennung (UTF-16LE / UTF-8)."""
    raw = path.read_bytes()
    if len(raw) == 0:
        raise ValueError(f"Datei ist leer: {path}")

    # UTF-16LE BOM (FF FE) oder ohne BOM (zweites Byte = 0x00 bei ASCII)
    if (len(raw) >= 2 and raw[0] == 0xFF and raw[1] == 0xFE) or \
       (len(raw) >= 2 and raw[1] == 0x00):
        text = raw.decode("utf-16-le").lstrip("\ufeff")
    else:
        text = raw.decode("utf-8-sig")

    return json.loads(text)

# Bei PyInstaller-exe: sys.executable zeigt auf die exe, __file__ auf den temp-Ordner
_script_dir = Path(sys.executable).parent if getattr(sys, 'frozen', False) else Path(__file__).parent

# Basis-Verzeichnis: data/ neben exe/server.py, oder per Umgebungsvariable
DATA_DIR = Path(os.environ.get("EXCHANGE_DATA_DIR", _script_dir / "data"))
DFEXPORT_DIR = DATA_DIR / "dfexport"              # DOCUframe -> App
DFIMPORT_DIR = DATA_DIR / "dfimport"              # App -> DOCUframe (flach)
DFIMPORT_DONE_DIR = DFIMPORT_DIR / "done"
DFIMPORT_ARCHIVE_DIR = DFIMPORT_DIR / "archive"
DFIMPORT_PHOTOS_DIR = DFIMPORT_DIR / "photos"
SUBSCRIPTIONS_FILE = DATA_DIR / "subscriptions.json"

# Projektordner-Basis für Foto-Ablage (Fuzzy-Suche Fallback)
PROJEKTE_BASE = Path(os.environ.get("PROJEKTE_BASE", "K:/projekte"))

# Verzeichnisse anlegen
for d in [DFEXPORT_DIR, DFIMPORT_DIR, DFIMPORT_DONE_DIR, DFIMPORT_ARCHIVE_DIR, DFIMPORT_PHOTOS_DIR]:
    d.mkdir(parents=True, exist_ok=True)


def _make_dfimport_filename(project_id: str) -> str:
    """Flat filename for incoming app uploads: progrp{OID}_{UUID}.json"""
    safe_id = re.sub(r'[^A-Za-z0-9_-]', '_', project_id)
    return f"progrp{safe_id}_{uuid.uuid4().hex}.json"

log = logging.getLogger("exchange")


# --- Projektpfad-Suche (für Foto-Ablage) ---

_projekt_pfad_cache: dict[str, Path | None] = {}


def _find_projekt_pfad(projekt_nummer: str) -> Path | None:
    """Projektordner auf dem Fileserver finden.

    Sucht in K:\\projekte\\{AG-Gruppe}\\{ProjektNr}_{Bezeichnung}\\.
    Ergebnis wird gecacht.
    """
    if projekt_nummer in _projekt_pfad_cache:
        return _projekt_pfad_cache[projekt_nummer]

    result = None
    try:
        for ag_dir in PROJEKTE_BASE.iterdir():
            if not ag_dir.is_dir():
                continue
            for proj_dir in ag_dir.iterdir():
                if not proj_dir.is_dir():
                    continue
                name = proj_dir.name
                # Projektnummer am Anfang, gefolgt von _ oder Leerzeichen
                if name.startswith(projekt_nummer + "_") or name.startswith(projekt_nummer + " "):
                    result = proj_dir
                    break
            if result:
                break
    except OSError:
        pass

    _projekt_pfad_cache[projekt_nummer] = result
    return result


def _copy_photos_to_project(project_id: str, changes_json_path: Path, photos_src_dir: Path):
    """Fotos aus einem Quellordner in die Projektstruktur kopieren.

    Ziel: {ProjektPfad}\\Fotos\\{GruppeName}\\Protokoll {Nr}\\
    Ergänzt FotoPfadServer in der JSON-Datei.
    """
    if not photos_src_dir.exists() or not any(photos_src_dir.iterdir()):
        return  # Keine Fotos vorhanden

    # Manifest lesen für ProjektStammverzeichnis und GruppeName
    manifest_path = DFEXPORT_DIR / project_id / "manifest.json"
    projekt_pfad = None
    gruppe_name = project_id  # Fallback

    if manifest_path.exists():
        try:
            manifest = read_json_auto_encoding(manifest_path)
            stammverz = manifest.get("projektStammverzeichnis") or manifest.get("ProjektStammverzeichnis", "")
            gruppe_name = manifest.get("gruppeName", project_id)
            projekt_id_nr = manifest.get("projektNummer") or manifest.get("projektId", "")

            if stammverz and Path(stammverz).exists():
                projekt_pfad = Path(stammverz)
            elif projekt_id_nr:
                # Fuzzy-Suche nach Projektnummer
                projekt_pfad = _find_projekt_pfad(projekt_id_nr)
        except (json.JSONDecodeError, ValueError, OSError):
            pass

    if not projekt_pfad:
        log.warning("Kein Projektpfad für %s gefunden — Fotos bleiben in %s", project_id, photos_src_dir)
        return

    # Changes-JSON lesen um Protokollnummer zu ermitteln
    try:
        changes = json.loads(changes_json_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return

    modified = False
    for paket in changes:
        # Protokollnummer aus ProtokollMeta oder ProtokollIdAlt ableiten
        meta = paket.get("ProtokollMeta")
        prot_name = meta.get("Name", "") if meta else ""
        # Nummer aus Name extrahieren (z.B. "Baustellennotiz 6 - 2025" -> "6")
        nr_match = re.search(r'(\d+)', prot_name) if prot_name else None
        prot_nr = nr_match.group(1) if nr_match else "0"

        # Sanitize Gruppenname für Dateisystem
        safe_gruppe = re.sub(r'[<>:"/\\|?*]', '_', gruppe_name).strip()
        foto_ziel = projekt_pfad / "Fotos" / safe_gruppe / f"Protokoll {prot_nr}"

        for elem in paket.get("Elemente", []):
            mobile = elem.get("MobileDaten")
            if not mobile:
                continue
            fotos = mobile.get("Fotos", [])
            if not fotos:
                continue

            # Fotos kopieren
            foto_ziel.mkdir(parents=True, exist_ok=True)
            for foto in fotos:
                src = photos_src_dir / foto.get("FileName", "")
                if src.exists():
                    dst = foto_ziel / src.name
                    try:
                        shutil.copy2(str(src), str(dst))
                    except OSError as e:
                        log.warning("Foto-Kopie fehlgeschlagen: %s -> %s: %s", src, dst, e)

            # FotoPfadServer im JSON ergänzen
            mobile["FotoPfadServer"] = str(foto_ziel)
            mobile["FotoAnzahl"] = len(fotos)
            modified = True

    # Aktualisierte JSON zurückschreiben (mit FotoPfadServer)
    if modified:
        changes_json_path.write_text(
            json.dumps(changes, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )


def _scan_projekt_pfade() -> dict[str, str]:
    """K:\\projekte\\ scannen und Mapping ProjektNummer -> Pfad erzeugen.

    Schema: K:\\projekte\\{AG-Gruppe}\\{ProjektNr}_{Bezeichnung}\\
    Nur 2 Ebenen tief (AG-Gruppe -> Projektordner), nicht rekursiv.
    """
    mapping: dict[str, str] = {}
    if not PROJEKTE_BASE.exists():
        return mapping

    for ag_dir in PROJEKTE_BASE.iterdir():
        if not ag_dir.is_dir():
            continue
        try:
            for proj_dir in ag_dir.iterdir():
                if not proj_dir.is_dir():
                    continue
                name = proj_dir.name
                # Projektnummer = alles vor dem ersten _ oder Leerzeichen
                sep = len(name)
                if "_" in name:
                    sep = min(sep, name.index("_"))
                if " " in name:
                    sep = min(sep, name.index(" "))
                nr = name[:sep]
                if nr and nr not in mapping:
                    mapping[nr] = str(proj_dir)
        except OSError:
            continue

    return mapping


def _write_projekt_pfade_json():
    """Mapping-Datei data/projekt_pfade.json schreiben."""
    mapping = _scan_projekt_pfade()
    out = DATA_DIR / "projekt_pfade.json"
    out.write_text(
        json.dumps(mapping, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    log.info("projekt_pfade.json geschrieben: %d Projekte", len(mapping))
    return mapping


def _read_subscriptions() -> dict:
    """Subscriptions-Datei lesen (oder leeres Dict)."""
    if not SUBSCRIPTIONS_FILE.exists():
        return {"devices": {}}
    try:
        text = SUBSCRIPTIONS_FILE.read_text(encoding="utf-8")
        return json.loads(text)
    except (json.JSONDecodeError, OSError):
        return {"devices": {}}


def _write_subscriptions(data: dict):
    """Subscriptions-Datei atomar schreiben."""
    tmp = SUBSCRIPTIONS_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    shutil.move(str(tmp), str(SUBSCRIPTIONS_FILE))

app = FastAPI(title="Protokollbrowser Exchange Server")

# CORS — im Produktivbetrieb same-origin (PWA wird vom selben Server ausgeliefert),
# für Entwicklung erlauben wir alles
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Hub-kompatible SQLite-DB initialisieren ---
from core.database import create_tables

@app.on_event("startup")
def startup_db():
    create_tables()
    log.info("Hub SQLite-DB initialisiert")

# --- Hub-kompatible Router registrieren ---
from routers.protokollgruppen import router as gruppen_router
from routers.protokolle import router as protokolle_router
from routers.elemente import router as elemente_router
from routers.verantwortliche import router as verantwortliche_router

app.include_router(gruppen_router)
app.include_router(protokolle_router)
app.include_router(elemente_router)
app.include_router(verantwortliche_router)


@app.get("/api/health")
def health():
    return {"status": "ok", "time": datetime.now().isoformat()}


@app.get("/api/projects")
def list_projects(page: int = 1, size: int = 50):
    """Liste aller verfuegbaren Projekte (aus dfexport/). Hub-Envelope."""
    from core.schemas import paginated_response

    projects = []
    if not DFEXPORT_DIR.exists():
        return paginated_response(items=[], total=0, page=page, size=size)

    for projekt_dir in sorted(DFEXPORT_DIR.iterdir()):
        if not projekt_dir.is_dir():
            continue
        manifest_path = projekt_dir / "manifest.json"
        protokolle_path = projekt_dir / "protokolle.json"

        info = {
            "id": projekt_dir.name,
            "hasExport": protokolle_path.exists(),
        }

        if manifest_path.exists():
            try:
                manifest = read_json_auto_encoding(manifest_path)
                info["projektName"] = manifest.get("projektName", projekt_dir.name)
                info["timestamp"] = manifest.get("timestamp")
                info["gruppeName"] = manifest.get("gruppeName")
                info["projektNummer"] = manifest.get("projektNummer") or manifest.get("projektId", "")
            except (json.JSONDecodeError, ValueError, OSError):
                info["projektName"] = projekt_dir.name

        # Fallback: Manifest-Daten aus protokolle.json extrahieren (erstes Element)
        if "projektName" not in info and protokolle_path.exists():
            try:
                data = read_json_auto_encoding(protokolle_path)
                if isinstance(data, list) and len(data) > 0:
                    first = data[0]
                    if isinstance(first, dict) and ("version" in first or "ProjektName" in first or "GruppeName" in first):
                        info["projektName"] = first.get("ProjektName", projekt_dir.name)
                        info["gruppeName"] = first.get("GruppeName")
                        info["timestamp"] = first.get("timestamp")
                        info["projektNummer"] = first.get("ProjektNummer") or first.get("ProjektId", "")
            except (json.JSONDecodeError, ValueError, OSError):
                pass

        # Pending changes (App -> DOCUframe): Dateien im flachen dfimport/ zaehlen
        # die auf diese Protokollgruppe zeigen (progrp{OID}_*.json)
        pattern = f"progrp{projekt_dir.name}_*.json"
        info["pendingChanges"] = len(list(DFIMPORT_DIR.glob(pattern)))

        projects.append(info)

    # Pagination
    total = len(projects)
    start = (page - 1) * size
    end = start + size
    return paginated_response(items=projects[start:end], total=total, page=page, size=size)


@app.get("/api/projects/{project_id}/export")
def get_export(project_id: str):
    """Protokolldaten eines Projekts herunterladen."""
    protokolle_path = DFEXPORT_DIR / project_id / "protokolle.json"
    if not protokolle_path.exists():
        raise HTTPException(404, f"Kein Export für Projekt {project_id}")

    try:
        data = read_json_auto_encoding(protokolle_path)
    except (json.JSONDecodeError, ValueError, OSError) as e:
        raise HTTPException(500, f"Fehler beim Lesen: {e}")

    return data


@app.get("/api/projects-catalog")
def get_projects_catalog():
    """Projekt-Katalog aus DOCUframe-Export (projekte.json)."""
    projekte_path = DFEXPORT_DIR / "projekte.json"
    if not projekte_path.exists():
        raise HTTPException(404, "Kein Projekt-Katalog vorhanden (projekte.json)")

    try:
        data = read_json_auto_encoding(projekte_path)
    except (json.JSONDecodeError, ValueError, OSError) as e:
        raise HTTPException(500, f"Fehler beim Lesen: {e}")

    return data


@app.get("/api/addresses-catalog")
def get_addresses_catalog():
    """Adressen-Katalog aus DOCUframe-Export (adressen.json)."""
    adressen_path = DFEXPORT_DIR / "adressen.json"
    if not adressen_path.exists():
        raise HTTPException(404, "Kein Adressen-Katalog vorhanden (adressen.json)")

    try:
        data = read_json_auto_encoding(adressen_path)
    except (json.JSONDecodeError, ValueError, OSError) as e:
        raise HTTPException(500, f"Fehler beim Lesen: {e}")

    return data


@app.get("/api/projects/{project_id}/status")
def get_status(project_id: str):
    """Sync-Status: wann zuletzt exportiert, pending changes. Hub-Envelope."""
    from core.schemas import single_response

    result = {"projectId": project_id}

    manifest_path = DFEXPORT_DIR / project_id / "manifest.json"
    if manifest_path.exists():
        try:
            manifest = read_json_auto_encoding(manifest_path)
            result["lastExport"] = manifest.get("timestamp")
        except (json.JSONDecodeError, ValueError, OSError):
            pass

    pattern = f"progrp{project_id}_*.json"
    pending = sorted(DFIMPORT_DIR.glob(pattern), key=lambda p: p.stat().st_mtime)
    result["pendingChanges"] = len(pending)
    if pending:
        result["lastUpload"] = datetime.fromtimestamp(pending[-1].stat().st_mtime).isoformat()

    result["processedChanges"] = len(list(DFIMPORT_DONE_DIR.glob(pattern))) if DFIMPORT_DONE_DIR.exists() else 0

    return single_response(result)


@app.post("/api/projects/{project_id}/sync")
async def upload_changes(project_id: str, changes: dict):
    """Änderungen von der App hochladen -> dfimport/progrp{OID}_{UUID}.json (atomar)."""
    DFIMPORT_DIR.mkdir(parents=True, exist_ok=True)

    filename = _make_dfimport_filename(project_id)
    tmp_path = DFIMPORT_DIR / (filename + ".tmp")
    final_path = DFIMPORT_DIR / filename

    tmp_path.write_text(
        json.dumps(changes, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    shutil.move(str(tmp_path), str(final_path))

    from core.schemas import single_response
    return single_response({
        "status": "ok",
        "file": filename,
        "timestamp": datetime.now().isoformat(),
    })


@app.post("/api/projects/{project_id}/upload-zip")
async def upload_zip(project_id: str, file: UploadFile = File(...)):
    """ZIP-Datei (JSON + Fotos) von der App hochladen.

    Ablauf:
      1. ZIP entpacken in Temp-Verzeichnis
      2. Fotos in den Projektordner kopieren (K:\\projekte\\...)
      3. JSON (mit FotoPfadServer ergaenzt) nach dfimport/progrp{OID}_{UUID}.json
      4. ZIP als Backup nach dfimport/archive/
    """
    import zipfile
    import io
    import tempfile

    DFIMPORT_DIR.mkdir(parents=True, exist_ok=True)
    DFIMPORT_ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    DFIMPORT_PHOTOS_DIR.mkdir(parents=True, exist_ok=True)

    content = await file.read()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    # ZIP-Archiv sichern
    zip_name = f"progrp{re.sub(r'[^A-Za-z0-9_-]', '_', project_id)}_{timestamp}.zip"
    zip_path = DFIMPORT_ARCHIVE_DIR / zip_name
    zip_path.write_bytes(content)

    extracted_json: list[str] = []
    extracted_photos: list[str] = []

    with tempfile.TemporaryDirectory(prefix="dfimport_") as tmpdir:
        tmp = Path(tmpdir)
        tmp_json_paths: list[Path] = []
        tmp_photos_dir = tmp / "photos"

        try:
            with zipfile.ZipFile(io.BytesIO(content)) as zf:
                for name in zf.namelist():
                    if name.endswith('/'):
                        continue
                    data = zf.read(name)
                    basename = Path(name).name

                    if basename.endswith('.json'):
                        target = tmp / basename
                        target.write_bytes(data)
                        tmp_json_paths.append(target)
                        extracted_json.append(basename)
                    else:
                        tmp_photos_dir.mkdir(exist_ok=True)
                        (tmp_photos_dir / basename).write_bytes(data)
                        extracted_photos.append(basename)
        except zipfile.BadZipFile:
            from core.schemas import single_response
            return single_response({
                "status": "error",
                "error": "invalid_zip",
                "archive": zip_name,
            })

        final_files: list[str] = []
        for jp in tmp_json_paths:
            # 1) Fotos in Projektordner kopieren (ergaenzt FotoPfadServer in jp)
            try:
                _copy_photos_to_project(project_id, jp, tmp_photos_dir)
            except Exception as e:
                log.warning("Foto-Kopie fuer %s fehlgeschlagen: %s", jp.name, e)

            # 2) Falls Fotos nicht ins Projekt wanderten (kein Projektpfad):
            #    unbearbeitete Fotos in dfimport/photos/ puffern
            if tmp_photos_dir.exists():
                for src in tmp_photos_dir.iterdir():
                    dst = DFIMPORT_PHOTOS_DIR / src.name
                    if not dst.exists():
                        try:
                            shutil.copy2(str(src), str(dst))
                        except OSError as e:
                            log.warning("Foto-Puffer fehlgeschlagen: %s", e)

            # 3) JSON nach dfimport/progrp{OID}_{UUID}.json (atomar)
            final_name = _make_dfimport_filename(project_id)
            final_path = DFIMPORT_DIR / final_name
            tmp_final = DFIMPORT_DIR / (final_name + ".tmp")
            shutil.copy2(str(jp), str(tmp_final))
            shutil.move(str(tmp_final), str(final_path))
            final_files.append(final_name)

    from core.schemas import single_response
    return single_response({
        "status": "ok",
        "archive": zip_name,
        "size": len(content),
        "files": final_files,
        "photos": len(extracted_photos),
    })


@app.post("/api/projects/{project_id}/photos")
async def upload_photos(project_id: str, files: list[UploadFile] = File(...)):
    """Fotos von der App hochladen (multipart) -> dfimport/photos/ (Notfall-Puffer)."""
    photos_dir = DFIMPORT_PHOTOS_DIR
    photos_dir.mkdir(parents=True, exist_ok=True)

    saved = []
    for file in files:
        if not file.filename:
            continue
        target = photos_dir / file.filename
        content = await file.read()
        target.write_bytes(content)
        saved.append(file.filename)

    from core.schemas import single_response
    return single_response({"status": "ok", "saved": saved, "count": len(saved)})


# --- Abonnement-Verwaltung ---

@app.get("/api/subscriptions/{device_id}")
def get_subscriptions(device_id: str):
    """Abos eines Devices abfragen."""
    subs = _read_subscriptions()
    device = subs.get("devices", {}).get(device_id)
    if not device:
        return {"userName": "", "deviceName": "", "projects": []}
    return device


@app.put("/api/subscriptions/{device_id}")
async def put_subscriptions(device_id: str, body: dict):
    """Abos eines Devices speichern/aktualisieren."""
    subs = _read_subscriptions()
    if "devices" not in subs:
        subs["devices"] = {}

    subs["devices"][device_id] = {
        "userName": body.get("userName", ""),
        "deviceName": body.get("deviceName", ""),
        "lastSeen": datetime.now().isoformat(),
        "projects": body.get("projects", []),
    }

    _write_subscriptions(subs)
    from core.schemas import single_response
    return single_response({"status": "ok", "deviceId": device_id})


@app.get("/api/subscriptions")
def list_subscriptions():
    """Alle registrierten Devices und deren Abos (Admin-Übersicht)."""
    return _read_subscriptions()


# PWA ausliefern (same-origin): statische Dateien aus pwa/ neben der exe bzw. server.py
PWA_DIR = _script_dir / "pwa"
PWA_BF_DIR = PWA_DIR / "bf"
if PWA_BF_DIR.exists():
    app.mount("/bf", StaticFiles(directory=str(PWA_BF_DIR), html=True), name="pwa-bf")
if PWA_DIR.exists():
    app.mount("/", StaticFiles(directory=str(PWA_DIR), html=True), name="pwa")


if __name__ == "__main__":
    import os
    os.environ["NO_COLOR"] = "1"
    import uvicorn
    port = int(os.environ.get("EXCHANGE_PORT", "8080"))

    # SSL: Wenn cert.pem + key.pem neben der EXE/server.py liegen -> HTTPS
    ssl_certfile = _script_dir / "cert.pem"
    ssl_keyfile = _script_dir / "key.pem"
    ssl_kwargs = {}
    if ssl_certfile.exists() and ssl_keyfile.exists():
        ssl_kwargs = {"ssl_certfile": str(ssl_certfile), "ssl_keyfile": str(ssl_keyfile)}
        print(f"HTTPS aktiv (Zertifikat: {ssl_certfile})")
    else:
        print("HINWEIS: Kein SSL-Zertifikat gefunden -> HTTP-Modus (GPS im Browser blockiert)")
        print("         Zum Erzeugen: python generate_cert.py")

    uvicorn.run(app, host="0.0.0.0", port=port, access_log=True, **ssl_kwargs)
