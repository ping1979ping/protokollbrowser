# Protokollbrowser Exchange — Sync-Prozess

## Übersicht

Der Datenaustausch zwischen DOCUframe und der mobilen Protokoll-App läuft über einen Exchange-Server. Drei Systeme sind beteiligt:

- **DOCUframe** (Desktop, Büro) — führende Datenbank für alle Protokolle
- **Exchange Server** (Windows-Dienst auf SvDocu) — Dateidrehscheibe + PWA-Host
- **Protokoll-App** (PWA auf Handy/Tablet) — mobile Erfassung vor Ort

```
┌─────────────┐         ┌──────────────────┐         ┌─────────────┐
│  DOCUframe  │         │  Exchange Server  │         │ Protokoll-  │
│  (Desktop)  │         │    (SvDocu)       │         │  App (PWA)  │
│             │         │                   │         │             │
│  Export ──────────►  data/export/    ──────────►  Projekt laden  │
│  (Makro)    │   JSON  │  protokolle.json  │  HTTP   │  (Download) │
│             │         │                   │         │             │
│  Import ◄──────────  data/import/   ◄──────────  Änderungen    │
│  (Makro)    │   JSON  │  ready/           │  HTTP   │  hochladen  │
│             │         │  done/            │         │  (Upload)   │
└─────────────┘         └──────────────────┘         └─────────────┘
```

---

## Aus User-Sicht: Was muss ich tun?

### Ersteinrichtung (einmalig)

1. **App öffnen** im Browser: `http://svdocu:8080` (oder IP-Adresse im WLAN)
2. **Einstellungen** aufrufen:
   - Benutzer-Kürzel eintragen (z.B. `WEBE`)
   - Gerätename eintragen (z.B. `Peters iPhone`)
   - Server-URL ist automatisch gesetzt
3. **"Vom Server laden"** → Projekte auswählen → **"Abonnieren & laden"**
4. App zum Homescreen hinzufügen (PWA installieren)

### Wöchentlicher Ablauf

| Schritt | Wer | Was tun |
|---------|-----|---------|
| 1 | Büro (DOCUframe) | Export-Makro auf Protokollgruppe ausführen |
| 2 | Bauleiter (App) | "Vom Server laden" → abonnierte Projekte werden aktualisiert |
| 3 | Bauleiter (App) | Vor Ort: Elemente bearbeiten, GPS erfassen, Fotos machen |
| 4 | Bauleiter (App) | Zurück im WLAN: "Export" → ZIP wird an Server gesendet |
| 5 | Büro (DOCUframe) | Import-Makro läuft automatisch (alle 5 Min) oder manuell |

### Mehrere Bauleiter / Geräte

- Jeder Bauleiter hat sein eigenes Kürzel und seine eigenen Projekt-Abos
- Abos werden auf dem Server gespeichert (nicht auf dem Gerät)
- Mehrere Geräte pro Person möglich (jeweils eigene Geräte-ID)
- Bei Gerätewechsel: Einfach neu abonnieren, keine Daten gehen verloren

---

## Aus Datensicht: Was macht welches Programm?

### Phase 1: DOCUframe → Exchange Server (Export)

**Wer:** DOCUframe Export-Makro (`Export_Protokollgruppe_200326_.txt`)
**Wann:** Manuell oder zeitgesteuert im Büro
**Was passiert:**

```
DOCUframe
  │
  ├── Liest Protokollgruppe mit allen Protokollen + Elementen
  ├── Erzeugt JSON-Array (Verantwortliche + Gruppen + Protokolle + Elemente)
  ├── Schreibt: K:\...\data\export\{GruppeOID}\protokolle.json
  └── Schreibt: K:\...\data\export\{GruppeOID}\manifest.json
```

**Ergebnis im Dateisystem:**
```
data/export/
  1EUQ2V/                          ← Protokollgruppe (OID)
    protokolle.json                   Alle Protokolle + Elemente als JSON
    manifest.json                     Metadaten (Projektname, Timestamp)
  1CY6CY/
    protokolle.json
    manifest.json
```

### Phase 2: Exchange Server → App (Download)

**Wer:** PWA (Protokoll-App) über Exchange Server API
**Wann:** User klickt "Vom Server laden" oder "Abonnieren & laden"
**Was passiert:**

```
App (PWA)
  │
  ├── GET /api/projects              → Liste aller verfügbaren Projekte
  ├── GET /api/subscriptions/{id}    → Vorher abonnierte Projekte (Vorauswahl)
  ├── PUT /api/subscriptions/{id}    → Neue Auswahl speichern
  │
  ├── Für jedes ausgewählte Projekt:
  │   └── GET /api/projects/{id}/export  → protokolle.json herunterladen
  │       └── Parser: deutsche Feldnamen → App-Datenstruktur
  │           └── Speichern in IndexedDB (offline verfügbar)
  │
  └── Sync-Meta aktualisieren (lastSync Timestamp)
```

