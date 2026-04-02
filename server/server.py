"""
Protokollbrowser Exchange Server
Leichtgewichtiger HTTP-Server für Sync zwischen DOCUframe und PWA.

Verzeichnisstruktur:
  data/
    subscriptions.json             Abo-Verwaltung (Device -> Projekte)
    export/{ProjektId}/            DOCUframe -> App
      protokolle.json
      manifest.json
    import/{ProjektId}/            App -> DOCUframe
      incoming/                      Staging (Server schreibt)
      ready/                         Bereit für DOCUframe-Import
      done/                          Von DOCUframe verarbeitet

Starten: uvicorn server:app --host 0.0.0.0 --port 8080
"""

import json
import logging
import os
import re
import shutil
import sys
import time
from pathlib import Path
from datetime import datetime

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
EXPORT_DIR = DATA_DIR / "export"
IMPORT_DIR = DATA_DIR / "import"
ARCHIVE_DIR = DATA_DIR / "archive"
SUBSCRIPTIONS_FILE = DATA_DIR / "subscriptions.json"

# Projektordner-Basis für Foto-Ablage (Fuzzy-Suche Fallback)
PROJEKTE_BASE = Path(os.environ.get("PROJEKTE_BASE", "K:/projekte"))

# Verzeichnisse anlegen
for d in [EXPORT_DIR, IMPORT_DIR, ARCHIVE_DIR]:
    d.mkdir(parents=True, exist_ok=True)

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


def _copy_photos_to_project(project_id: str, changes_json_path: Path):
    """Fotos aus ready/photos/ in die Projektstruktur kopieren.

    Ziel: {ProjektPfad}\\Fotos\\{GruppeName}\\Protokoll {Nr}\\
    Ergänzt FotoPfadServer in der changes_*.json.
    """
    ready_dir = changes_json_path.parent
    photos_dir = ready_dir / "photos"
    if not photos_dir.exists() or not any(photos_dir.iterdir()):
        return  # Keine Fotos vorhanden

    # Manifest lesen für ProjektStammverzeichnis und GruppeName
    manifest_path = EXPORT_DIR / project_id / "manifest.json"
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
        log.warning("Kein Projektpfad für %s gefunden — Fotos bleiben in ready/photos/", project_id)
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
                src = photos_dir / foto.get("FileName", "")
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


