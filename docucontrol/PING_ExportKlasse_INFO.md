# PING_ExportKlasse — Universeller DOCUframe-Klassen-Exporter

## Zweck

Exportiert **alle Objekte einer beliebigen DOCUframe-Klasse** als paginierte JSON-Dateien im Hub-Format. Erkennt Felder, Typen und Referenzen automatisch per Introspection. BINARY-Felder werden uebersprungen.

Ziel: Stueckweises Extrahieren aller Daten aus DOCUframe in ein externes System.

## Aufruf

- **Funktion:** `PING_ExportKlasse( Dialog, Object )`
- **Trigger:** Manuell (Button/Menue in DOCUframe)
- **Konfiguration:** Drei Konstanten am Anfang des Makros aendern:

```
STRING ClassName = "Termin";     // Klasse die exportiert werden soll
INT PageSize = 500;              // Objekte pro Datei
STRING BaseDir = "K:\\Sonstige\\Docuframe-Exchange\\data\\dfexport\\extract";
```

## Output

**Verzeichnis:** `{BaseDir}\`
**Dateien:** `{ClassName}_001.json`, `{ClassName}_002.json`, ...

Jede Datei ist ein JSON-Array mit Manifest als erstem Element.

## JSON-Struktur

### Manifest (Element 0 jeder Seite)

```json
{
  "object_type": "manifest",
  "version": "hub",
  "klasse": "Termin",
  "timestamp": "13.04.2026 19:30:00",
  "total_count": 2500,
  "total_pages": 5,
  "page": 1,
  "page_size": 500,
  "_fields": {
    "Beginn": "TIME",
    "Ende": "TIME",
    "Betreff": "STRING",
    "Beschreibung": "STRING",
    "Ort": "STRING",
    "Benutzer": "OBJECT:User",
    "Teilnehmerliste": "SET:Ansprechpartner",
    ...
  }
}
```

Hinweis: `_fields` ist nur auf Seite 1 enthalten.

### Objekt-Records

```json
{
  "object_type": "Termin",
  "_oid": "ABC123DEF456...",
  "_klasse": "Termin",
  "Beginn": "15.04.2026 09:00:00",
  "Ende": "15.04.2026 10:30:00",
  "Betreff": "Baustellenbegehung Projekt 57123",
  "Ort": "Neumarkt",
  "Benutzer_oid": "XYZ789...",
  "Benutzer_name": "Petter",
  "Benutzer_kuerzel": "CP",
  "Ganztaegig": false,
  ...
}
```

## Feld-Konventionen

| Feldtyp | JSON-Darstellung |
|---------|-----------------|
| STRING | `"Wert"` |
| INT | `123` (als Number) |
| FLOAT | `45.67` (als Number) |
| BOOL | `true` / `false` |
| TIME | `"13.04.2026 10:00:00"` (nur wenn nicht leer) |
| BINARY | uebersprungen |
| OBJECT-Referenz | `{field}_oid`, `{field}_name`, `{field}_kuerzel` |
| OBJECTSET | `{field}_oids` (Array von OID-Strings) |
| Wertlisten-SET | `{field}` (Array von Werten) |

## Fortschrittsanzeige

WorkDlg mit 0-1000 Skala zeigt:
- Klassenname + aktueller Index / Total
- Aktuelle Seite / Gesamtseiten
- Trace-Ausgabe bei jedem Seitenwechsel

## Empfohlene Export-Reihenfolge

### Schicht 1 — Stammdaten (klein, schnell)
1. `User` (~50)
2. `UserGroup` (~20)
3. `FunktionelleRolle` (~20)
4. `Textbaustein` (~100)
5. `Produkt` (?)

### Schicht 2 — Kernstruktur (mittel)
6. `Termin` (~5.000?)
7. `Projekt` (~500, schon via separatem Export)
8. `Adresse` (~1.500, schon via separatem Export)
9. `Vorgang` (~10.000?)
10. `Notiz` (?)
11. `DocumentFolder` (~1.000)

### Schicht 3 — Massendaten (gross, PageSize evtl. reduzieren)
12. `Vorgangseintrag` (~50.000?)
13. `Dokument` (~100.000?, BINARY wird uebersprungen)
14. `EMail` (~50.000?)

### Schicht 4 — PING-spezifisch
15. `_PINGProtokollgruppe`, `_PINGProtokoll`, `_PINGProtokollelement`
16. `_PINGHonorar*` (6 Klassen)
17. `_PINGAufstellung*` (6 Klassen)
18. `_PINGGelegenheit*` (3 Klassen)
19. `_IMS*` (4 Klassen)

## Bekannte Einschraenkungen

- **DBALLSET-Iteration:** Verwendet `AS.Get(Obj, 1, START/CURRENT)` — falls DBALLSET dieses Pattern nicht unterstuetzt, muesste auf Query-basierte Iteration umgestellt werden
- **Kein Filter:** Exportiert ALLE Objekte. Fuer selektiven Export muesste eine Query ergaenzt werden
- **BINARY-Felder:** Werden komplett uebersprungen. Fuer Dokument-Inhalte (PDFs etc.) wird ein separater Binary-Exporter benoetigt
- **Grosse Klassen:** Bei >50.000 Objekten PageSize auf 200-300 reduzieren um Speicherprobleme zu vermeiden
- **Referenz-Aufloesung:** Name/Kuerzel wird per GetString("Name1"/"Name"/"Betreff") geholt — nicht alle referenzierten Objekte haben diese Felder

## Referenz

- **Vorlage:** `PING_ExportAllAdressen_Hub.dfm` (identisches Introspection-Pattern)
- **Alle 51 Klassen:** `objektmodell.md` in der docucontrol-Skill-Referenz
