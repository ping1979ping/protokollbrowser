# Feature: Karten- und GPS-Editor

## Motivation

Die Protokoll-App erfasst GPS-Koordinaten pro Protokollelement, zeigt diese aber bisher nur als Text an. Fuer die mobile Baustellenarbeit ist eine kartenbasierte Darstellung und Bearbeitung wesentlich nuetzlicher:

- **Verortung auf der Karte** — Punkte visuell auf dem Lageplan platzieren statt Koordinaten ablesen
- **Blickrichtung** — dokumentieren, in welche Richtung ein Mangel / ein Punkt zeigt
- **Uebersichtskarte** — alle Protokollpunkte eines Protokolls auf einer Karte sehen
- **Offline** — auf der Baustelle oft kein stabiles Internet

---

## 1. Technische Architektur

### 1.1 Kartenbibliothek: Leaflet.js

| Kriterium | Leaflet.js | MapLibre GL | OpenLayers |
|-----------|-----------|-------------|------------|
| Bundle-Groesse | ~42 KB gz | ~200 KB gz | ~150 KB gz |
| Touch-Support | Exzellent | Gut | Gut |
| Offline-Tiles | Einfach (raster) | Komplex (vector+style) | Einfach |
| React-Integration | react-leaflet v5 | react-map-gl | rl-layers (unreif) |
| iOS Safari | Stabil | WebGL-Probleme auf aelteren iPads | Stabil |
| DXF-Layer (spaeter) | via GeoJSON-Overlay | via GeoJSON-Source | nativ moeglich |

**Entscheidung:** Leaflet.js mit `react-leaflet` v5.

**Pakete:**
```bash
npm install leaflet react-leaflet
npm install -D @types/leaflet
```

### 1.2 Offline-Kacheln: Service Worker Cache

Die App nutzt `vite-plugin-pwa` mit Workbox. Kartenkacheln werden ueber `runtimeCaching`-Regeln automatisch gecacht:

```ts
// vite.config.ts — workbox-Konfiguration
runtimeCaching: [
  {
    urlPattern: /^https:\/\/[abc]\.tile\.openstreetmap\.org\//,
    handler: 'CacheFirst',
    options: {
      cacheName: 'map-tiles-osm',
      expiration: { maxEntries: 5000, maxAgeSeconds: 30 * 24 * 60 * 60 },
      cacheableResponse: { statuses: [0, 200] },
    },
  },
  {
    urlPattern: /^https:\/\/wmtsod\d\.bayernwolke\.de\//,
    handler: 'CacheFirst',
    options: {
      cacheName: 'map-tiles-bayern',
      expiration: { maxEntries: 5000, maxAgeSeconds: 30 * 24 * 60 * 60 },
      cacheableResponse: { statuses: [0, 200] },
    },
  },
],
```

**Funktionsweise:**
- Beim Panning/Zoomen online werden Kacheln automatisch im Cache gespeichert
- Offline werden gecachte Kacheln aus dem Cache API geladen
- Kein Custom-TileLayer noetig — Workbox faengt die Fetch-Requests transparent ab
- LRU-Strategie: aelteste Kacheln werden bei Ueberschreitung des Limits entfernt

### 1.3 Offline-Cache-Manager (TileCacheManager)

Ueber den Button "Offline-Karten verwalten" in der Kartenuebersicht kann ein Projektgebiet gezielt gecacht werden:

- **Modus "Sichtbarer Bereich"**: cached den aktuellen Kartenausschnitt
- **Modus "Punkt + Radius"**: Klick auf die Karte + Radius-Slider (100–2000m)
- **Zoom-Bereich**: wahlbar von Zoom 10 bis 19
- **Layer-Auswahl**: OSM, Bayern Luftbild oder Bayern Topographisch
- **Fortschrittsanzeige**: Anzahl Kacheln und geschaetzter Speicherbedarf (~15 KB/Kachel)
- Kacheln werden in 6er-Batches parallel gefetcht; der Service Worker cached automatisch

**Testen:** DevTools → Application → Cache Storage → `map-tiles-osm` / `map-tiles-bayern`

### 1.4 Kartendienste (Layer-System)

Die App unterstuetzt drei Basiskarten, umschaltbar ueber ein Layer-Panel (oben rechts):

| Layer | URL-Pattern | maxNativeZoom | Format |
|-------|-----------|---------------|--------|
| OpenStreetMap | `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` | 19 | png |
| Bayern Orthophoto (Luftbild) | `https://wmtsod{s}.bayernwolke.de/wmts/by_dop/WebMercator/{z}/{x}/{y}.jpeg` | 19 | jpeg |
| Bayern Topographisch | `https://wmtsod{s}.bayernwolke.de/wmts/by_amtl_karte/WebMercator/{z}/{x}/{y}.png` | 19 | png |