**Der Exchange Server liest dabei:**
- `data/export/{ProjektId}/protokolle.json` → liefert als JSON-Response
- `data/export/{ProjektId}/manifest.json` → für Projektname + Timestamp in der Liste

### Phase 3: Mobile Bearbeitung (offline)

**Wer:** Bauleiter mit der App vor Ort
**Wann:** Auf der Baustelle, ggf. ohne Netz
**Was passiert:**

```
App (PWA) — alles lokal in IndexedDB
  │
  ├── Elemente bearbeiten (Status, Bemerkung, Termin, Verantwortlicher)
  │   └── Flag: _geaendert = true
  ├── Neue Elemente anlegen
  │   └── Flag: _neu = true
  ├── GPS-Position erfassen (Breitengrad, Längengrad, Genauigkeit, Kompass)
  ├── Fotos aufnehmen und an Element anhängen
  └── Standort-Text automatisch oder manuell setzen
```

### Phase 4: App → Exchange Server (Upload)

**Wer:** PWA über Exchange Server API
**Wann:** User klickt manuell "ZIP exportieren" (bewusste Aktion, typisch 1x pro Woche nach Baustellenbegehung)
**Was passiert:**

```
App (PWA)
  │
  ├── Sammelt alle Elemente mit _geaendert=true oder _neu=true
  ├── Baut JSON mit: Aktion (UPDATE/CREATE), Felddaten, MobileDaten (GPS, Fotos)
  ├── Packt alles in ZIP: protocol_export.json + photos/
  ├── Speichert ZIP in IndexedDB als "Pending Export"
  │
  ├── Wenn Server sofort erreichbar:
  │   ├── POST /api/projects/{id}/upload-zip  → ZIP an Server senden
  │   └── _geaendert/_neu Flags löschen + Pending Export entfernen
  │
  └── Wenn Server NICHT erreichbar (z.B. auf der Baustelle):
      ├── ZIP bleibt als Pending Export in IndexedDB gespeichert
      ├── Lokaler Download als Backup (Browser-Download)
      └── Auto-Upload: App prüft alle 30 Sek ob Server erreichbar →
          sobald ja: Pending Exports werden automatisch hochgeladen
```

**Der User muss also nur 1x auf "Exportieren" klicken — den Upload erledigt die App automatisch.**

**Der Exchange Server macht dabei:**

```
Exchange Server
  │
  ├── Empfängt ZIP
  ├── Schreibt ZIP in:  data/import/{ProjektId}/incoming/  (Staging)
  ├── Entpackt ZIP:
  │   ├── JSON → data/import/{ProjektId}/ready/changes_zip_{timestamp}.json
  │   └── Fotos → data/import/{ProjektId}/ready/photos/
  └── ZIP-Archiv bleibt in ready/ als Backup
```

**Dateinamen-Schema:**
```
changes_{deviceId}_{timestamp}.json     ← bei JSON-Upload (sync-Endpoint)
changes_zip_{timestamp}.json            ← bei ZIP-Upload (entpackt)
```

Die DeviceId im Dateinamen stellt sicher, dass sich mehrere Geräte nie gegenseitig überschreiben.

### Phase 5: Exchange Server → DOCUframe (Import)

**Wer:** DOCUframe Import-Makro (`Import_Protokollgruppe.txt`)
**Wann:** Zeitgesteuert alle 5 Minuten oder manuell
**Was passiert:**

```
DOCUframe Import-Makro
  │
  ├── Scannt: data/import/{GruppeOID}/ready/
  │   └── Sucht nach: changes_*.json Dateien
  │
  ├── Für jede gefundene JSON-Datei:
  │   ├── Liest Elemente-Array
  │   ├── Für jedes Element:
  │   │   ├── UPDATE → Bestehendes Element in DOCUframe aktualisieren
  │   │   │   (Status, Termin, Bemerkung, Verantwortlicher, GPS-Daten)
  │   │   └── CREATE → Neues Element im neuen Protokoll anlegen
  │   │
  │   └── Verschiebt verarbeitete Datei:
  │       ready/changes_xxx.json  →  done/changes_xxx.json
  │
  └── Neues Protokoll wird in DOCUframe sichtbar
```

**Wichtig:** DOCUframe verschiebt Dateien von `ready/` nach `done/`. Dadurch wird jede Datei genau einmal verarbeitet.

---

## Verzeichnisstruktur im Detail

