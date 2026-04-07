# FORGE Changelog
> Automatisch verwaltet

---

## 2026-04-07 — FORGE Initialisierung
- Projekt: protokollbrowser
- Stack: React + TypeScript + Vite (PWA), Python Server, DOCUcontrol Makros
- FORGE installiert mit: SKILL.md v1.0

## 2026-04-07 — dfimport/dfexport-Umstrukturierung + Batch-Import-Wrapper

**Was:**
- Server-Datenordner umbenannt und vereinfacht: `data/export/` → `data/dfexport/`,
  `data/import/{ProjektId}/ready|incoming|done/` → flach `data/dfimport/`.
- Neues Dateinamensschema fuer App-Uploads: `progrp{OID}_{UUID}.json` (OID = DOCUframe-OID
  der Protokollgruppe, UUID4 = Kollisionsschutz).
- `_update_index_json` entfernt (kein Index mehr noetig, DOCUframe scannt den Ordner direkt).
- ZIP-Uploads werden in `dfimport/archive/` aufbewahrt, Fotos wie gehabt in den Projektordner
  kopiert; JSON wandert atomar (`.tmp` → final) nach `dfimport/`.
- `upload_zip`, `upload_changes` (POST /sync), `get_status`, `list_projects` umgebaut auf das
  neue flache Layout.
- `install_service.bat` erzeugt neue Verzeichnisstruktur.

**DOCUframe-Makros:**
- **Neu:** `PINGProtGrpImportBatch_Hub.dfm` — Scheduler-Entry-Point, scannt `dfimport\progrp*.json`,
  ruft `PINGProtGrpImpJSON( JsonText, Err )` je Datei auf, verschiebt Erfolge nach `dfimport\done\`,
  loggt Fehler in `dfimport\import.log`.
- **Pfade aktualisiert:** `PING_ExportAllProjekte_Hub.dfm`, `Export_Protokollgruppe_v6.txt`,
  `ANLEITUNG_Import.txt` (umfassend neu geschrieben).
- **Kopien:** alle neuen/geaenderten Dateien nach `T:\_Temp\CP\DOCUcontrol\`.

**Deployment (SvDocu):**
- K:\Sonstige\Docuframe-Exchange\data: `export` → `export_legacy_20260407` + neu `dfexport`,
  `import` → `import_legacy_20260407` + neu `dfimport` (+ `done/`, `archive/`, `photos/`).
- Inhalte aus `export_legacy_*` (projekte.json + pro-Projekt-Exports) nach `dfexport/` kopiert.
- Neue EXE nach `E:\protokoll-exchange.exe`.
- PWA (layout-barrierefrei) nach `E:\pwa\bf\`, Manifest-Description mit neuem Timestamp
  fuer iPhone-SW-Update.

**Offen (User-Schritte):**
- Server auf SvDocu per `start-server.bat` wieder starten.
- In DOCUframe: Batch-Wrapper `PINGProtGrpImportBatch_Hub` einspielen und im Scheduler
  einplanen (z.B. alle 10 Minuten).
- Bestehenden Projekt-Katalog ggf. neu exportieren, damit `dfexport/projekte.json` frisch ist.