**BayernAtlas-Details:**
- Subdomains: `1` bis `9` (z.B. `wmtsod3.bayernwolke.de`)
- Lizenz: CC BY 4.0 — Bayerische Vermessungsverwaltung (geodaten.bayern.de)
- maxZoom auf TileLayer: 20 (Leaflet skaliert Zoom-19-Tiles hoch)
- Transparenz-Slider (20–100%) fuer die aktive Basiskarte

**Zoom-Anzeige:** Ein kleines Overlay unten rechts zeigt die aktuelle Zoom-Stufe an (ZoomDisplay-Komponente).

---

## 2. Datenmodell-Erweiterung

### 2.1 Neues Feld: GeoHeading

```ts
// types.ts
export interface MobileErfassung {
  GeoLat: number | null;
  GeoLon: number | null;
  GeoAccuracy: number | null;
  GeoText: string | null;
  GeoHeading: number | null;   // NEU: Blickrichtung in Grad, 0=Nord, im Uhrzeigersinn
  Fotos: FotoRef[];
}
```

- Rueckwaertskompatibel: bestehende Daten haben kein `GeoHeading` → wird als `null` behandelt (kein Pfeil)
- Keine IndexedDB-Migration noetig (schemaless fuer Objekteigenschaften)

### 2.2 GeoText-Format (erweitert)

Bisherig: `"50.3245, 11.285 (5 m)"`

Neu (mit Heading): `"50.3245, 11.285 (5 m) ↗ 45°"`

---

## 3. Komponentenarchitektur

```
src/components/map/
  MapEditorModal.tsx      — Vollbild-Modal fuer Einzelelement-Bearbeitung
  MapOverview.tsx         — Uebersichtskarte aller Elemente
  DirectionMarker.tsx     — Benutzerdefinierter Marker mit Richtungspfeil + erweitertem Popup
  mapUtils.ts             — Koordinaten-Hilfsfunktionen, Bounds, Layer-Definitionen, Tile-Berechnung
  LayerControl.tsx        — Panel zum Umschalten der Basiskarte + Transparenz-Slider
  ZoomDisplay.tsx         — Zoom-Level-Anzeige auf der Karte
  TileCacheManager.tsx    — Offline-Bereich herunterladen (Viewport oder Punkt+Radius)
```

### 3.1 MapBase.tsx

Gemeinsame Basis fuer alle Kartenansichten:
- Leaflet `MapContainer` mit OSM-TileLayer
- Offline-Indikator-Overlay ("Offline — nur gecachte Kacheln verfuegbar")
- Leaflet-CSS-Import
- Akzeptiert `children` fuer Marker/Overlays
- Spaeter: optionale Overlay-Layer-Props fuer DXF-Plaene

### 3.2 MapEditorModal.tsx — Einzelelement-Editor

**Oeffnung:** Button "Karte" neben dem bestehenden "Erfassen"-Button im GPS-Bereich.

**Props:**
```ts
interface MapEditorModalProps {
  lat: number | null;
  lon: number | null;
  heading: number | null;
  onSave: (lat: number, lon: number, heading: number | null) => void;
  onCancel: () => void;
}
```

**Verhalten:**
1. Oeffnet sich als Vollbild-Overlay (`position: fixed; inset: 0`)
2. Karte zentriert auf:
   - Vorhandene Koordinaten (falls gesetzt), oder
   - Aktuelle Geraeteposition via `navigator.geolocation`, oder
   - Fallback: Deutschland-Mitte (51.1657, 10.4515)
3. Einzelner verschiebbarer Marker mit Richtungspfeil
4. Untere Leiste:
   - Koordinatenanzeige (live-aktualisiert beim Verschieben)
   - Richtungs-Slider (0°–359°) mit Gradanzeige
   - "Kompass"-Button (liest Geraetekompass via DeviceOrientationEvent)
   - "Speichern" / "Abbrechen" Buttons

**Wireframe:**
```
┌──────────────────────────────┐
│  ✕                           │  ← Schliessen-Button
│                              │
│         [Karte]              │
│            📍                │
│          ↗                   │
│                              │
│                              │
├──────────────────────────────┤
│ 50.3245° N, 11.2850° E      │
│ Richtung: [====●====] 45°  🧭│
│                              │
│  [Abbrechen]    [Speichern]  │
└──────────────────────────────┘
```

### 3.3 DirectionMarker.tsx — Marker mit Richtung

Benutzerdefinierter Leaflet `DivIcon` als inline-SVG:

```
     ▲  ← Pfeilspitze (rotiert nach GeoHeading)
    ╱ ╲
   ●───●  ← Kreis mit Positionsnummer
    3
```

