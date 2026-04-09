# PINGProtMakeNewProt

Benanntes Makro zum Anlegen eines neuen Protokolls in einer Protokollgruppe. Headless — keine UI.

## Signatur

```
INT PINGProtMakeNewProt( _PINGProtokollgruppe &Object, _PINGProtokoll &NeuesProtokoll )
```

| Parameter | Typ | Richtung | Beschreibung |
|---|---|---|---|
| `Object` | `_PINGProtokollgruppe &` | in/out | Parent-Protokollgruppe. Wird im Zuge von `LockRefresh` kurzzeitig gesperrt. |
| `NeuesProtokoll` | `_PINGProtokoll &` | out | Das neu angelegte Protokoll (bereits persistiert). Der Caller kann Metadaten nachtraeglich ueberschreiben. |
| Rueckgabe | `INT` | | `0` = Erfolg, `1` = Fehler (z.B. `LockRefresh` auf `Object` fehlgeschlagen) |

## Ablauf

1. **Datum:** `T = TimeGetCurrTime(FALSE)` — aktueller Zeitpunkt als Default. Kann vom Caller ueberschrieben werden.
2. **Inventur:** Durchlauf durch `Object._Protokolle` — trennt fortlaufende Protokolle (`_Nummer > 0`) von Anhangprotokollen (`_Nummer < 0`). Ermittelt `maxProtokolle`, `LetztesProtokoll` (das mit der hoechsten Nummer) und `AnzahlElementPositionen` (Summe aller Elemente ueber alle Protokolle).
3. **Create:** Neues Protokoll (nicht temporaer) mit `_Datum`, `_Nummer = maxProtokolle+1`, `_Protokollgruppe = Object` und automatisch generiertem `_Name` ("{Gruppe} {Nummer} - {Jahr}").
4. **Defaults uebernehmen** (wenn Vorgaenger gefunden): `_Autor`, `_Ort`, `_Signatur`, `_Vorbemerkung`, `_Nachbemerkung`, `_Teilnehmer`, `_Verteiler`.
5. **Position-Counter:** Die letzte Element-Position des Vorgaengers wird fortgeschrieben — z.B. `"A5"` → `"A6"`, `"5"` → `"6"`.
6. **Erstes Element:** Wenn mind. ein Element in der Gruppe vorhanden ist, wird ein leerer Platzhalter (`_Status=0`, mit Sonderbehandlung fuer Gruppen, deren Name "Baustelle" enthaelt) im neuen Protokoll angelegt. Andernfalls: Position `"1"`.
7. **Persist:** `Object.LockRefresh()` → `_Protokolle.RemoveAll()` → FOREACH `AddObject()` → `StoreUnlock()`. Abschliessend `NeuesProtokoll.Store()`.

## Aufrufer

- `PINGProtMakeNewProt_Button.dfm` — Click-Button auf dem DOCUframe-Formular (wrappt mit Datums-Dialog, MessageBox und Status-Konvertierung)
- `PINGProtGrpImpJSON.dfm` — Import-Worker (Phase 2a Protokoll-Routing), ueberschreibt anschliessend Metadaten aus dem JSON

## Wichtig

- **Keine `MessageBox`** — darf headless laufen, sonst blockiert der Batch-Import.
- **`_Datum` default = heute** — Caller soll bei abweichendem Datum nachtraeglich ueberschreiben (inkl. `_Name` mit korrekter Jahreszahl).
- **Rueckgabe pruefen** — bei `1` muss der Caller entscheiden (abbrechen / Warning / Retry).

## Version

| Version | Datum | Aenderung |
|---|---|---|
| 1.0 | 09.04.2026 | Erstversion, Extraktion aus dem Button-Makro PINGProtMakeNewProt (20.06.2024) |
