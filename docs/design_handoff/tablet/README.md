# Handoff: Protokoll-App — Tablet-Ansicht (Master-Detail)

## Overview
Adaption der bestehenden Smartphone-PWA „Protokollgruppen" auf **Tablet-Format**. Die Tablet-Variante nutzt den zusätzlichen Platz für ein **Master-Detail-Layout** (Split-View) und legt die Bearbeitungs-Regeln für Protokolle/Punkte fest. Sprache der UI: **Deutsch**.

Die Datei umfasst den kompletten Flow: Meine Protokolle → Projektauswahl → Gruppenübersicht → Gruppen-Detail → Protokoll anlegen/bearbeiten → Protokoll-Browser (Punkteliste) + Punkt-Detail, plus Dialoge (Neue Gruppe, Neuer Punkt, Schnellerstellung, Bautagebuch, Person-Picker, Themen bearbeiten).

## About the Design Files
Die Dateien in diesem Bundle sind **Design-Referenzen, erstellt in HTML** — Prototypen, die Aussehen und Verhalten zeigen, **kein** Produktionscode zum direkten Kopieren. Aufgabe ist es, diese HTML-Designs in der bestehenden Umgebung des Zielprojekts nachzubauen (die Protokoll-App ist eine React-Anwendung; siehe gebundenes Design-System `ProtokollApp`) und dabei deren etablierte Patterns, Komponenten und Tokens zu verwenden.

Das Design ist als **Design Component (`.dc.html`)** gebaut: ein deklaratives Template + eine `Component`-Logikklasse. State-Handling und Ableitungen in `renderVals()` / `browserVals()` dienen als exakte Verhaltensspezifikation — sie zeigen, welche Ableitungen und Zustandsübergänge nötig sind, sind aber in React sauber neu zu implementieren.

## Fidelity
**High-fidelity (hifi).** Finale Farben (PING-Blau `#004899`, PING-Gold `#B9791E`), Typografie, Abstände und Interaktionen. Pixelgenau mit den bestehenden `ProtokollApp`-Komponenten und -Tokens (`var(--color-ping-*)`, Tailwind-Utilities aus der gelieferten CSS) nachbauen. Status niemals frei einfärben — `StatusBadge` verwenden.

## Kernkonzepte dieser Iteration (die „hier festgelegten Dinge")

### 1. Master-Detail statt Screen-Wechsel
- **„Meine Protokolle"** ist eine **eigenständige Vollbild-Seite** (Karten-Grid, `repeat(auto-fill, minmax(320px,1fr))`), **keine** dauerhafte Seitenleiste. Man wechselt nicht ständig zwischen Protokollen.
- Der **Protokoll-Browser** nutzt die volle Breite und zeigt links die **Punkteliste**, rechts das **Punkt-Detail** (Split-View). Zurück-Button „Meine Protokolle" oben links.
- Beim **Öffnen eines Protokolls** wird sofort der **oberste Punkt** aktiviert und die Detailansicht rechts eingeblendet (Querformat). Gibt es keine Punkte, öffnet nur die Liste.
- Split-Verhältnis Liste:Detail = **50 % / 50 %** im Querformat. Im Hochformat ersetzt das Detail die Liste (volle Breite).

### 2. Orientierung
- Umschalter **Querformat / Hochformat** oben. Frame-Maße: Querformat **1194×834**, Hochformat **834×1194** (iPad-Proportion), 14 px Bezel-Padding, Radius 32 px.
- Tweakbare Prop `orientierung` (`enum: "quer" | "hoch"`, default `"quer"`).
- Grids schalten je Orientierung: Gruppen/Karten/Detail/Proto-Formular = 2-spaltig im Quer-, 1-spaltig im Hochformat.

### 3. Bearbeitungs-Regeln (protokollweit!)
- **Maßgeblich ist ausschließlich, ob das Protokoll bereits verteilt ist** — NICHT der Status einzelner Punkte (offen/erledigt spielt hier keine Rolle).
- Als „aktuell / noch nicht verteilt" gilt das **neueste Protokoll** der Gruppe (höchste Nr., `lastNrE`). Alle älteren Protokolle gelten als **verteilt**.
- **Punkt-Detail:** Gehört der Punkt zum aktuellen (nicht verteilten) Protokoll → voll editierbar: Status, Positionstext (Textarea), Termin (Kalender-Popover), Verantwortlich (Beteiligten-Auswahl), Thema (Chips), Standort (GPS/Karte), Fotos (Kamera). Gehört er zu einem verteilten Protokoll → **schreibgeschützt**: Status nur als Badge, Text/Termin/Verantwortlich/Thema als reiner Text. Hinweisleiste oben: „Protokoll bereits verteilt — Punkt nicht mehr bearbeitbar".
- **Neuanlage von Punkten** nur in ein noch nicht verteiltes Protokoll: In den Tabs älterer (verteilter) Protokolle sind „Neuer Punkt"/„Schnell"/„BT" ausgeblendet; stattdessen Hinweis „Protokoll abgeschlossen — keine neuen Punkte". In „Gesamt" und im aktuellen Protokoll ist die Neuanlage möglich (Punkte landen im aktuellen Protokoll).

