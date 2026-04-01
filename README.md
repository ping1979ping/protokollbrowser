# Protokoll-App

Mobile PWA zur Protokollerfassung auf Baustellen mit DOCUframe-Anbindung.

## Uebersicht

Die App ermoeglicht das mobile Erfassen und Bearbeiten von Baustellenprotokollen auf Smartphone und Tablet. Sie arbeitet vollstaendig offline und synchronisiert ueber JSON-Export/Import mit DOCUframe.

## Tech-Stack

- **Frontend**: React + TypeScript + Vite
- **Styling**: Tailwind CSS v4 mit PING Corporate Design
- **Offline-Storage**: IndexedDB via `idb`
- **PWA**: Service Worker via `vite-plugin-pwa` (Workbox)
- **Export**: ZIP-Paket via `jszip` (JSON + Fotos)
- **Hosting**: GitHub Pages (HTTPS fuer PWA erforderlich)

## Datenmodell

### Protokollgruppe
Entspricht einer DOCUframe `_PINGProtokollgruppe`. Enthaelt Projektbezug (ProjektId, ProjektName) und Konfiguration (Vorwort, Nachwort, Themen).

### Protokoll
Entspricht einem `_PINGProtokoll`. Gehoert zu einer Protokollgruppe. Enthaelt Metadaten (Datum, Ort, Autor) sowie Teilnehmer- und Verteilerlisten.

### Protokollelement
Entspricht einem `_PINGProtokollelement`. Kernentitaet mit:
- **Position** (String, alphanumerisch sortiert, z.B. "1", "2", "3")
- **Positionstext** (Hauptinhalt)
- **Positionstitel** (optional, fuer Gestaltung)
- **Thema** (z.B. Tiefbau, Mangel, Info)
- **Status** (0=Neu, 10=Offen, 11=Mangel-offen, 19=Freigegeben, 20=Erledigt, 21=Uebertragen, 25=Mangel-beseitigt, 17=Erledigt-Info)
- **Termin**, **Bemerkung** (intern)
- **Verantwortlicher** (FirmaOid + FirmaName — Firma wird beim Reimport in DOCUframe ueber OID aufgeloest)
- **Verweise** (Array von OIDs — Vorgaenger-Elemente, ggf. protokolluebergreifend)
- **MobileErfassung** (GPS-Koordinaten, Fotos)

### Verantwortlicher (Firma)
Der Verantwortliche wird als Firma gespeichert (OID + Name). Es gibt keine Personen-Zuordnung. Beim Reimport in DOCUframe wird die Firma ueber ihre OID direkt aufgeloest.

## Screens

1. **Import** — JSON-Datei laden oder Testdaten
2. **Server-Import** — Projekte vom Exchange-Server laden (WLAN)
3. **Projektauswahl** — Liste aller Protokollgruppen
4. **Protokolluebersicht** — Tabellarisch mit Tabs (Gesamt / Karte / einzelne Protokolle), Filter nach Status und Positionstext
   - Invertierte aktive Tabs (blau/gold)
   - Aenderungs-Badge (orange) mit klickbarer Uebersicht aller geaenderten/neuen Elemente
   - Export-Button rot bei ausstehenden Aenderungen
5. **Elementdetail** — Anzeige/Bearbeitung, Navigation (vorheriger/naechster Punkt, Vorgaenger/Nachfolger)
   - Bestehende Elemente: nur Status aenderbar
   - Neue Elemente: alle Felder editierbar, Loeschen-Button
   - Bautagebuch-Eintraege: "Bautagebuch bearbeiten" Button oeffnet Wizard
   - Protokollname im Header sichtbar
6. **Neues Element** — Schnelltyp (Allgemein/Mangel/Info), alle Felder, GPS, Fotos
   - Positionstext auto-sizing (max halbe Bildschirmhoehe)
   - Sicherheitsabfrage bei "Zurueck" mit ungespeicherten Aenderungen
   - Kamera-Icon bei Foto-Hinzufuegen
