# Handoff: Protokoll-App — Projektauswahl, Protokollgruppen & Protokollbrowser

## Overview
Mobile-first Smartphone-PWA-Design (PETTER INGENIEURE) für Baustellenprotokolle. Zwei zusammengehörige Prototypen:

1. **Protokollgruppen.dc.html** — Hauptflow:
   - „Meine Protokolle" (Abo-Startseite mit Sync-Status, Punkte-Bilanz, Drag&Drop-Sortierung per Kebab)
   - „Protokoll abonnieren" (Projekt-Akkordeon mit Mehrfach-Abo-Checkboxen + Suchfeld)
   - Projektauswahl (3 Layouts: Liste/Karten/Kacheln, Suchfeld)
   - Gruppenübersicht je Projekt (Abo-Toggle, Löschen nur bei leeren Gruppen, sonst Schloss)
   - Gruppen-Detail (Kennzahlen, Vorwort, Themen-Editor, Protokollliste, „Aktuelles Protokoll bearbeiten")
   - Neue Gruppe (Bottom-Sheet: Vorlage/Leer/CSV → Formular)
   - Protokoll anlegen (Basisdaten, Texte, Teilnehmer/Verteiler mit Personen-Picker + Drag&Drop zwischen Listen)
   - Protokollbrowser/Bearbeitungsmodus (Tabs Gesamt|Karte|Nr.|Bautagebuch, dunkelgraue Filterzeile mit Freitext + Status-Chips, Punkteliste, Element-Detail mit ◀ Übersicht ▶, Offen/Erledigt/···-Status, schwebende Speichern-Leiste)
   - Neuer Punkt / Schnellerstellung / Bautagebuch-Eintrag (Bottom-Sheets mit Themen-Chips Top-3+…, Mini-Monatskalender, Firmen-Beteiligtenliste, GPS/Karte/Kamera)

2. **IST-Protokollbrowser.dc.html** — Referenz-Nachbau des bestehenden DocuFrame-Protokollbrowsers (Login, Import, Projektauswahl, Übersicht, Element bearbeiten, Export), als IST-Zustand/Vergleich.

## About the Design Files
Die Dateien in diesem Paket sind **Design-Referenzen in HTML** (Design-Component-Prototypen) — sie zeigen Look & Verhalten, sind aber **kein Produktionscode**. Aufgabe ist es, diese Designs in der Zielumgebung der App (bestehende PWA / React) mit deren etablierten Patterns nachzubauen. Existiert noch keine Umgebung, ist React + Tailwind (kompilierte App-CSS, siehe `_ds/`) die naheliegende Wahl.

Die `.dc.html`-Dateien enthalten je ein `<x-dc>`-Template (Markup mit Inline-Styles, `{{ }}`-Holes, `<sc-if>`/`<sc-for>`) und eine `Component`-Logikklasse (State, Handler, abgeleitete Views) — daraus lassen sich Markup, Styles und Verhaltenslogik 1:1 ablesen.

## Fidelity
**High-fidelity.** Farben, Typo, Abstände, Radii und Interaktionen sind final gemeint und folgen dem verbindlichen Designsystem **PING Protokoll Design** (`_ds/ping-protokoll-design-…/`). UI pixelgenau mit den vorhandenen Tokens/Utilities umsetzen.

## Design System (verbindlich)
- Primär: PING-Blau `#004899` (`--color-ping-blue`), dunkel `#003366`, hell `#E6EEF7`
- Sekundär: PING-Gold `#B9791E` (Bautagebuch, „neu"-Badges), dunkel `#8A5A14`, hell `#F5EDE0`
- Seitenhintergrund: `#dfe4ea` (abgedunkeltes `--color-ping-bg`)
- Filterzeile im Protokollbrowser: dunkelgrau `#3d4654`
- Status NIE frei einfärben — `StatusBadge`-Komponente / STATUS_MAP verwenden:
  0 Neu (grau), 10 Offen (gelb), 11 Mangel-offen (rot), 17 Erledigt-Info (grau), 19 Freigegeben (blau), 20 Erledigt (grün), 21 Übertragen (grau), 25 Mangel-beseitigt (grün)
- Karten: weiß, `border-radius:16px`, Schatten `0 2px 8px rgba(15,23,42,.08)`
- Bottom-Sheets: `border-radius:26px 26px 0 0`, Grabber, Sticky-Header, primärer Sticky-Footer-Button
- Buttons: primär blau gefüllt (Radius 13–15px, Padding 15px), sekundär `bg-ping-blue-light text-ping-blue`, destruktiv rot `#dc2626`
- Touch-Ziele ≥ 44px; Schrift min. 11px (Meta) / 13–15px (Inhalt)
- Umlaute immer echt (nie „ue")
- Logo: `uploads/petter_logo_4c_versalabstand_25mm.png`

## Interactions & Behavior (Kernregeln)
- Navigation: Meine Protokolle → (Karte) Browser-Gesamtansicht | (Kebab-Klick) Gruppen-Detail | (Kebab-Drag) Sortierung
- Abo-Reihenfolge: Standard aufsteigend nach Projektnummer, manuelle Reihenfolge überschreibt
- Gruppe löschen nur wenn kein Protokoll Inhalte hat (sonst Schloss + Toast)
- Element-Detail: Statuswechsel setzt „dirty" → schwebende Leiste Rückgängig/Speichern, Pfeile gesperrt bis gespeichert; sonst kontextabhängige Aktionsleiste
- Filter (Freitext + Status) kombinieren sich mit Protokoll-Tab
- „Neuer Punkt": Pflichtfeld Positionstext; Position auto (nächste Hauptnummer .1); Themen Top-3 + „…"-Ausklapper + Freitext; Termin über Mini-Monatskalender; Verantwortlich = Firma aus Beteiligtenliste; GPS/Karte/Kamera-Block; „Punkt anlegen" sticky
- Schnellerstellung: Voreinstellungen (Text/Thema/Status/Termin/Verantwortlich) gelten für alle Foto-Punkte; leerer Text = Dateiname
- Sync: setzt alle „neu"-Zähler zurück, Zeitstempel „gerade eben"

## State Management (Prototyp)
Zentrale State-Keys in `Protokollgruppen.dc.html`: `screen` (abos|abonnieren|projekte|gruppen|detail|neuProtokoll|browser|element), `abos[]`, `aboOrder[]`, `gruppen{projektId:[…]}`, `browserTab`, `browserFilter`, `browserStatusFilter`, `elemStatus/elemDirty`, Sheets (`punktSheet`, `schnellSheet`, `btSheet`, `neuStep`). Demodaten (Projekte, Gruppen, Punkte, Personen/Firmen) stehen oben in der Logikklasse.

## Assets
- `uploads/petter_logo_4c_versalabstand_25mm.png` — Firmenlogo (4c)
- `_ds/ping-protokoll-design-…/_ds_bundle.js` + `styles.css` — Designsystem-Bundle (StatusBadge etc., Tokens, Utilities)

## Files
- `Protokollgruppen.dc.html` — Hauptdesign (alle Screens + Sheets)
- `IST-Protokollbrowser.dc.html` — IST-Referenz
- `_ds/…` — Designsystem
- `uploads/…` — Logo

Beide `.dc.html` sind direkt im Browser lauffähig (benötigen `support.js` + `_ds/` relativ im selben Ordner).
