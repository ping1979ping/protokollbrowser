# PING_ExportAllAdressen_Hub — Adressen-Export im Hub-Format

## Zweck

Exportiert **alle Adressen** (inkl. Unterklassen) und **alle Ansprechpartner** aus DOCUframe als JSON-Datei im Hub-Format.
Wird von der Protokoll-App als Adressen-Nachschlageliste importiert (Teilnehmer, Verantwortliche, Projektleiter).

## Aufruf

- **Funktion:** `PING_ExportAllAdressen_Hub( Dialog, Object )`
- **Trigger:** Manuell (Button/Menue in DOCUframe) oder per Scheduler
- **Klassen:** `Adresse` (via AdresseAllSet) + `Ansprechpartner` (via AnsprechpartnerAllSet)
- **Query Adressen:** `Name1 != ""` (alle Adressen mit Name)
- **Query Ansprechpartner:** `Nummer != ""` (alle AP mit Nummer)

## Output

**Datei:** `K:\Sonstige\Docuframe-Exchange\data\dfexport\adressen.json`

## JSON-Struktur

Flaches Array mit vier Record-Typen:

### 1. Manifest Adressen (Element 0)

```json
{
  "object_type": "manifest",
  "version": "hub",
  "klasse": "Adresse",
  "timestamp": "13.04.2026 10:00:00",
  "count": 1523,
  "_fields": {
    "Name1": "STRING",
    "Name2": "STRING",
    "Kuerzel": "STRING",
    "Strasse": "STRING",
    "PLZ": "STRING",
    "Ort": "STRING",
    "Telefon": "STRING",
    "EMailAdresse": "STRING",
    ...
  }
}
```

### 2. Adress-Records

```json
{
  "object_type": "adresse",
  "_oid": "ABC123DEF456...",
  "_klasse": "Kunde",
  "Name1": "PETTER INGENIEURE GmbH",
  "Name2": "",
  "Kuerzel": "PING",
  "Nummer": "10010",
  "Strasse": "Industriestr.",
  "Hausnummer": "5",
  "PLZ": "92318",
  "Ort": "Neumarkt i.d.OPf.",
  "Telefon": "09181/...",
  "EMailAdresse": "info@...",
  ...
}
```

### 3. Manifest Ansprechpartner

```json
{
  "object_type": "manifest_ansprechpartner",
  "version": "hub",
  "klasse": "Ansprechpartner",
  "timestamp": "13.04.2026 10:00:00",
  "count": 3200,
  "_fields": { ... }
}
```

### 4. Ansprechpartner-Records

```json
{
  "object_type": "ansprechpartner",
  "_oid": "XYZ789...",
  "_parent_oid": "ABC123DEF456...",
  "_parent_name": "PETTER INGENIEURE GmbH",
  "Name1": "Petter",
  "Name2": "Christian",
  "Kuerzel": "CP",
  "Nummer": "20010",
  "Telefon": "09181/...",
  "EMailAdresse": "cp@...",
  "Funktion": "Geschaeftsfuehrer",
  ...
}
```

## Besonderheiten gegenueber Projekt-Export

| Projekt-Export | Adressen-Export |
|----------------|-----------------|
| 1 Klasse (Projekt) | 2 Klassen (Adresse + Ansprechpartner) |
| 1 Manifest | 2 Manifeste (manifest + manifest_ansprechpartner) |
| Kein `_klasse`-Feld | `_klasse` = tatsaechliche Unterklasse (Kunde, Lieferant, ...) |
| — | `_parent_oid` bei Ansprechpartner (Verweis auf Adresse) |
| — | `_parent_name` bei Ansprechpartner (Name1 der Adresse) |

## Adress-Unterklassen (via AdresseAllSet)

- **Adresse** (Basis)
- **Geschaeftspartner**
- **Hersteller**
- **Interessent**
- **Kunde**
- **Lieferant**
- **Mitarbeiter**

Alle werden ueber `AdresseAllSet` geladen. Das Feld `_klasse` (via `GetClassName()`) zeigt die tatsaechliche Unterklasse.

## Feld-Konventionen

Identisch mit Projekt-Export — siehe `PING_ExportAllProjekte_Hub_INFO.md`.

## App-Import

- **Endpoint:** `GET /api/addresses-catalog`
- **Funktion:** `downloadAddressCatalog()` in `syncService.ts`
- **Parser:** `parseAdressenJson()` in `adressenimport.ts`
- **IndexedDB:** Stores `adressen` + `ansprechpartner`

## Referenz

- **Vorlage:** `PING_ExportAllProjekte_Hub.dfm` (identisches Introspection-Pattern)
- **Plan:** `C:\Users\petterc\.claude\plans\effervescent-sparking-moth.md`
