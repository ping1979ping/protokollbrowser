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

- **MobileErfassung**: Wird clientseitig angelegt, nicht aus DOCUframe
- ~~Verweise~~: Erledigt in V6 (Introspection exportiert `_VerweiseOids` generisch)

---

## Export V6 — Introspection + bereinigte Keys (01.04.2026)

V6 basiert auf dem **echten V5c-Introspection-Makro** (`PINGProtGrpExpJSON_V5c.dfm`,
DBCGetMembers). Entfernt die redundanten V4-Hardcoded-Arrays und benennt die
verbleibenden expliziten Keys Introspection-konform um.

### Redundante V4-Arrays entfernt

Die Introspection erzeugt diese Arrays bereits generisch:

| Entfernt (V4-Stil) | Introspection erzeugt stattdessen |
|---|---|
| `ProtIDArray` | `_ProtokolleOids` |
| `ElementIDArray` | `_ProtokollelementeOids` |
| `TeilnehmerArray` | `_TeilnehmerOids` |
| `VerteilerArray` | `_VerteilerOids` |
| `VerweisArray` | `_VerweiseOids` |

### Explizite Keys umbenannt

| V5c (hardcoded) | V6 (Introspection-konform) | Objekt |
|---|---|---|
| `ProtGrpID` | `_ProtokollgruppeOid` | Protokoll → Referenz auf Gruppe |
| `ProtokollId` | `_ProtokollOid` | Element → Referenz auf Protokoll |
| `ProjektId` (Nummer) | `ProjektNummer` | Gruppe → interne Projektnummer (kein OID!) |
| `ProjektId` (Manifest) | `ProjektOid` | Manifest → tatsaechliche Projekt-OID |

### Manifest aktualisiert

- `version: "v6"` (statt `"5c"`)
- `projektStammverzeichnis` hinzugefuegt
- `ProjektOid` statt `ProjektId`

### App-Kompatibilitaet

Parser liest V6-Keys bevorzugt mit Fallback auf V5c.

### Obsolete Dateien archiviert

Alte Export-Makros nach `docucontrol/archiv/` verschoben:
- `Export_Protokollgruppe.txt` (V1)
- `Export_Protokollgruppe aktuell.txt` (V4-Stil)
- `Export_Protokollgruppe_200326_.txt` (Produktiv-Hardcoded)
- `Export_Test_DFProtokolle.json`, `ANLEITUNG.txt`

### Dateien

- Makro: `docucontrol/Export_Protokollgruppe_v6.txt`
- Auf T: `T:\_Temp\CP\DOCUcontrol\PINGProtGrpExpJSON_V6.dfm`
- Info: `T:\_Temp\CP\DOCUcontrol\PINGProtGrpExpJSON_V6_INFO.md`

---

## Import_Protokollgruppe_v2 — Ueberarbeitung (26.03.2026)

### Version 2.1 — Systematische Korrektur gegen DOCUcontrol-Skill-Referenz

Das Import-Makro wurde gegen die DOCUcontrol-Skill-Referenz (`~/.claude/skills/docucontrol/`)
und die "Haeufige Fehler"-Tabelle geprueft und systematisch korrigiert.

#### Korrigierte Fehler

| # | Kategorie | Problem | Stellen | Fix |
|---|-----------|---------|---------|-----|
| 1 | **Datentyp** | `INTEGER` statt `INT` | 11x | Alle `INTEGER` → `INT` |
| 2 | **Compiler** | `RETURN;` innerhalb IF-Block | 1x (Z. 140) | `bAbort`-Flag + `IF(!bAbort)` um gesamten Rest |
| 3 | **Syntax** | Variablen-Deklaration mitten im Code | 6x | Alle an den Anfang verschoben |
| 4 | **API** | `.Load(oid)` — existiert nicht | 4x | → `.FromOID(oid)` |
| 5 | **API** | `.Save()` — existiert nicht | 3x | → `.Store()` bzw. `.StoreUnlock()` |
| 6 | **Sprache** | `CONTINUE;` — existiert nicht in DOCUcontrol | 5x | Durch IF-Verschachtelung ersetzt |
| 7 | **Pattern** | Kein Lock vor UPDATE-Schreibzugriffen | 1 Block | `LockRefresh(WRITE_NOWRITE, FLAT)` + `StoreUnlock()` |
| 8 | **API** | `TimeGetCurrTime(FALSE)` — unnoetiger Parameter | 1x | → `TimeGetCurrTime()` |

#### Neue Variablen (an den Anfang verschoben)