### 4. Weitere festgelegte Details
- **Protokoll-Browser-Kopfzeile:** rechts ein **⋮-Button**, der die Einstellungen der Protokollgruppe (Gruppen-Detail) öffnet.
- **Freitext-Filter** in der Filterleiste hat ein **✕ zum Löschen**, sobald etwas eingegeben ist.
- **Gruppen-Detail:**
  - Titel ergänzt um „(Protokollgruppe)"; Status-Badge aus der Kopfzeile **entfernt** (war dort irreführend).
  - Überschrift **„PROTOKOLLGRUPPE"** über der Meta-Karte, analog zu „PROTOKOLLE" über der Liste.
  - Protokoll-Liste **chronologisch rückwärts** (neueste zuerst).
  - Zwei Aktionen unten rechts: **„Letztes Protokoll bearbeiten"** (sekundär) + **„Neues Protokoll"** (primär).
  - Übersichtstabelle zeigt je Zeile einen **Versand-Check**: Badge „✓ verschickt" (grün `#eafaf0`/`#16803c`) bzw. „nicht verschickt" (gold `#fbf1e2`/`#8A5A14`). Das neueste Protokoll = nicht verschickt.
- **Protokoll bearbeiten:**
  - Button **„Protokollpunkte"** oben rechts (nur im Edit-Modus), wechselt zur Punkteliste.
  - **„Änderungen speichern"** erscheint nur, wenn tatsächlich etwas geändert wurde (Dirty-Flag `protoDirty`). Bei „Neues Protokoll" immer sichtbar.
- **Kalender-Aufklappungen** (Neuer Punkt, Schnellerstellung, Punkt-Detail) öffnen als **zentriertes Popover** über dem Bildschirm (Overlay, `position:absolute; inset:0; display:flex; align-items:center; justify-content:center`) — kein Scrollen nötig, Klick daneben schließt.
- **Textarea-Bindung:** Werte immer als `value`-Attribut binden (nicht als Element-Kind), sonst rendert „[object Object]".

## Screens / Views

