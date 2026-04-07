# PING_ExportAllProjekte_Hub — Projekt-Export im Hub-Format

## Zweck

Exportiert **alle Projekte** aus DOCUframe als JSON-Datei im Hub-Format.
Wird von der Protokoll-App als Projekt-Nachschlageliste importiert.

## Aufruf

- **Funktion:** `PING_ExportAllProjekte_Hub( Dialog, Object )`
- **Trigger:** Manuell (Button/Menue in DOCUframe) oder per Scheduler
- **Klasse:** `Projekt`
- **Query:** `Nummer != ""` (alle Projekte mit Projektnummer)

## Output

**Datei:** `K:\Sonstige\Docuframe-Exchange\data\dfexport\projekte.json`

## JSON-Struktur

Flaches Array mit drei Record-Typen:

### 1. Manifest (Element 0)

```json
{
  "object_type": "manifest",
  "version": "hub",
  "klasse": "Projekt",
  "timestamp": "02.04.2026 15:30:00",
  "count": 187,
  "_fields": {
    "Nummer": "STRING",
    "Bezeichnung": "STRING",
    "_IMSStatus": "INT",
    "_IMSProjektleiter": "OBJECT:Ansprechpartner",
    "_Mitarbeiter": "SET:Ansprechpartner",
    ...
  }
}
```

### 2. Projekt-Records

```json
{
  "object_type": "projekt",
  "_oid": "ABC123DEF456...",
  "Nummer": "26001",
  "Bezeichnung": "Neubau Kinderkrippe Pilsach",
  "_IMSStatus": 3,
  "_IMSProjektleiter_oid": "DEF456...",
  "_IMSProjektleiter_name": "Huber, Markus",
  "_IMSProjektleiter_kuerzel": "HU",
  "_Auftraggeber_oid": "GHI789...",
  "_Auftraggeber_name": "Gemeinde Pilsach",
  ...
}
```

## Feld-Konventionen

| Typ | JSON-Key | Beispiel |
|-----|----------|---------|
| Projekt-OID | `_oid` | `"_oid": "ABC123..."` |
| STRING | Feldname | `"Nummer": "26001"` |
| INT | Feldname | `"_IMSStatus": 3` |
| FLOAT | Feldname | `"_Honorar": 125000.0` |
| BOOL | Feldname | `"_Aktiv": true` |
| TIME | Feldname | `"_Erstelldatum": "01.03.2026 10:00:00"` |
| OBJECT | `{feld}_oid` | `"_IMSProjektleiter_oid": "..."` |
| OBJECT (Name) | `{feld}_name` | `"_IMSProjektleiter_name": "Huber"` |
| OBJECT (Kuerzel) | `{feld}_kuerzel` | `"_IMSProjektleiter_kuerzel": "HU"` |
| OBJECTSET | `{feld}_oids` | `"_Mitarbeiter_oids": ["OID1", "OID2"]` |
| STRINGSET | `{feld}` (Array) | `"_Tags": ["Tag1", "Tag2"]` |
| INTSET | `{feld}` (Array) | `"_Phasen": [1, 3, 5]` |

## Denormalisierung bei Objekt-Referenzen

Fuer jedes OBJECT-Feld werden drei Keys geschrieben:

1. `{feld}_oid` — OID des referenzierten Objekts
2. `{feld}_name` — `Name1` oder `Name` des Objekts (falls vorhanden)
3. `{feld}_kuerzel` — `Kuerzel` des Objekts (falls vorhanden, typisch bei Ansprechpartner)

## App-Import

Die Protokoll-App importiert selektiv:

- **Felder:** `_oid`, `Nummer`, `Bezeichnung`, `_IMSStatus`, `_IMSProjektleiter_kuerzel/name/oid`
- **Filter:** Nur Projekte mit Status "in Arbeit" und "Gewaehrleistung" (ueber Werteliste)
- **Endpoint:** `GET /api/projects-catalog`
- **Funktion:** `downloadProjectCatalog()` in `syncService.ts`

## Introspection-API (verwendet)

| Funktion | Zweck |
|----------|-------|
| `DBCGetMembers("Projekt", members)` | Alle Member-Namen |
| `DBCIsMemberVisible(cls, name)` | Sichtbarkeit pruefen |
| `DBCIsMemberSet(cls, name)` | Ist es ein Set? |
| `DBCIsMemberObject(cls, name)` | Ist es eine Objekt-Referenz? |
| `DBCGetMemberTypeName(cls, name)` | Typ: STRING/INT/FLOAT/BOOL/TIME |

## Aenderungen gegenueber V2 (PING_ExportAllProjekte_standalone)

| V2 | Hub |
|----|-----|
| Output: `T:\Temp\...` | Output: `K:\Sonstige\Docuframe-Exchange\...` |
| Kein `object_type` | `"object_type": "manifest"` / `"projekt"` |
| Schema als eigener Record | Schema im Manifest (`_fields`) |
| `{feld}Oid` | `{feld}_oid` (Unterstrich) |
| `{feld}Oids` | `{feld}_oids` (Unterstrich) |
| Keine Denormalisierung | `_name` + `_kuerzel` fuer Objekt-Referenzen |
| TIME immer exportiert | TIME nur wenn nicht leer |
| Funktion: `PING_ExportAllProjekte` | Funktion: `PING_ExportAllProjekte_Hub` |

## Referenz

- **Spec:** `docs/superpowers/specs/2026-04-02-projekt-export-import-design.md`
- **Masterplan:** `masterplan_hub_v2.3.md`
