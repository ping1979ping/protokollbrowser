# NeuesElement + ElementDetail Redesign — Design Spec

## Ziel

NeuesElement und ElementDetail werden für Outdoor-Nutzung auf Baustellen optimiert: höherer Kontrast, bessere Touch-Targets, kompakteres Layout. Beide Seiten bekommen die gleiche Feld-Reihenfolge und das gleiche visuelle System. Die wichtigsten Eingabefelder stehen oben, weniger wichtige unten.

## Viewport-Konzept

Die gesamte Seite füllt exakt `100vh`. Der Positionstext-Bereich wächst (`flex-grow: 1`) und füllt den verfügbaren Platz. Alle anderen Bereiche haben feste/minimale Höhen. Kein Scrollen auf NeuesElement nötig.

---

## Layout (von oben nach unten)

### 1. Header (kompakt, ~64px)

Gleiche Struktur wie ElementDetail: 2 Zeilen.

**Zeile 1:** 3 gleichbreite Nav-Buttons (`flex-1`)
- `← Übersicht` (ping-blue) — zurück zur Liste
- `✓ Speichern` (green-600) — speichern + zurück
- `+ Speichern & Neu` (ping-blue) — speichern + neues leeres Formular

**Zeile 2:** Info-Zeile
- StatusBadge (Neu) + Protokollname + "Neues Element"

**Entfernt:** Separater Button-Bar unterhalb des Headers (Buttons sind jetzt im Header).
**Entfernt:** "& Klonen"-Button (nur Speichern und Speichern & Neu).

### 2. Positionstext (flex-grow, füllt verfügbaren Platz)

- Prominentes Pflichtfeld ganz oben
- `textarea` mit `flex: 1` / `min-height: 6rem`
- Label: "Positionstext *" (dunkel, semibold)
- Border: 2px solid gray-300 (prominent, Outdoor-sichtbar)
- Container: weißer Hintergrund, abgerundete Ecken

### 3. Verantwortlich + Thema + Termin (eine Zeile)

3-Spalten-Grid: `flex:2 | flex:1 | flex:1`

**Verantwortlich (flex:2):**
- Dropdown-Format: `PING — PETTER INGENIEURE GmbH` (Kürzel + Bindestrich + Firma)
- Daten: `Verantwortlicher.Kuerzel` + ` — ` + `Verantwortlicher.Name`
- Value: `Verantwortlicher.ID` (OID)
- Border: 2px solid gray-300

**Thema (flex:1):**
- Select-Dropdown mit Themen-Vorschlägen + "+" Button für neue Themen
- Border: 2px solid gray-300

**Termin (flex:1):**
- Date-Input
- Rot + fett wenn überfällig
- Border: 2px solid gray-300

### 4. Status + Titel (eine Zeile)

2-Spalten-Grid: `flex:2 | flex:2` (gleiche Verhältnisse wie Zeile darüber: Status = Verantwortlich-Breite, Titel = Thema+Termin-Breite)

**Status (flex:2):**
- Links: Text "Status" + StatusBadge (z.B. "Neu")
- Rechts: `···`-Button der die erweiterte Status-Auswahl öffnet (Modal oder Expand)
- Bei Neuerstellung: Default = "Neu" (0), kein Erledigt-Button sichtbar
- Border: 1px solid gray-200 (weniger prominent als Hauptfelder)

**Titel (flex:2):**
- Input-Feld ohne Label/Überschrift
- Placeholder: "Titel (optional)"
- Border: 1px solid gray-200

### 5. Position + Bemerkung (eine Zeile)

2-Spalten-Grid: `flex:1 | flex:2`

**Position (flex:1):**
- Input ohne Überschrift
- Placeholder: "Position (auto)"
- Monospace-Font
- Border: 1px solid gray-200

**Bemerkung (flex:2):**
- Input ohne Überschrift
- Placeholder: "Optionale Bemerkung (intern)"
- Border: 1px solid gray-200

### 6. Standort + Fotos (eine Zeile, zwei Gruppen)

Eine Karte mit zwei visuell getrennten Bereichen:

**Links — Standort:**
- Mini-Label "STANDORT" (uppercase, gray-500, 9px)
- 3 Buttons: `📍 GPS` (ping-blue) | `🗺 Karte` (ping-blue) | `✕` (grau, nur sichtbar wenn GPS vorhanden)
- Darunter: Koordinaten-Text wenn vorhanden
- Auto-GPS Toggle integriert (kleiner Toggle + "Auto-GPS" Text)

**Rechts — Fotos:**
- Mini-Label "FOTOS" (uppercase, gray-500, 9px)
- 2 Buttons: `📷` (ping-blue, camera capture) | `🖼` (grau, Galerie-Upload)
- Foto-Badge: Runder gelber (amber-500) Kreis mit Anzahl, nur sichtbar wenn Fotos > 0
- Klick auf Badge öffnet Foto-Galerie-Modal mit Thumbnails + Lösch-Option