- Kreis: 24px Durchmesser, Farbe nach Status (Offen=orange, Erledigt=gruen, etc.)
- Positionsnummer als Text im Kreis
- Pfeil/Chevron: zeigt in Blickrichtung, rotiert via CSS `transform: rotate(Xdeg)`
- Ohne Heading: einfacher Kreis ohne Pfeil
- Bei Einzelelement-Editor: groesserer Marker (32px)

### 3.4 MapOverview.tsx — Uebersichtskarte

**Zugang:** Neuer "Karte"-Tab in ProtokollUebersicht (neben "Gesamt" und den Protokollnummer-Tabs).

**Funktionen:**
- Zeigt alle Elemente mit GPS-Koordinaten als nummerierte Marker
- Auto-Zoom auf `featureGroup.getBounds()` beim Oeffnen
- Tap auf Marker: Popup mit Position + Positionstext (gekuerzt) + Status-Badge
- "Bearbeiten"-Toggle: aktiviert Drag-and-Drop fuer alle Marker
- "Positionen speichern"-Button: Batch-Update aller verschobenen Elemente in IndexedDB
- Bestehende Filter (Textsuche, Statusfilter) wirken auch auf Karte (nicht passende Marker werden ausgeblendet)
- Panel "X Elemente ohne Position" (einklappbar) fuer Elemente ohne GPS

**Wireframe:**
```
┌──────────────────────────────┐
│ ← Projekte              Export│  Header
├──────────────────────────────┤
│ Gesamt│Nr.1│Nr.2│Nr.3│ Karte │  Tabs (NEU: Karte)
├──────────────────────────────┤
│ [Suche...]  Alle Offen Erl.  │  Filter
├──────────────────────────────┤
│                              │
│    ①          ⑤              │
│        ③                     │
│                   ⑧          │
│  ②                           │
│           ④    ⑦             │
│                              │
├──────────────────────────────┤
│ ✎ Bearbeiten  [Positionen   │
│                speichern]    │
│ 3 Elemente ohne Position ▾   │
└──────────────────────────────┘
```

---

## 4. Integration in bestehende Screens

### 4.1 ElementDetail.tsx

Bisheriger GPS-Bereich (Zeilen 273-282):
```tsx
<label>GPS-Standort</label>
<button onClick={gpsErfassen}>Erfassen</button>
{elem.MobileErfassung.GeoText || "Kein Standort"}
```

Neuer GPS-Bereich:
```tsx
<label>GPS-Standort</label>
<div className="flex gap-1">
  <button onClick={gpsErfassen}>Erfassen</button>
  <button onClick={() => setKarteOffen(true)}>Karte</button>  {/* NEU */}
</div>
{elem.MobileErfassung.GeoText || "Kein Standort"}
{elem.MobileErfassung.GeoHeading != null &&             {/* NEU */}
  <span>Richtung: {elem.MobileErfassung.GeoHeading}°</span>
}
{karteOffen && <MapEditorModal ... />}                    {/* NEU */}
```

### 4.2 NeuesElement.tsx

Gleiche Ergaenzung wie ElementDetail: "Karte"-Button + MapEditorModal.

### 4.3 ProtokollUebersicht.tsx

Neuer Tab-Button "Karte" in der Tab-Leiste (nach "Gesamt" und den Protokollnummern):

```tsx
<button onClick={() => setAnsicht('karte')}>
  Karte
</button>
```

Bedingte Darstellung:
```tsx
{ansicht === 'karte'
  ? <MapOverview elemente={aktuelleElemente} ... />
  : <table>...</table>
}
```

---

## 5. Benutzerinteraktion

### 5.1 Marker verschieben (Drag & Drop)

- Leaflet `draggable: true` funktioniert nativ auf Touch-Geraeten
- Marker antippen und halten → verschieben
- 3px-Schwelle verhindert versehentliches Verschieben bei Tap
- `autoPanOnFocus: false` verhindert stoerende Kartenspruenge

### 5.2 Richtung einstellen

**Option A (empfohlen): Slider**
- Horizontaler Slider (0-359°) unterhalb der Karte
- Marker-Pfeil dreht sich in Echtzeit beim Schieben
- Praezise, zuverlaessig auf allen Geraeten

**Option B (ergaenzend): Geraetekompass**
- "Kompass"-Button liest `DeviceOrientationEvent.alpha`
- iOS 13+: erfordert `DeviceOrientationEvent.requestPermission()` per User-Geste
- Setzt Heading auf aktuelle Kompassrichtung des Geraets
- Nuetzlich fuer schnelle Ausrichtung "in Blickrichtung"