7. **Bautagebuch-Wizard** — Strukturierter Eintrag mit Wetter (Open-Meteo API), Firmenliste mit Mitarbeiterzahl/Baustand, Vorbelegung aus letztem Eintrag (Fuzzy-Matching)
8. **Schnellerstellung** — Foto-Batch: Voreinstellungen setzen, beliebig viele Fotos aufnehmen, pro Foto ein Protokollpunkt mit EXIF-GPS-Extraktion
9. **Export** — ZIP mit JSON + Fotos fuer DOCUframe-Reimport
10. **Sync-Einstellungen** — Server-URL, Benutzer, Geraet, lokale Sicherungskopie (optional)

## Anhangprotokolle

Protokolle mit negativer Nummer (z.B. Bautagebuch, Mehrkosten, Qualitaetsmanagement):
- Direktes Einfuegen (kein Draft-Protokoll)
- Eigene fortlaufende Nummerierung innerhalb des Protokolls
- Klonen/Nachfolger bleiben im selben Protokoll
- Kein Auto-GPS (manuelle Erfassung moeglich)
- Titel statt "Nr. X" in Tab-Leiste

## Positionsnummern

- Normale Protokolle: hoechste Nummer ueber alle Protokolle + 1
- Anhangprotokolle: fortlaufend innerhalb des jeweiligen Protokolls, Schema wird erkannt (z.B. "BT-001" → "BT-002")
- Position ist ein String-Feld (alphanumerisch sortiert)
- Manuell ueberschreibbar

## Verweise (Vorgaenger/Nachfolger)

- `Verweise` ist ein Array von Element-OIDs (in DOCUframe ein Set von `_PINGProtokollelement`)
- Ermoeglicht protokolluebergreifende Navigation
- Beim Export werden Verweise als JSON-Array mitgegeben
- Beim DOCUframe-Import werden sie als Set-Eintraege angelegt

## Verzeichnisstruktur

```
protokollbrowser/
  app/                    # React-App (Vite)
    src/
      components/         # React-Komponenten
        BautagebuchWizard.tsx  # Bautagebuch-Wizard
        SchnellErstellung.tsx  # Foto-Batch-Erstellung
        map/              # Karten-Komponenten (Leaflet)
      weatherService.ts   # Open-Meteo Wetter-API
      exifGps.ts          # EXIF-GPS-Extraktion aus Fotos
      syncService.ts      # Exchange-Server Sync
      db.ts               # IndexedDB-Layer
      types.ts            # TypeScript-Interfaces
    dist/                 # Build-Output
  server/                 # Exchange Server (Python/FastAPI)
    server.py             # API-Server
    pwa/                  # Deployed PWA (fuer Server-Auslieferung)
    deploy_pwa.bat        # Build + Deploy nach server/pwa/
    deploy_github.bat     # Build + Deploy nach gh-pages
  assets/                 # Corporate Design, Logo
  docucontrol/            # DOCUcontrol-Makros fuer DOCUframe
  .github/workflows/      # GitHub Actions (Pages-Deployment)
```

## Deployment

### GitHub Pages
Push auf `master` loest automatisch GitHub Actions aus, oder manuell via `deploy_github.bat`.

### Exchange Server (WLAN)
`deploy_pwa.bat` baut mit `VITE_BASE=server` und kopiert nach `server/pwa/`. Der Exchange Server liefert die PWA aus.

## DOCUframe-Integration

### Export (DOCUframe → App)
DOCUcontrol-Makro `Export_Protokollgruppe.txt` liest eine Protokollgruppe mit allen Protokollen und Elementen als JSON aus. Siehe `docucontrol/ANLEITUNG.txt`.

### Import (App → DOCUframe)
Die App exportiert ein ZIP mit `protocol_export.json` und Fotos. Das JSON enthaelt CREATE/UPDATE-Aktionen fuer Elemente. DOCUcontrol-Import-Makro liest dieses JSON und legt neue Elemente an bzw. aktualisiert bestehende. Siehe `SYNC-PROZESS.md` fuer den vollstaendigen Ablauf.

### Exchange Server
Python/FastAPI-Server als Dateidrehscheibe zwischen DOCUframe und App. Laeuft als Windows-Dienst auf SvDocu, liefert die PWA aus und verwaltet den Datenaustausch. Siehe `SYNC-PROZESS.md`.
