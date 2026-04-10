# PINGProtGrpImpJSON — Hub-Format Import

## Zweck

Importiert JSON-Daten aus der Protokollbrowser-App zurueck nach DOCUframe.
Die App exportiert geaenderte und neue Protokolle/Protokollelemente im Hub-Format
(snake_case, UUID-basiert). Das Makro uebersetzt diese zurueck in DOCUframe-Objekte
und routet neue Elemente in das jeweils richtige Ziel-Protokoll.

## Signatur

```
INT PINGProtGrpImpJSON( STRING JsonText, STRING &ErrorMsg )
```

| Parameter | Typ | Beschreibung |
|---|---|---|
| `JsonText` | `STRING` | Vollstaendiger JSON-Text der Export-Datei |
| `ErrorMsg` | `STRING &` | Warnungen/Fehler werden zeilenweise angefuegt |
| Return | `INT` | `0` = Erfolg, `1` = kritischer Fehler (Abbruch) |

## JSON-Eingabeformat (Hub)

```json
[
  { "version": "hub", "gruppe_id": "Y3UN9", "gruppe_name": "Baustelle X" },
  {
    "object_type": "protokoll",
    "id": "ce3c8ee1-06f1-4ed2-a6c1-abfc399edf8c",
    "legacy_id": "",
    "Name": "Baustellennotiz 2 - 2026",
    "Datum": "08.04.2026 09:00:00",
    "Ort": "...",
    "Autor": "...",
    "Vorbemerkung": "...",
    ...
  },
  {
    "object_type": "protokollelement",
    "id": "uuid-elem-1",
    "legacy_id": "",
    "is_new": true,
    "is_modified": false,
    "protokoll_id": "ce3c8ee1-06f1-4ed2-a6c1-abfc399edf8c",
    "position": "1",
    ...
  }
]
```

**Wichtig:**
- Array-Element 1 = Manifest.
- Danach beliebige Mischung von `object_type: "protokoll"` und `object_type: "protokollelement"`.
- `protokoll_id` eines Elements ist die **App-UUID** des Protokoll-Blocks (nicht die OID).

## 5-Phasen-Architektur

### Phase 1: Parse & Validate
1. JSON parsen (`JSon.SetText`)
2. Manifest (Element 1) lesen → `gruppe_id`
3. Protokollgruppe per `FromOID(gruppe_id)` laden
4. Letztes Protokoll ermitteln (nur fuer Trace/Diagnose)

### Phase 2a: Protokoll-Routing (NEU ab 09.04.2026)

Baut das Mapping `App-UUID (protokoll_id)` → `DOCUframe-OID` auf. Fuer jeden
Protokoll-Block im JSON:

| Fall | Bedingung | Aktion |
|---|---|---|
| 1 | `legacy_id == ""` | `PINGProtMakeNewProt(ProtGrp, ProtNeu)` aufrufen, danach Name/Datum/Ort/Autor/Vorbemerkung/Nachbemerkung/Signatur aus JSON uebernehmen. Mapping eintragen. |
| 2 | `legacy_id` gefuellt, `FromOID` erfolgreich | Existierendes Protokoll (i.d.R. Anhangprotokoll). Metadaten **bleiben unangetastet**. Nur Mapping eintragen. |
| 3 | `legacy_id` gefuellt, `FromOID` schlaegt fehl | Fallback: `PINGProtMakeNewProt` rufen, Name erhaelt Suffix `" (Achtung aus fehlender OID {OID} hergestellt!)"`. Warning in `ErrorMsg`. |

### Phase 2b: Update (bestehende Elemente)

Fuer jedes `object_type == "protokollelement"` mit `legacy_id != ""` UND `is_modified == true`:
1. `Elem.FromOID(legacy_id)` + `LockRefresh`
2. Nur diese Felder werden aktualisiert:
   - `_Status`
   - Geo: `_PINGGeoLat`, `_PINGGeoLon`, `_PINGGeoAccuracy`, `_PINGGeoHeading`, `_PINGGeoText`, `_PINGGeoAltitude`
   - Mobile: `_PINGFotoAnzahl`, `_PINGFotoPfad`, `_PINGMobilErfasst`, `_PINGMobilUser`, `_PINGNotiz`, `_PINGInfo`, `_PINGMobilDatum`
3. `StoreUnlock` + UUID→OID-Mapping eintragen

