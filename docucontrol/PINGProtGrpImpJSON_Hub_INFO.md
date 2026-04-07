# PINGProtGrpImpJSON — Hub-Format Import

## Zweck

Importiert JSON-Daten aus der Protokollbrowser-App zurueck nach DOCUframe.
Die App exportiert geaenderte und neue Protokollelemente im Hub-Format
(snake_case, UUID-basiert). Das Makro uebersetzt diese zurueck in
DOCUframe-Objekte.

## Signatur

```
INT PINGProtGrpImpJSON( STRING JsonText, STRING &ErrorMsg )
```

| Parameter | Typ | Beschreibung |
|-----------|-----|-------------|
| `JsonText` | `STRING` | Vollstaendiger JSON-Text der Export-Datei |
| `ErrorMsg` | `STRING &` | Referenz-Parameter, wird mit Warnungen/Fehlern gefuellt |
| Return | `INT` | `0` = Erfolg, `1` = kritischer Fehler (Abbruch) |

## JSON-Eingabeformat (Hub-Format, ab Version "hub")

```json
[
  {
    "timestamp": "02.04.2026 10:30:00",
    "version": "hub",
    "gruppe_id": "ABC123",
    "gruppe_name": "Baubesprechung Projekt X"
  },
  {
    "object_type": "protokoll",
    "id": "uuid-1234",
    "legacy_id": "DEF456",
    "Name": "Baubesprechung 5",
    ...
  },
  {
    "object_type": "protokollelement",
    "id": "uuid-5678",
    "legacy_id": "GHI789",
    "is_new": false,
    "is_modified": true,
    "status": 20,
    "mobile_erfassung": {
      "geo_lat": 48.1234,
      "geo_lon": 11.5678,
      "geo_accuracy": 5.0,
      "geo_heading": 180.0,
      "geo_text": "Baustelle Nord",
      "geo_altitude": 520.0
    },
    "verweise": ["uuid-aaaa", "uuid-bbbb"],
    ...
  },
  {
    "object_type": "protokollelement",
    "id": "uuid-neu-1",
    "legacy_id": "",
    "is_new": true,
    "is_modified": false,
    "position": "42",
    "positionstitel": "Neuer Mangel",
    "positionstext": "Riss in Wand B3",
    "status": 11,
    "verantwortlicher_legacy_id": "XYZ999",
    "mobile_erfassung": { ... },
    "verweise": ["uuid-5678"],
    ...
  }
]
```

## 4-Phasen-Architektur

### Phase 1: Parse & Validate

1. JSON parsen (`JSon.SetText`)
2. Manifest (Element 1) lesen → `gruppe_id` extrahieren
3. Protokollgruppe per `FromOID( gruppe_id )` laden
4. Letztes Protokoll ermitteln (hoechste `_Nummer`)

**Kritische Fehler (Abbruch):**
- JSON leer oder ungueltig
- `gruppe_id` fehlt im Manifest
- Protokollgruppe nicht in DOCUframe gefunden

### Phase 2: Update (bestehende Elemente)

Fuer jedes Element mit `legacy_id != ""` UND `is_modified == true`:

1. Element per `FromOID( legacy_id )` laden
2. `LockRefresh( WRITE_NOWRITE, FLAT )`
3. **Nur diese Felder werden aktualisiert:**
   - `_Status` (INT)
   - Geolocation: `_PINGGeoLat`, `_PINGGeoLon`, `_PINGGeoAccuracy`,
     `_PINGGeoHeading`, `_PINGGeoText`, `_PINGGeoAltitude`
   - Mobile-Metadaten: `_PINGFotoAnzahl`, `_PINGFotoPfad`, `_PINGMobilErfasst`,
     `_PINGMobilUser`, `_PINGNotiz`, `_PINGInfo`, `_PINGMobilDatum`
4. `StoreUnlock( WRITE_NOWRITE, FLAT )`
5. UUID→OID-Mapping eintragen

Elemente mit `legacy_id` aber ohne `is_modified` werden uebersprungen,
ihr UUID→OID-Mapping wird trotzdem eingetragen (fuer Verweis-Aufloesung).

### Phase 3: Create (neue Elemente)

Fuer Elemente mit `legacy_id == ""` UND `is_new == true`:

**Schritt 3a — Neues Protokoll (einmalig):**
- Name fortschreiben: letzte Zahl im Namen inkrementieren
  - "Baustellennotiz 5" → "Baustellennotiz 6"
  - "Protokoll 12" → "Protokoll 13"
- `_Nummer` = letzte Nummer + 1
- Alle Felder vom letzten Protokoll kopieren (Ort, Autor, Vorbemerkung,
  Nachbemerkung, Signatur, TeilnehmerAnmerkung, Teilnehmer, Verteiler)