### Meine Protokolle (Home)
- **Zweck:** Einstieg; abonnierte Protokollgruppen gebündelt.
- **Layout:** Blauer Header (`bg-ping-blue`, Titel 22 px/700, „Letzter Sync", Sync-Button). Scroll-Bereich mit Karten-Grid `repeat(auto-fill, minmax(320px,1fr))`, gap 12 px. Sticky-Footerzeile rechts: „Alle Projekte" (sekundär) + „Protokoll abonnieren" (primär).
- **Abo-Karte:** weiß, Radius 14 px, Projekt-Nr-Chip (`bg-ping-blue`), Projektname, Drag-Handle, Statuspunkt (gold=neu / grün=synchron), Gruppenname, „N Prot.", Badges „offen"/„erledigt", „aktualisiert"-Zeit. Aktive Karte (geöffnete Gruppe) mit `box-shadow: 0 0 0 2px #004899` + `#eef4fb`.

### Projektauswahl
- Header mit Suchfeld (320 px, im Header-Blau). Layout-Umschalter Liste/Karten/Kacheln. Listenzeilen mit Akzentbalken (blau=sync ok / gold=offen), Karten 2-spaltig (quer) mit Stat-Kacheln, Kacheln `minmax(210px,1fr)`.

### Gruppenübersicht
- Grid der Gruppen (2-spaltig quer). Karte: Name, Bemerkung, Ablagepfad (mono), `StatusBadge`, Abo-Toggle, Stat-Zeile (Protokolle/Themen), Löschen/Sperre. Sticky „Neue Gruppe" unten rechts.

### Gruppen-Detail
- 2 Spalten (quer): links Meta-Karte (Stats, Vorwort, Themen-Chips, Ablage/Ersteller) + „Aktuelles Protokoll bearbeiten"; rechts Protokoll-Tabelle (rückwärts, mit Fortschrittsbalken + Versand-Badge). Kopf: Titel „{Gruppe} (Protokollgruppe)", darüber „PROTOKOLLGRUPPE"/„PROTOKOLLE". Aktionen unten rechts: „Letztes Protokoll bearbeiten" + „Neues Protokoll".

### Protokoll anlegen / bearbeiten
- 2 Spalten (quer): links Basisdaten + Texte + Einzelprotokoll-Toggle; rechts Teilnehmer + Verteiler (Drag & Drop zwischen den Listen). Edit-Modus: „Protokollpunkte"-Button im Header, „Änderungen speichern" nur bei Dirty.

### Protokoll-Browser + Punkt-Detail (Split)
- Kopf: Gruppenname + Projekt, ⋮-Einstellungen. Tab-Leiste (Gesamt/Karte/Nr.n/Bautagebuch). Filterleiste (`#3d4654`): Freitext (mit ✕) + Status-Filter.
- Links Punkteliste (Zeilen: Position mono + Thema + Prot-Nr, Text 3-zeilig geklemmt, Status-Badge + Termin + Verantwortlich). Aktive Zeile hervorgehoben. Sticky-Aktionsleiste (BT/Schnell/Neuer Punkt) — nur wenn Protokoll nicht verteilt.
- Rechts Punkt-Detail (50 % quer): Nav (‹ Übersicht ›), Pos-Label; editierbare bzw. schreibgeschützte Felder je nach Verteilstatus; Rückgängig/Speichern-Leiste bei Änderungen.

## Interactions & Behavior
- **Navigation** über `screen`-State: `abos | projekte | gruppen | detail | neuProtokoll | browser | element | abonnieren`.
- **Protokoll öffnen** → obersten Punkt aktivieren, `screen:'element'` (quer) bzw. Liste (keine Punkte).
- **Kalender** als modales Popover (Overlay), Klick daneben schließt.
- **Drag & Drop:** Abo-Karten sortierbar; Teilnehmer/Verteiler zwischen Listen verschiebbar.
- **Dirty-Tracking:** `protoDirty` (Protokoll-Formular), `elemDirty` (Punkt-Detail) steuern Sichtbarkeit der Speichern-Aktionen.
- **Toast** unten zentriert, 2,6 s.
- Animationen: `fadein` .2s, `toastin` .25s, Toggle-Transitions .18s.

## State Management
- Top-Level: `orient`, `screen`, `projektId`, `gruppeId`, `layout`, `suche`, `abos[]`, `aboOrder[]`, `lastSync`.
- Protokoll: `proto{mode,nummer,datum,ort,autor,betreff,vortext,nachtext,signatur,einzel,teilnehmer[],verteiler[]}`, `protoDirty`, `personPicker`, `drag`.
- Punkt-Detail: `elemId`, `elemStatus`, `elemTextDraft`, `elemTerminDraft`, `elemVerantwDraft`, `elemThemaDraft`, `elemGeoDraft`, `elemFotosDraft`, `elemKal`, `elemVerantwOpen`, `elemThemenOpen`, `elemDirty`, `elemWeitere`.
- Browser: `browserTab` (`'gesamt' | 'karte' | 'bt' | <Nr>`), `browserFilter`, `browserStatusFilter`.
- Dialoge: `neuStep/neuVorlage/form`, `punktSheet`, `punktKal/punktVerantwOpen/punktThemenOpen`, `schnellSheet` (+ kal/verantw/themen), `btSheet`, `themenEdit/themenDraft`, `pendingDelete`, `toast`.
- **Abgeleitet:** `lastNrE` = höchste Protokoll-Nr = aktuelles/nicht verteiltes Protokoll. `elemEditierbar = el.protNr === lastNrE`. `punkteAnlegenErlaubt = !(browserTab ist Zahl && ≠ lastNrE)`. Versand: `verschickt = index < rows.length-1` (neueste Zeile = nicht verschickt).

## Design Tokens
- **Farben:** PING-Blau `#004899` (dark `#003366`/`#003472`, light `#e6eef7`), PING-Gold `#B9791E` (dark-text `#8A5A14`), BG `#dfe4ea`, Text `#1a1a2e`/mid `#5b6472`/light `#9aa3b0`. Erfolg grün `#16a34a`/`#16803c`/BG `#eafaf0`. Warnung/Gold-BG `#fbf1e2`. Fehler rot `#dc2626`/BG `#fef2f2`. Kartenschatten `0 2px 8px rgba(15,23,42,.08)`.
- **Status (StatusBadge):** 0 Neu, 10 Offen, 11 Mangel-offen, 17 Erledigt (Info), 19 Freigegeben, 20 Erledigt, 21 Übertragen, 25 Mangel-beseitigt. Farbmapping siehe `STATUS_MAP` in der Logik.
- **Radius:** Karten 14–16 px, Hero/rounded-2xl 18–22 px, Chips/Pills 99 px, Dialoge 22 px, Frame 32 px.
- **Typo:** System-UI; Titel 19–23 px/700, Body 13–14 px, Labels 11–12 px/600 uppercase letter-spacing .5–.6px, mono für Ablagepfade/Positionen.
- **Abstände:** Content-Padding 16–24 px, gap 8–14 px.
- **Frame:** quer 1194×834, hoch 834×1194, Bezel 14 px.

## Assets
Keine externen Bilddateien — alle Icons sind inline-SVG. Fotos/GPS sind Demo-Platzhalter. `StatusBadge` und weitere Komponenten stammen aus dem gebundenen Design-System `ProtokollApp` (`_ds_bundle.js` + `styles.css`).

## Files
- `Protokollgruppen Tablet.dc.html` — die Tablet-Design-Component (dieser Handoff).
- `Protokollgruppen.dc.html` — die ursprüngliche Smartphone-Variante (Referenz für Datenmodell & Detail-Logik).
- Design-System: `_ds/ping-protokoll-design-.../` (`styles.css`, `_ds_bundle.js`) im Projekt.