Elemente mit `legacy_id` aber ohne `is_modified` werden uebersprungen — ihr
UUID→OID-Mapping wird trotzdem eingetragen (fuer Verweis-Aufloesung in Phase 4).

### Phase 3: Create (neue Elemente)

Fuer jedes Element mit `legacy_id == ""` UND `is_new == true`:

1. **Eltern-Protokoll nachschlagen**: `parentUuid = ItemJSon.protokoll_id` → Lookup in `ProtUuidKeys`/`ProtOidValues` → `parentOid`.
2. **Zielprotokoll laden**: `ZielProt.FromOID(parentOid)` + `LockRefresh`.
3. **Element anlegen**: `ElemNeu.Create()`, `ElemNeu._Protokoll = ZielProt` (wichtig! war in V1 vergessen), alle Felder aus JSON setzen.
4. `ElemNeu.Store()` + `ZielProt._Protokollelemente.AddObject(ElemNeu)` + `ZielProt.StoreUnlock()`.
5. UUID→OID-Mapping fuer Phase 4 eintragen.

Bei fehlendem `parentUuid` im Mapping oder nicht-ladbarem `parentOid`: Warning, Element uebersprungen.

### Phase 4: Link (Verweise)

Wie gehabt: UUID-basierte Verweise werden nachtraeglich ueber das Element-Mapping aufgeloest und via `Elem.Link(RefElem, "_Verweise")` gesetzt.

## ID-Konzept

| Feld | Inhalt | Verwendung |
|---|---|---|
| `id` | App-UUID (UUID4) | Interner Referenz-Key. Fuer Protokoll-Bloecke: wird in `ProtUuidKeys` gespeichert und aus Element-`protokoll_id` heraus nachgeschlagen. |
| `legacy_id` | DOCUframe-OID | Identifikation in DOCUframe (`FromOID`). Leer = neues Objekt. |
| `protokoll_id` (in Element) | App-UUID des Eltern-Protokolls | Routing in Phase 3 |

## Fehlerbehandlung

| Fehlertyp | Reaktion |
|---|---|
| JSON leer/ungueltig | Abbruch (`RETURN 1`) |
| `gruppe_id` fehlt | Abbruch (`RETURN 1`) |
| Protokollgruppe nicht gefunden | Abbruch (`RETURN 1`) |
| `PINGProtMakeNewProt` fehlgeschlagen | Warning, Protokoll uebersprungen |
| Protokoll-OID nicht gefunden | Fallback-Protokoll mit Warn-Marker im Namen |
| Element nicht gefunden (UPDATE) | Warning, uebersprungen |
| `parentUuid` nicht im Mapping | Warning, Element uebersprungen |
| Zielprotokoll nicht sperrbar | Warning, Element uebersprungen |
| Verweis-Ziel nicht im Mapping | Warning, Verweis uebersprungen |

## Abhaengigkeiten

- **`PINGProtMakeNewProt`** — benanntes Makro zum Anlegen neuer Protokolle (headless, keine UI)
- **App-Seite (`ExportScreen.tsx`)** — muss `object_type: "protokoll"` Bloecke senden und Elemente mit `protokoll_id` verknuepfen
- **Batch-Wrapper (`PINGProtGrpImportBatch_Hub.dfm`)** — ruft diesen Worker fuer jede `progrp*.json`

## Versionierung

| Version | Datum | Aenderung |
|---|---|---|
| Hub V1 | 02.04.2026 | Erstversion, 4-Phasen-Architektur |
| Hub V1.1 | 02.04.2026 | GETESTET, 9 Korrekturen (IsEmpty, FromOID-Patterns, Link, ToTime, AddSet, AddObject) |
| Hub V2 | 09.04.2026 | User-Fixes: `sVal.ToTime()` ueber TIME-Variable, GeoJSon-IF-Check entfernt |
| Hub V3 | 09.04.2026 | Phase 2a Protokoll-Routing NEU; Phase 3 nutzt Mapping statt einmaligem ProtNeu; `ElemNeu._Protokoll` wird explizit gesetzt; Aufruf `PINGProtMakeNewProt` statt Inline-Duplikation |

## Dateien

- Worker: `docucontrol/PINGProtGrpImpJSON_Hub.dfm`
- Benanntes Makro: `docucontrol/PINGProtMakeNewProt.dfm`
- Batch-Wrapper: `docucontrol/PINGProtGrpImportBatch_Hub.dfm`
- Info: `docucontrol/PINGProtGrpImpJSON_Hub_INFO.md` (diese Datei)
