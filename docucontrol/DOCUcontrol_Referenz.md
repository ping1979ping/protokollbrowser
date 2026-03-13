# DOCUcontrol Makro-Referenz

## Export_Protokollgruppe — Versionsvergleich

### Urspruenglicher Entwurf vs. aktueller Stand (13.03.2026)

#### JSON-Struktur

**Entwurf (flach):** Ein Array mit einem Eintrag pro Protokoll, Protokollgruppe wiederholt sich in jedem Eintrag.
```json
[
  { "Protokollgruppe": {...}, "Protokoll": {...}, "Protokollelemente": [...] },
  { "Protokollgruppe": {...}, "Protokoll": {...}, "Protokollelemente": [...] }
]
```

**Aktuell (hierarchisch):** Spiegelt die DOCUframe-Datenstruktur. Verantwortliche als eigenstaendiger Block.
```json
[
  { "Verantwortliche": [{ "Verantwortlicher": [
      { "ID": "6FTC", "Kürzel": "ZVJST", "Name": "Zweckverband..." },
      { "ID": "3W2Q", "Kürzel": "PING", "Name": "PETTER INGENIEURE GmbH" }
  ]}] },
  { "Protokollgruppe": [{
      "Id": "...", "Name": "...", ...,
      "Protokoll": [{
          "Id": "...", "Name": "...", ...,
          "Protokollelemente": [[
              { "Id": "...", "Position": "1", ... },
              { "Id": "...", "Position": "2", ... }
          ]]
      }]
  }] }
]
```

#### Wesentliche Aenderungen

| Thema | Entwurf | Aktuell | Bemerkung |
|-------|---------|---------|-----------|
| Struktur | Flach (Array von Paketen) | Hierarchisch (verschachtelt) | Protokolle innerhalb Protokollgruppe, Elemente innerhalb Protokoll |
| Verantwortliche | Nur am Element (Oid+Id+Name) | Eigener Top-Level-Block + Element-Referenz | Aus `Projekt.Vorgang.FunktionelleRollen` gelesen |
| VerantwortlicherId | Exportiert | Entfernt | `Nummer` nicht mehr benoetigt |
| Teilnehmer/Verteiler | Aktiv | Auskommentiert | Markiert als "noch nicht aktiv" |
| MobileErfassung | Exportiert (leer) | Auskommentiert | Wird nicht mehr initial angelegt |
| Themen | Exportiert | Auskommentiert | Ist ein STRINGSET, kein einfacher String |
| SELF vs Object | `SELF` | `Object` | DOCUcontrol-Kontextunterschied |
| Valid()-Check | Aktiv | Auskommentiert | "nicht notwendig" |
| Nummer/Status | `.SetNumber(x)` | `.SetNumber(x.ToFloat())` | Explizite Float-Konvertierung noetig |
| Projekt-Felder | `.Bezeichnung`, `.Stammverzeichnis` | `.Name`, `._PINGPfadProjektDokumenteExtern` | Korrekte DOCUframe-Feldnamen |

#### Verantwortliche (Firmen aus Projektrolle)

Die Verantwortlichen werden aus `ProtGrp._Projekt.Vorgang.FunktionelleRollen` gelesen:
- Typ: `FunktionelleRolleSet` → `FunktionelleRolle`
- Filtert mit `IsKindOfAddressNo()` — nur Eintraege die tatsaechlich Adressen sind
- Exportiert: `ID` (= Adresse.GetOID()), `Kürzel` (= Adresse.Kuerzel), `Name` (= Adresse.Name1)
- Am Protokollelement bleibt `VerantwortlicherOid` und `VerantwortlicherName` (= Firma, nicht Person)

#### Datums-Format

DOCUframe `EditFormatDateTime()` liefert deutsches Format:
- **Format**: `DD.MM.YYYY HH:MM:SS`
- **Leeres Datum**: `01.01.1601 00:00:00` (DOCUframe-Default)
- Die App muss dieses Format beim Import parsen und leere Daten erkennen

#### Datei-Kodierung

DOCUframe `FileWriteString()` schreibt **UTF-16LE** (mit BOM).
Die App muss beim Import UTF-16LE erkennen und konvertieren.

#### AddElement()-Muster

Im neuen Skript wird `AddElement()` an mehreren Stellen hinzugefuegt, um korrekte JSON-Arrays zu erzeugen:
```
GruppeJSon = PaketJSon.GetMember("Protokollgruppe", TRUE).AddElement();
ProtoJSon = GruppeJSon.GetMember("Protokoll", TRUE).AddElement();
ElemArray = ProtoJSon.GetMember("Protokollelemente", TRUE).AddElement();
```

Dies fuehrt zu verschachtelten Arrays (z.B. `"Protokollelemente": [[ {...}, {...} ]]`),
d.h. ein aeusseres Array (vom Member) und ein inneres Array (vom AddElement).

#### Noch offen

- **Teilnehmer/Verteiler**: Auskommentiert, spaeter aktivieren
- **Verweise (_Verweise Set)**: Noch nicht exportiert
- **MobileErfassung**: Wird clientseitig angelegt, nicht aus DOCUframe
- **Import-Makro**: Noch zu erstellen
- **Produktivpfad**: Umschalten von `T:\Temp\WEBE\` auf `C:\Temp\`

## DOCUframe Datenmodell (Referenz)

### Objekttypen
- `_PINGProtokollgruppe` — Protokollgruppe, gehoert zu einem Projekt (Vorgang)
- `_PINGProtokoll` — Einzelnes Protokoll innerhalb einer Gruppe
- `_PINGProtokollelement` — Einzelner Punkt innerhalb eines Protokolls
- `Adresse` — Firma/Person (Verantwortlicher)
- `FunktionelleRolle` — Projektrolle, verweist auf Adresse

### Wichtige Felder
- `_Verantwortlicher`: Typ `Adresse`, am Protokollelement — ist eine Firma, keine Person
- `_Verweise`: Typ `Set` von `_PINGProtokollelement`-OIDs — Vorgaenger-Verknuepfungen
- `_Status`: Integer (0=Neu, 10=Offen, 11=Mangel-offen, 19=Freigegeben, 20=Erledigt, 21=Uebertragen, 25=Mangel-beseitigt, 17=Erledigt-Info)
- `GetOID()`: Stabile, unveraenderliche Objekt-ID (nicht ExchangeID)