```
STRING GruppeOid;       // war: Deklaration in Z. 81
STRING VerantwOid;      // war: lokale Deklaration in UPDATE- und CREATE-Block
STRING FotoPfad;        // war: lokale Deklaration in UPDATE- und CREATE-Block
STRING ReadyFile;       // war: Deklaration im Cleanup-Block
STRING DoneFile;        // war: Deklaration im Cleanup-Block
BOOL bAbort = FALSE;    // neu: ersetzt RETURN-in-IF-Pattern
```

#### CONTINUE-Ersatz-Pattern

`CONTINUE` ist in DOCUcontrol nicht verfuegbar. Statt:
```
// ALT (falsch):
IF( !File.Valid() )
  nWarning = nWarning + 1;
  f = f + 1;
  CONTINUE;
ENDIF
// ... rest ...
```

Wird der Schleifenkoerper in einen IF-Block gepackt:
```
// NEU (korrekt):
IF( !File.Valid() )
  nWarning = nWarning + 1;
ELSE
  Txt = File.ReadAll();
  File.Close();
ENDIF
IF( File.Valid() )
  // ... rest der Verarbeitung ...
ENDIF
```

#### Lock-Pattern fuer UPDATE-Block

Bestehende Elemente werden jetzt korrekt gesperrt:
```
Elem.FromOID( ElemOid );
IF( Elem.IsValid() )
  Elem.LockRefresh( WRITE_NOWRITE, FLAT );   // Lock vor Aenderungen
  Elem._Status = ...;
  // ... weitere Aenderungen ...
  Elem.StoreUnlock( WRITE_NOWRITE, FLAT );    // Speichern + Lock freigeben
ENDIF
```

#### Referenz: DOCUcontrol-Skill

Vollstaendige Funktionsreferenz und Compiler-Regeln:
- Global: `C:\Users\petterc\.claude\skills\docucontrol\`
- Haeufige Fehler: `SKILL.md` → Tabelle "Haeufige Fehler"
- Sprachreferenz: `references/sprache.md`
- PING-Patterns: `references/ping-patterns.md`

## Dateipfad-Funktionen (aus Online-Hilfe)

Quelle: https://docs.gsd-software.com/Help/DOCUframe/6_1/de/ → Programmieren → Funktionen → Datei → Dateipfade

### FileGetSubDirs
```
VOID FileGetSubDirs(STRING Path, DBSTRINGSET &SubDirs)
```
Fuellt `SubDirs` mit allen Unterverzeichnissen von `Path`.
```
DBSTRINGSET SubDirs;
FileGetSubDirs( "C:\\Temp", SubDirs );
SubDirs.EditDlg();  // Anzeigedialog
```

### FileIsDir
```
BOOL FileIsDir(STRING Path)
```
`TRUE` wenn Verzeichnis existiert. Fuer Root-Verzeichnisse (`C:\`) stattdessen `FileIsDirOrRootDir` verwenden.

### FileHasSubDirs
```
BOOL FileHasSubDirs(STRING Path, BOOL Hidden = FALSE)
```
`TRUE` wenn `Path` Unterverzeichnisse enthaelt. `Hidden=TRUE` zaehlt versteckte mit.

### FileGetFileName
```
STRING FileGetFileName(STRING Path, BOOL MakeFullPath = TRUE)
```
Extrahiert den Datei-/Ordnernamen aus einem Pfad.
`"C:\\a\\b\\Archive.exe"` → `"Archive.exe"`

### FileGetDir
```
STRING FileGetDir(STRING Path, BOOL MakeFullPath = TRUE)
```
Extrahiert den Verzeichnisteil aus einem Pfad.
`"C:\\a\\b\\Archive.exe"` mit `FALSE` → `"\\a\\b\\"`

### FileCreatePath
```
VOID FileCreatePath(STRING Path)
```
Legt ein Verzeichnis an (inkl. aller Elternverzeichnisse).

### DBSTRINGSET
Rueckgabetyp von `FileGetSubDirs`. Iteration per Integer-Index:
```
DBSTRINGSET Items;
INTEGER i = 0;
INTEGER Anz = Items.GetCount();
WHILE( i < Anz )
  STRING Item = Items.Get( i );  // Get nimmt nur einen INT-Parameter
  // Item verarbeiten
  i = i + 1;
ENDWHILE
```
**Hinweis:** `DBSTRINGSET.Get(INT)` nimmt nur einen Parameter (Index), NICHT das 3-Parameter-Pattern `Get(Item, 1, START/CURRENT)` wie bei Objekt-Sets.

### String-Methoden (DOCUframe-spezifisch)
- `STRING.GetLength()` — Laenge (NICHT `.Length()`)
- `STRING.Left(INT n)` — Erste n Zeichen
- `STRING.ToStr()` — Nur fuer INT/FLOAT noetig, nicht fuer STRING
- Datentyp fuer Ganzzahlen: `INT` (NICHT `INTEGER`)

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
