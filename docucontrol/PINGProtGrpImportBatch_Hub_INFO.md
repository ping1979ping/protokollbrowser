# PINGProtGrpImportBatch_Hub — Batch-Wrapper fuer Hub-Import

## Zweck

Scheduler-Entry-Point fuer den Protokoll-Import von der App nach DOCUframe.
Der Wrapper scannt den zentralen Eingangsordner, verarbeitet jede Datei mit
dem Worker-Makro `PINGProtGrpImpJSON` und archiviert erfolgreich importierte
Dateien.

## Signatur

```
INT PINGProtGrpImportBatch_Hub( HDIALOG Dialog, DBOBJECT &Object )
```

| Parameter | Typ | Beschreibung |
|-----------|-----|-------------|
| `Dialog` | `HDIALOG` | Standard-Dialog-Handle (ungenutzt) |
| `Object` | `DBOBJECT &` | Standard-Kontext (ungenutzt) |
| Return | `INT` | `0` = Erfolg, sonst Fehler-Code |

## Ablauf

1. **Init** — Pfade aufbauen:
   - `BasePath = K:\Sonstige\Docuframe-Exchange\data\dfimport`
   - `DonePath = {BasePath}\done`
   - `LogPath  = {BasePath}\import.log`
   - `SearchMask = {BasePath}\progrp*.json`
2. **`done\` anlegen** (`FileCreatePath`)
3. **Scan** via `HFILEFIND.Start( SearchMask )`:
   - Fuer jede gefundene Datei:
     - `HFILE.Open( FilePath, FILE_MODE_READ )` + `ReadText()` → `JsonText`
     - Leere Dateien: nur loggen
     - `rc = PINGProtGrpImpJSON( JsonText, ErrorMsg )`
     - `rc == 0`: `FileRename` nach `done\{FileName}`, Log „OK"
     - `rc != 0`: Log-Eintrag mit `ErrorMsg`, Datei bleibt liegen
4. **Summary** — MessageBox mit `found/ok/fail/empty`
5. **Log-Abschlusszeile** in `dfimport\import.log`

## Dateinamensschema

Der Exchange-Server legt Uploads im Format

```
progrp{OID}_{UUID}.json
```

in `dfimport\` ab. `{OID}` ist die DOCUframe-OID der Protokollgruppe,
`{UUID}` ein hex-UUID4 ohne Bindestriche. Dieses Schema erlaubt
mehrere parallele Uploads je Gruppe, ohne Namenskonflikte.

## Dateistruktur auf dem Server

```
K:\Sonstige\Docuframe-Exchange\data\dfimport\
|
+-- progrp{OID}_{UUID}.json       ausstehende Imports (flach)
+-- done\
|   +-- progrp{OID}_{UUID}.json   erfolgreich importiert
+-- archive\
|   +-- progrp{OID}_{YYYYMMDD_HHMMSS}.zip
|                                 urspruengliche ZIP-Uploads (Backup)
+-- photos\                       Foto-Puffer (falls Projektpfad fehlt)
+-- import.log                    Import-Protokoll
```

## Log-Format

```
{DateZeit}  OK: progrp{OID}_{UUID}.json
{DateZeit}  FEHLER progrp{OID}_{UUID}.json: {ErrorMsg}
{DateZeit}  LEER oder nicht lesbar: progrp{OID}_{UUID}.json
{DateZeit}  BATCH {DateZeit} found=N ok=N fail=N
```

## Aufruf

**Manuell:**
- Im DOCUcontrol-Menue das Makro auswaehlen
- Die MessageBox am Ende zeigt die Zusammenfassung

**Scheduler:**
- Einen Zeitplan-Job in DOCUframe anlegen, der das Makro periodisch
  aufruft (z.B. alle 10 Minuten)
- Die MessageBox wird im Scheduler-Kontext ignoriert

## Fehlerbehandlung

| Situation | Reaktion |
|-----------|----------|
| Datei kann nicht geoeffnet werden | Log „LEER oder nicht lesbar", zaehlt als `empty` |
| `PINGProtGrpImpJSON` liefert `rc != 0` | Log mit `ErrorMsg`, Datei bleibt liegen, zaehlt als `fail` |
| `FileRename` nach `done\` fehlgeschlagen | Log, zaehlt als `fail` (Datei kann beim naechsten Run erneut verarbeitet werden — idempotent?) |
| Ordner `dfimport\` leer | `found=0`, Summary zeigt „nichts zu tun" |

> **Hinweis:** Der Worker `PINGProtGrpImpJSON` ist nicht idempotent — ein
> erneuter Durchlauf der gleichen Datei koennte Elemente doppelt anlegen.
> Dateien, die nach erfolgreichem Import nicht verschoben werden konnten,
> muessen manuell nach `done\` gezogen werden, bevor der Wrapper erneut
> laeuft.

## Abhaengigkeiten

- **`PINGProtGrpImpJSON_Hub.dfm`** — Worker (muss eingespielt sein)
- **Exchange-Server** — schreibt Dateien im korrekten Schema nach `dfimport\`
- **Netzlaufwerk K:** — muss vom DOCUframe-Host gemounted sein

## Dateien

- Makro: `docucontrol/PINGProtGrpImportBatch_Hub.dfm`
- Info: `docucontrol/PINGProtGrpImportBatch_Hub_INFO.md` (diese Datei)
- Worker: `docucontrol/PINGProtGrpImpJSON_Hub.dfm`
- Anleitung: `docucontrol/ANLEITUNG_Import.txt`