def _update_index_json(ready_dir: Path):
    """index.json in ready/ aktualisieren mit Liste aller changes_*.json."""
    changes_files = sorted([f.name for f in ready_dir.glob("changes_*.json")])
    index_path = ready_dir / "index.json"
    index_path.write_text(
        json.dumps({"files": changes_files}, indent=2),
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


@app.get("/api/health")
def health():
    return {"status": "ok", "time": datetime.now().isoformat()}


@app.get("/api/projects")
def list_projects():
    """Liste aller verfügbaren Projekte (aus export/)."""
    projects = []
    if not EXPORT_DIR.exists():
        return projects

    for projekt_dir in sorted(EXPORT_DIR.iterdir()):
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

        # Pending changes (App -> DOCUframe) aus ready/ zählen
        ready_dir = IMPORT_DIR / projekt_dir.name / "ready"
        if ready_dir.exists():
            changes = list(ready_dir.glob("changes_*.json"))
            info["pendingChanges"] = len(changes)
        else:
            info["pendingChanges"] = 0

        projects.append(info)

    return projects


@app.get("/api/projects/{project_id}/export")
def get_export(project_id: str):
    """Protokolldaten eines Projekts herunterladen."""
    protokolle_path = EXPORT_DIR / project_id / "protokolle.json"
    if not protokolle_path.exists():
        raise HTTPException(404, f"Kein Export für Projekt {project_id}")

    try:
        data = read_json_auto_encoding(protokolle_path)
    except (json.JSONDecodeError, ValueError, OSError) as e:
        raise HTTPException(500, f"Fehler beim Lesen: {e}")

    return data


@app.get("/api/projects/{project_id}/status")
def get_status(project_id: str):
    """Sync-Status: wann zuletzt exportiert, pending changes."""
    result = {"projectId": project_id}

    manifest_path = EXPORT_DIR / project_id / "manifest.json"
    if manifest_path.exists():
        try:
            manifest = read_json_auto_encoding(manifest_path)
            result["lastExport"] = manifest.get("timestamp")
        except (json.JSONDecodeError, ValueError, OSError):
            pass

    ready_dir = IMPORT_DIR / project_id / "ready"
    if ready_dir.exists():
        changes = sorted(ready_dir.glob("changes_*.json"))
        result["pendingChanges"] = len(changes)
        if changes:
            result["lastUpload"] = changes[-1].stem.replace("changes_", "")
    else:
        result["pendingChanges"] = 0

    # Auch done/ für Gesamthistorie
    done_dir = IMPORT_DIR / project_id / "done"
    result["processedChanges"] = len(list(done_dir.glob("changes_*.json"))) if done_dir.exists() else 0

    return result


@app.post("/api/projects/{project_id}/sync")
async def upload_changes(project_id: str, changes: dict):
    """Änderungen von der App hochladen -> incoming/ -> ready/."""
    incoming_dir = IMPORT_DIR / project_id / "incoming"
    ready_dir = IMPORT_DIR / project_id / "ready"
    incoming_dir.mkdir(parents=True, exist_ok=True)
    ready_dir.mkdir(parents=True, exist_ok=True)

    device_id = changes.get("deviceId", "unknown")[:12]
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"changes_{device_id}_{timestamp}.json"

    # Erst in incoming/ schreiben, dann nach ready/ verschieben (atomar)
    incoming_file = incoming_dir / filename
    incoming_file.write_text(
        json.dumps(changes, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    shutil.move(str(incoming_file), str(ready_dir / filename))

    # index.json aktualisieren
    _update_index_json(ready_dir)

    return {"status": "ok", "file": filename, "timestamp": timestamp}


@app.post("/api/projects/{project_id}/upload-zip")
async def upload_zip(project_id: str, file: UploadFile = File(...)):
    """ZIP-Datei (JSON + Fotos) von der App hochladen -> entpacken -> ready/."""
    import zipfile
    import io

    incoming_dir = IMPORT_DIR / project_id / "incoming"
    ready_dir = IMPORT_DIR / project_id / "ready"
    incoming_dir.mkdir(parents=True, exist_ok=True)
    ready_dir.mkdir(parents=True, exist_ok=True)

    content = await file.read()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    # ZIP auch als Archiv behalten
    zip_name = f"protocol_export_{timestamp}.zip"
    zip_path = ready_dir / zip_name
    zip_path.write_bytes(content)

    # ZIP entpacken: JSON nach ready/, Fotos nach ready/photos/
    extracted = []
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            for name in zf.namelist():
                if name.endswith('/'):
                    continue
                data = zf.read(name)
                basename = Path(name).name

                if basename.endswith('.json'):
                    # JSON-Datei mit Timestamp umbenennen -> ready/
                    target_name = f"changes_zip_{timestamp}.json" if basename == "protocol_export.json" else basename
                    target = ready_dir / target_name
                    target.write_bytes(data)
                    extracted.append(target_name)
                else:
                    # Fotos -> ready/photos/
                    photos_dir = ready_dir / "photos"
                    photos_dir.mkdir(exist_ok=True)
                    (photos_dir / basename).write_bytes(data)
                    extracted.append(f"photos/{basename}")
    except zipfile.BadZipFile:
        # Kein gültiges ZIP — Datei bleibt trotzdem in ready/
        pass

    # Fotos in Projektstruktur kopieren + FotoPfadServer in JSON ergänzen
    json_files = [f for f in extracted if f.endswith('.json')]
    for jf in json_files:
        json_path = ready_dir / jf
        if json_path.exists():
            try:
                _copy_photos_to_project(project_id, json_path)
            except Exception as e:
                log.warning("Foto-Kopie für %s fehlgeschlagen: %s", jf, e)

    # index.json aktualisieren (Liste aller ausstehenden changes_*.json)
    _update_index_json(ready_dir)

    return {"status": "ok", "file": zip_name, "size": len(content), "extracted": extracted}


@app.post("/api/projects/{project_id}/photos")
async def upload_photos(project_id: str, files: list[UploadFile] = File(...)):
    """Fotos von der App hochladen (multipart) -> ready/photos/."""
    photos_dir = IMPORT_DIR / project_id / "ready" / "photos"
    photos_dir.mkdir(parents=True, exist_ok=True)

    saved = []
    for file in files:
        if not file.filename:
            continue
        target = photos_dir / file.filename
        content = await file.read()
        target.write_bytes(content)
        saved.append(file.filename)

    return {"status": "ok", "saved": saved, "count": len(saved)}


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
    return {"status": "ok", "deviceId": device_id}


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