### 5.3 Multi-Point-Bearbeitung

- Im "Bearbeiten"-Modus sind alle Marker verschiebbar
- Verschobene Marker werden visuell hervorgehoben (z.B. pulsierender Ring)
- "Positionen speichern" speichert alle Aenderungen auf einmal
- "Abbrechen" verwirft alle Aenderungen

---

## 6. Cross-Device-Kompatibilitaet

| Geraet | Browser | Touch | GPS | Kompass | Besonderheiten |
|--------|---------|-------|-----|---------|----------------|
| iPhone | Safari | Ja | Ja | Ja (Permission) | DeviceOrientation braucht HTTPS + Geste |
| iPad | Safari | Ja | Ja | Ja (Permission) | Groesserer Bildschirm, Landscape moeglich |
| Xiaomi Tablet | Chrome | Ja | Ja | Ja | Standard Android-Verhalten |
| Windows Laptop | Chrome/Edge | Maus | Bedingt | Nein | GPS nur mit WLAN-Ortung, kein Kompass |

**Anpassungen:**
- Vollbild-Modal nutzt `100dvh` (dynamic viewport height) fuer mobile Browser mit Adressleiste
- Buttons mindestens 44x44px (Apple Touch-Target-Richtlinie)
- `body overflow: hidden` waehrend Modal offen (kein Scrollen unter dem Modal)
- Leaflet Pinch-Zoom funktioniert nativ auf Touch
- Kompass-Button nur anzeigen, wenn `DeviceOrientationEvent` verfuegbar

---

## 7. Performance

- 50-100 Marker: kein Problem mit Standard-`L.Marker` / `L.DivIcon`
- DivIcon-Instanzen werden gecacht (eine pro Position-String)
- Nur Elemente mit GPS-Koordinaten werden als Marker gerendert
- Bei >500 Markern (Zukunft): `leaflet.markercluster` nachruestbar
- Service Worker Cache begrenzt auf 2000 Kacheln (~20 MB), LRU-Eviction

---

## 8. Zukunft: DXF-Planoverlay

**Nicht in Phase 1**, aber architektonisch vorbereitet:

- `MapBase.tsx` akzeptiert optionale Overlay-Layer als Props/Children
- Zukuenftiger `DxfOverlay`-Komponent:
  1. DXF-Datei laden (z.B. via `dxf-parser`-Bibliothek)
  2. In GeoJSON transformieren (Koordinatentransformation von lokalem KS nach WGS84)
  3. Als Leaflet `GeoJSON`-Layer rendern
- Georeferenzierung: 2-3 Passpunkte (DXF-Koordinate → GPS-Koordinate) fuer affine Transformation
- Toggle-Button zum Ein-/Ausblenden des Plan-Layers

---

## 9. Implementierungsphasen

### Phase 1: Einzelelement-Karteneditor (MVP)
1. Pakete installieren (`leaflet`, `react-leaflet`, `@types/leaflet`)
2. `GeoHeading` in `MobileErfassung` ergaenzen
3. Workbox `runtimeCaching` fuer OSM-Kacheln konfigurieren
4. `mapUtils.ts` — Hilfsfunktionen
5. `DirectionMarker.tsx` — Marker-Komponente
6. `MapBase.tsx` — Basis-Kartenkomponente
7. `MapEditorModal.tsx` — Vollbild-Editor
8. Integration in ElementDetail.tsx und NeuesElement.tsx
9. Test: Online/Offline, iOS/Android/Windows

### Phase 2: Uebersichtskarte
1. `MapOverview.tsx` — Multi-Point-Ansicht
2. Integration als "Karte"-Tab in ProtokollUebersicht.tsx
3. Bearbeiten-Modus mit Batch-Speicherung
4. Filter-Integration

### Phase 3: Erweiterungen (implementiert)
1. Geraetekompass-Integration (DeviceOrientationEvent)
2. Layer-System mit OSM + BayernAtlas Orthophoto + BayernAtlas Topographisch
3. Transparenz-Slider fuer Basiskarten
4. TileCacheManager: Projektgebiet gezielt offline cachen (Viewport oder Punkt+Radius)
5. Zoom bis Level 20, Zoom-Anzeige auf Karte
6. Erweitertes Marker-Popup: Status-Badge, Firma, Termin, "Details"-Button
7. Karte-Button im Header neben Export
8. Gefilterte Prev/Next-Navigation im ElementDetail
9. Thema-Vorschlaege via HTML5 `<datalist>` aus Projektthemen
10. Verantwortliche aus IndexedDB (DB_VERSION 3)

### Phase 4: DXF-Planoverlay (spaeter)
1. DXF-Parser und Georeferenzierung
2. Layer-Toggle in Kartenansicht
