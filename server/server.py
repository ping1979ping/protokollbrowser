"""
Protokollbrowser Exchange Server
Leichtgewichtiger HTTP-Server für Sync zwischen DOCUframe und PWA.

Verzeichnisstruktur:
  data/
    export/{ProjektId}/          DOCUframe → App
      protokolle.json
      manifest.json
    import/{ProjektId}/          App → DOCUframe
      changes_{timestamp}.json
      photos/
    archive/{ProjektId}/         Verarbeitete Dateien

Starten: uvicorn server:app --host 0.0.0.0 --port 8080
"""

import json
import os
import time
from pathlib import Path
from datetime import datetime

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

# Basis-Verzeichnis: data/ neben server.py, oder per Umgebungsvariable
DATA_DIR = Path(os.environ.get("EXCHANGE_DATA_DIR", Path(__file__).parent / "data"))
EXPORT_DIR = DATA_DIR / "export"
IMPORT_DIR = DATA_DIR / "import"
ARCHIVE_DIR = DATA_DIR / "archive"

# Verzeichnisse anlegen
for d in [EXPORT_DIR, IMPORT_DIR, ARCHIVE_DIR]:
    d.mkdir(parents=True, exist_ok=True)

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
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                info["projektName"] = manifest.get("projektName", projekt_dir.name)
                info["timestamp"] = manifest.get("timestamp")
                info["gruppeName"] = manifest.get("gruppeName")
            except (json.JSONDecodeError, OSError):
                info["projektName"] = projekt_dir.name

        # Pending changes (App → DOCUframe) zählen
        import_dir = IMPORT_DIR / projekt_dir.name
        if import_dir.exists():
            changes = list(import_dir.glob("changes_*.json"))
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
        data = json.loads(protokolle_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as e:
        raise HTTPException(500, f"Fehler beim Lesen: {e}")

    return data


@app.get("/api/projects/{project_id}/status")
def get_status(project_id: str):
    """Sync-Status: wann zuletzt exportiert, pending changes."""
    result = {"projectId": project_id}

    manifest_path = EXPORT_DIR / project_id / "manifest.json"
    if manifest_path.exists():
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            result["lastExport"] = manifest.get("timestamp")
        except (json.JSONDecodeError, OSError):
            pass

    import_dir = IMPORT_DIR / project_id
    if import_dir.exists():
        changes = sorted(import_dir.glob("changes_*.json"))
        result["pendingChanges"] = len(changes)
        if changes:
            result["lastUpload"] = changes[-1].stem.replace("changes_", "")
    else:
        result["pendingChanges"] = 0

    return result


@app.post("/api/projects/{project_id}/sync")
async def upload_changes(project_id: str, changes: dict):
    """Änderungen von der App hochladen."""
    import_dir = IMPORT_DIR / project_id
    import_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    changes_file = import_dir / f"changes_{timestamp}.json"

    changes_file.write_text(
        json.dumps(changes, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    return {"status": "ok", "file": changes_file.name, "timestamp": timestamp}


@app.post("/api/projects/{project_id}/photos")
async def upload_photos(project_id: str, files: list[UploadFile] = File(...)):
    """Fotos von der App hochladen (multipart)."""
    photos_dir = IMPORT_DIR / project_id / "photos"
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


# PWA ausliefern (same-origin): statische Dateien aus app/dist/
# Im Produktivbetrieb: PWA-Build hierhin kopieren
PWA_DIR = Path(__file__).parent / "pwa"
if PWA_DIR.exists():
    app.mount("/", StaticFiles(directory=str(PWA_DIR), html=True), name="pwa")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
