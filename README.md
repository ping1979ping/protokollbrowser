# Protokoll-App (PETTER INGENIEURE)

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
2. **Projektauswahl** — Liste aller Protokollgruppen
3. **Protokolluebersicht** — Tabellarisch mit Tabs (Gesamt / einzelne Protokolle), Filter nach Status und Positionstext
4. **Elementdetail** — Anzeige/Bearbeitung, Navigation (vorheriger/naechster Punkt, Vorgaenger/Nachfolger)
   - Bestehende Elemente: nur Status aenderbar
   - Neue Elemente: alle Felder editierbar
5. **Neues Element** — Schnelltyp (Allgemein/Mangel/Info), alle Felder, GPS, Fotos
6. **Export** — ZIP mit JSON + Fotos fuer DOCUframe-Reimport

## Positionsnummern

- Automatisch generiert: hoechste bestehende Nummer + 1 (Ganzzahlen bevorzugt)
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
      types.ts            # TypeScript-Interfaces
      db.ts               # IndexedDB-Layer
      testdata.ts         # Testdaten
    dist/                 # Build-Output
  assets/                 # Corporate Design, Logo
  docucontrol/            # DOCUcontrol-Makros fuer DOCUframe
  .github/workflows/      # GitHub Actions (Pages-Deployment)
```

## Deployment

Push auf `master` loest automatisch GitHub Actions aus:
1. `npm ci && npm run build`
2. Deploy nach GitHub Pages

## DOCUframe-Integration

### Export (DOCUframe → App)
DOCUcontrol-Makro `Export_Protokollgruppe.txt` liest eine Protokollgruppe mit allen Protokollen und Elementen als JSON aus. Siehe `docucontrol/ANLEITUNG.txt`.

### Import (App → DOCUframe)
Die App exportiert ein ZIP mit `protocol_export.json` und Fotos. Das JSON enthaelt CREATE/UPDATE-Aktionen fuer Elemente. DOCUcontrol-Import-Makro (noch ausstehend) liest dieses JSON und legt neue Elemente an bzw. aktualisiert bestehende.