**Schritt 3b — Elemente anlegen:**
- Alle Felder aus JSON setzen (Position, Positionstitel, Positionstext,
  Thema, Status, Bemerkung, Erinnerung, Wert, Termin, Verantwortlicher,
  Geolocation, Mobile-Metadaten)
- UUID→OID-Mapping eintragen

### Phase 4: Link (Verweise nachtraeglich)

Verweise (Nachfolger-Verknuepfungen) werden nachtraeglich gesetzt, weil
Ziel-Elemente beim Verarbeiten des Quell-Elements moeglicherweise noch
nicht existieren.

1. UUID-basierte Verweis-Liste durchlaufen
2. Jede UUID ueber das Mapping aufloesen → DOCUframe-OID
3. `Elem.Link( "_Verweise", RefElem )` setzen

## ID-Konzept

| Feld | Inhalt | Verwendung |
|------|--------|-----------|
| `id` | UUID4 (App-intern) | Interner Referenz-Key, fuer Verweis-Mapping |
| `legacy_id` | DOCUframe-OID | Identifikation in DOCUframe (`FromOID`) |
| `legacy_id == ""` | Neues Element | Wurde in der App erstellt, hat keine DOCUframe-OID |

## Fehlerbehandlung

| Fehlertyp | Reaktion |
|-----------|----------|
| JSON leer/ungueltig | Abbruch (`RETURN 1`) |
| Protokollgruppe nicht gefunden | Abbruch (`RETURN 1`) |
| Element nicht gefunden (`FromOID`) | Warnung, Element uebersprungen |
| Element nicht sperrbar (`LockRefresh`) | Warnung, Element uebersprungen |
| Verweis-Ziel nicht im Mapping | Warnung, Verweis uebersprungen |
| Verweis-Quelle nicht sperrbar | Warnung, Verweis uebersprungen |

Warnungen werden zeilenweise in `ErrorMsg` gesammelt. Am Ende steht eine
Zusammenfassung mit Zaehlerstaenden (Updates, Creates, Skipped, Verweise, Warnings).

## Abhaengigkeiten

### App-seitig (ExportScreen.tsx)

Der V5c-Export muss folgende Felder liefern:
- `object_type`: `"protokollelement"` oder `"protokoll"`
- `id`: UUID (App-intern)
- `legacy_id`: DOCUframe-OID (leer bei neuen Elementen)
- `is_new` / `is_modified`: Flags
- `mobile_erfassung`: verschachteltes Objekt mit Geo-Feldern
- `verantwortlicher_legacy_id`: DOCUframe-OID des Verantwortlichen
- `verweise`: Array von UUIDs

### Manifest (Element 1)

- `gruppe_id`: DOCUframe-OID der Protokollgruppe (NICHT UUID)

## Versionierung

| Version | Datum | Aenderung |
|---------|-------|-----------|
| Hub V1 | 02.04.2026 | Erstversion, 4-Phasen-Architektur |
| Hub V1.1 | 02.04.2026 | GETESTET in DOCUframe. 9 Korrekturen: IsEmpty statt IsValid, Create()+Parent statt Set.Add(), Link-Parameterreihenfolge, ToTime() statt SetDateTime, AddSet statt FOREACH/Link, AddObject fuer Parent-Set, HJSON-Pruefung per GetElement(1).IsNull() |

## Noch offen

- **Anhangprotokolle**: Neue Elemente mit `anhang: true` sollen in ein
  eigenes Anhang-Protokoll mit negativer Nummer kommen (Schritt 3c)
- **Protokoll-Block im JSON**: Falls ein Protokoll-Block mit Vorrang-Werten
  vorhanden ist, sollen dessen Werte statt der kopierten Werte verwendet werden

## Aufrufkontext

Dieses Makro ist der **Worker** und wird normalerweise nicht direkt
aufgerufen, sondern vom Batch-Wrapper
`PINGProtGrpImportBatch_Hub.dfm`. Der Wrapper scannt
`K:\Sonstige\Docuframe-Exchange\data\dfimport\progrp*.json`, liest jede
Datei und ruft diesen Worker mit dem JSON-Inhalt als STRING auf.
Erfolgreich verarbeitete Dateien werden vom Wrapper nach
`dfimport\done\` verschoben.

## Dateien

- Worker-Makro: `docucontrol/PINGProtGrpImpJSON_Hub.dfm`
- Batch-Wrapper: `docucontrol/PINGProtGrpImportBatch_Hub.dfm`
- Info: `docucontrol/PINGProtGrpImpJSON_Hub_INFO.md` (diese Datei)
- Spec: `docs/superpowers/specs/2026-04-02-import-makro-hub-design.md`