Border: 1px solid gray-200

### 7. Scroll-to-Top FAB

Auch auf NeuesElement — wenn Positionstext lang wird, scrollt die Seite.
Siehe globale FAB-Spezifikation weiter unten.

### 8. Entfernt

- **Schnelltyp** — komplett entfernt (war nur Thema+Status Vorauswahl)
- **Separater Auto-GPS Toggle** — integriert in Standort-Bereich

---

## Kontrast-Regeln (alle Komponenten)

| Element | Aktuell | Neu |
|---|---|---|
| Labels (Überschriften) | `text-[10px] text-gray-400 uppercase` | `text-xs text-gray-700 font-semibold` |
| Input-Borders (Hauptfelder) | `border border-gray-100` | `border-2 border-gray-300` |
| Input-Borders (Nebenfelder) | `border border-gray-100` | `border border-gray-200` |
| Placeholder-Text | `text-gray-300` | `text-gray-400` |
| Input-Text | `text-xs` | `text-sm` (13px) |
| Primär-Buttons | Bunt (grün/lila/blau/rot) | Einheitlich `bg-ping-blue text-white` |
| Sekundär-Buttons | Verschiedene grau | `bg-gray-100 text-gray-700 border border-gray-300` |
| Destruktive Buttons | `bg-red-500` | `bg-gray-100 text-gray-500 border` (dezent) |

---

## Scroll-to-Top FAB (Übersicht + ElementDetail)

- **Position:** Links unten (`bottom-3 left-3`)
- **Aussehen:** Weißer Kreis, blauer Pfeil ↑, blauer Rand (`bg-white text-ping-blue border-2 border-ping-blue`)
- **Größe:** `w-11 h-11` (44px, WCAG Touch-Target)
- **Shadow:** `shadow-lg`
- **Verhalten:** Erscheint erst nach Scrollen (>200px vom Top)
- **Seiten:** ProtokollUebersicht, ElementDetail, NeuesElement
- **Nicht kollidierend:** Links positioniert, weil rechts die FABs für Neu/Schnellerfassung sind

---

## ElementDetail — gleiches Layout-System

ElementDetail bekommt die gleiche Feld-Reihenfolge und Optik wie NeuesElement.

### Header (unverändert)

Bleibt wie bisher: 3 Nav-Buttons (Vorh./Übersicht/Nächst.) + Info-Zeile mit Status/Position/Protokollname. Darunter Speichern + Rückgängig Buttons. Funktioniert gut, kein Redesign nötig.

### Body — gleiche Reihenfolge wie NeuesElement

1. **Positionstext** — groß, prominent oben (bei editierbar: textarea, sonst: Anzeige-Text)
2. **Verantwortlich + Thema + Termin** — eine Zeile (flex:2|1|1), Kürzel-Format
3. **Status + Titel** — eine Zeile (flex:2|2), Status als Badge + ···-Button
4. **Position + Bemerkung** — eine Zeile (flex:1|2), Placeholder statt Label
5. **Standort + Fotos** — kombiniert in einer Zeile mit Mini-Labels

### Unterschiede zu NeuesElement

- Header: Vorh./Übersicht/Nächst. statt Übersicht/Speichern/Speichern&Neu
- Positionstext: Im Nicht-editierbar-Modus nur Anzeige (kein textarea)
- Vorgänger/Nachfolger-Navigation: Bleibt über dem Positionstext (wenn vorhanden)
- Bautagebuch-Button, Verschieben, Löschen: Bleiben am Ende (wenn editierbar)
- Status: Bei Bearbeitung sind alle Status-Optionen über ···-Button verfügbar (auch Erledigt)
- Auto-GPS Toggle: Nicht vorhanden (nur bei Neuerstellung)

### Kontrast + Button-Farben

Gleiche Regeln wie NeuesElement (siehe Kontrast-Regeln oben).

---

## Betroffene Dateien

| Datei | Änderungen |
|---|---|
| `app/src/components/NeuesElement.tsx` | Komplett-Redesign: Layout, Reihenfolge, Schnelltyp entfernt, Header kompakt, Viewport-Filling |
| `app/src/components/ElementDetail.tsx` | Redesign: Gleiche Feld-Reihenfolge, Kontrast, Standort+Fotos kombiniert, Scroll-to-Top FAB |
| `app/src/components/ProtokollUebersicht.tsx` | Scroll-to-Top FAB hinzufügen |
| `app/src/db.ts` | Verantwortlicher.Kuerzel im Dropdown bereitstellen (bereits vorhanden) |

---

## Nicht betroffen

- ExportScreen, ImportScreen, ServerImportScreen, SyncSettings, BautagebuchWizard, ProjektAuswahl, SchnellErstellung — keine Änderungen in diesem Redesign
- Datenmodell — keine Änderungen, alle Felder existieren bereits
- Server/Sync — keine Änderungen