```
K:\Sonstige\Docuframe-Exchange\
│
├── protokoll-exchange.exe              Server-Programm
│
├── pwa/                                PWA-Dateien (vom Server ausgeliefert)
│   ├── index.html
│   ├── assets/
│   └── sw2.js                          Service Worker (Offline-Fähigkeit)
│
└── data/                               Alle Sync-Daten
    │
    ├── subscriptions.json              Geräte-Abos (welcher User, welche Projekte)
    │
    ├── export/                         ══ DOCUframe → App ══
    │   ├── 1EUQ2V/                     Protokollgruppe "Neubau Brunnen III"
    │   │   ├── protokolle.json            Alle Protokolle + Elemente (UTF-16LE)
    │   │   └── manifest.json              Projektname, Gruppenname, Timestamp
    │   ├── 1CY6CY/                     Protokollgruppe "Instandsetzung ZPW Aue"
    │   │   ├── protokolle.json
    │   │   └── manifest.json
    │   └── ...
    │
    ├── import/                         ══ App → DOCUframe ══
    │   ├── 1EUQ2V/
    │   │   ├── incoming/               Staging: Server schreibt hierhin
    │   │   │   └── (temporär, wird sofort nach ready/ verschoben)
    │   │   │
    │   │   ├── ready/                  Bereit für DOCUframe-Import
    │   │   │   ├── changes_a1b2c3_20260320_103000.json
    │   │   │   ├── changes_zip_20260320_110000.json
    │   │   │   ├── protocol_export_20260320_110000.zip  (Archiv)
    │   │   │   └── photos/
    │   │   │       ├── foto_001.jpg
    │   │   │       └── foto_002.jpg
    │   │   │
    │   │   └── done/                   Von DOCUframe verarbeitet
    │   │       ├── changes_a1b2c3_20260318_090000.json
    │   │       └── changes_zip_20260319_140000.json
    │   └── ...
    │
    └── archive/                        (reserviert für zukünftige Nutzung)
```

### Was liegt wo?

| Verzeichnis | Inhalt | Wer schreibt | Wer liest |
|-------------|--------|--------------|-----------|
| `export/{Id}/` | Aktuelle Protokolldaten | DOCUframe Export-Makro | Exchange Server → App |
| `import/{Id}/incoming/` | Temporär beim Upload | Exchange Server | Exchange Server (intern) |
| `import/{Id}/ready/` | Bereit zum Import | Exchange Server | DOCUframe Import-Makro |
| `import/{Id}/done/` | Bereits verarbeitet | DOCUframe Import-Makro | (Archiv, kann aufgeräumt werden) |
| `subscriptions.json` | Geräte + Projekt-Abos | Exchange Server | Exchange Server |

---

## Sicherheitsmechanismen

### Keine Endlosschleife
```
App ändert Element → _geaendert=true → Upload → Server
                     _geaendert=false (nach Upload gelöscht!)
DOCUframe importiert → exportiert neu → Server → App lädt
App sieht Daten, aber _geaendert ist false → kein erneuter Upload ✓
```

### Keine Überschreibung bei mehreren Geräten
```
Gerät A: changes_a1b2c3_20260320_103000.json
Gerät B: changes_e5f6g7_20260320_103500.json
→ Verschiedene Dateien, DOCUframe verarbeitet beide nacheinander
```

### Atomare Dateioperationen
```
Upload → incoming/ (Staging) → Validierung → ready/ (atomar verschoben)
DOCUframe liest nur aus ready/ → garantiert vollständige Dateien
```

### Last-Write-Wins bei Konflikten
Wenn zwei User dasselbe Element bearbeiten, gewinnt die letzte Änderung (chronologisch). In der Praxis selten, da jeder Bauleiter "seine" Punkte bearbeitet. DOCUframe hat immer den autoritativen Stand — der nächste Export korrigiert alle Geräte.

---

## Konfiguration

### Exchange Server

| Variable | Beschreibung | Standard |
|----------|--------------|----------|
| `EXCHANGE_DATA_DIR` | Pfad zum data/-Verzeichnis | `data/` neben exe |
| `EXCHANGE_PORT` | HTTP-Port | `8080` |

### DOCUframe Export-Makro

| Variable | Wert |
|----------|------|
| `ExchangeBasePath` | `K:\Sonstige\Docuframe-Exchange\data\export` |

### DOCUframe Import-Makro

| Pfad | Beschreibung |
|------|--------------|
| `K:\...\data\import\{GruppeOID}\ready\` | Hier liest das Makro |
| `K:\...\data\import\{GruppeOID}\done\` | Hierhin verschiebt es verarbeitete Dateien |
