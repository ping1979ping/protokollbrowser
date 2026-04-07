# FORGE Prevention Rules
> Automatisch verwaltet von /forge-sync | Nicht manuell bearbeiten
> Projekt: protokollbrowser | Initialisiert: 2026-04-07

---

<!-- Rules werden automatisch aus Bug-Mustern abgeleitet -->
<!-- Manuelle Rules: /forge-sync --add-rule "..." -->

## 2026-04-07: Exchange-Dateinamenschema

Alle Dateien, die der Exchange-Server für den DOCUframe-Import im Ordner
`dfimport/` ablegt, MUESSEN dem Schema `progrp{OID}_{UUID}.json` folgen
(OID = DOCUframe-Protokollgruppen-OID, UUID = `uuid.uuid4().hex`). Andere
Namen werden vom Batch-Wrapper `PINGProtGrpImportBatch_Hub` nicht
aufgegriffen. Keine Unterordner in `dfimport/` (flach). `done/`,
`archive/`, `photos/` sind reservierte Unterordner des Servers und
duerfen nicht als Projekt-OIDs benutzt werden.

## 2026-04-07: Dateiverzeichnisse dfimport/dfexport

`data/export/` und `data/import/{...}/ready|incoming|done/` sind veraltet
und duerfen nicht mehr geschrieben werden. Verwendung ausschliesslich
`data/dfexport/` (DF → App, per Projekt) und `data/dfimport/` (App → DF,
flach). Beim Deployment auf SvDocu alte Ordner beiseite legen (Suffix
`_legacy_YYYYMMDD`) bevor neue Version startet.
