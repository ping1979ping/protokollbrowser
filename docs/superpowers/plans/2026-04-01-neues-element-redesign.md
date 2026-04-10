# NeuesElement + ElementDetail Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign NeuesElement und ElementDetail für Outdoor-Usability: kompaktes Viewport-Filling-Layout, hoher Kontrast, einheitliche Button-Farben, kombinierte Standort+Fotos-Zeile, Scroll-to-Top FAB.

**Architecture:** Beide Komponenten bekommen die gleiche Feld-Reihenfolge (Positionstext → Verantw./Thema/Termin → Status+Titel → Position+Bemerkung → Standort+Fotos). Ein neuer ScrollToTopFab als eigene Komponente wird in 3 Seiten eingebaut. Verantwortlich-Dropdown zeigt Kürzel — Firmenname.

**Tech Stack:** React, Tailwind CSS, TypeScript

---

## File Structure

| Datei | Aktion | Verantwortung |
|---|---|---|
| `app/src/components/NeuesElement.tsx` | Modify | Komplett-Redesign Body + Header |
| `app/src/components/ElementDetail.tsx` | Modify | Body-Redesign (gleiche Reihenfolge), Kontrast |
| `app/src/components/ScrollToTopFab.tsx` | Create | Wiederverwendbarer FAB-Button |
| `app/src/components/ProtokollUebersicht.tsx` | Modify | ScrollToTopFab einbinden |

---

### Task 1: ScrollToTopFab-Komponente erstellen

**Files:**
- Create: `app/src/components/ScrollToTopFab.tsx`

- [ ] **Step 1: Komponente erstellen**

```typescript
// app/src/components/ScrollToTopFab.tsx
import { useState, useEffect } from 'react';

export default function ScrollToTopFab() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > 200);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="fixed bottom-3 left-3 bg-white text-ping-blue border-2 border-ping-blue w-11 h-11 rounded-full shadow-lg flex items-center justify-center text-lg font-bold z-50 hover:bg-ping-blue-light active:bg-ping-blue-light transition"
      aria-label="Nach oben"
    >
      ↑
    </button>
  );
}
```

- [ ] **Step 2: TypeScript-Check**

Run: `cd app && npx tsc -b --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add app/src/components/ScrollToTopFab.tsx
git commit -m "feat: ScrollToTopFab Komponente — links unten, weiß/blau"
```

---

### Task 2: NeuesElement.tsx Redesign

**Files:**
- Modify: `app/src/components/NeuesElement.tsx`

Dieses Task ist das größte — kompletter Body-Umbau. Die Änderungen im Detail:

- [ ] **Step 1: Schnelltyp entfernen**

Entferne die `SCHNELLTYPEN`-Konstante (Zeile 22-26), die `schnelltyp()`-Funktion (Zeile 179-184), den `typ`-State (Zeile 62), und den gesamten Schnelltyp-JSX-Block (Zeile 342-357).

Passe den `thema`-State-Default an — statt `SCHNELLTYPEN[0].thema` einfach `''`:
```typescript
const [thema, setThema] = useState(clone?.thema ?? vorgaenger?.Thema ?? '');
```

- [ ] **Step 2: Verantwortlich-Dropdown mit Kürzel**

In der `alleFirmen`-Konstruktion (aktuell ~Zeile 172-177) das Kuerzel mitführen:
```typescript
const alleFirmen = firmen.length > 0
  ? firmen.map(f => ({ Oid: f.ID, Kuerzel: f.Kuerzel, Name: f.Name }))
  : [
      ...protokoll.Teilnehmer.map(t => ({ Oid: t.Oid, Kuerzel: t.Nummer || '', Name: t.Name })),
      ...protokoll.Verteiler
        .filter(v => !protokoll.Teilnehmer.some(t => t.Oid === v.Oid))
        .map(v => ({ Oid: v.Oid, Kuerzel: v.Nummer || '', Name: v.Name })),
    ];
```

Im Dropdown die Anzeige ändern:
```tsx
{alleFirmen.map(t => (
  <option key={t.Oid} value={t.Oid}>
    {t.Kuerzel ? `${t.Kuerzel} — ${t.Name}` : t.Name}
  </option>
))}
```

- [ ] **Step 3: Header kompakt — Speichern-Buttons in den Header**

Den bisherigen Header (Zeile 305-321) und Button-Bar (Zeile 324-339) ersetzen durch einen kompakten 2-Zeilen-Header:

```tsx
{/* Header — kompakt wie ElementDetail */}
<div className="bg-ping-blue text-white p-3">
  {/* Zeile 1: Übersicht | Speichern | Speichern & Neu */}
  <div className="flex gap-1.5">
    <button onClick={onBack}
      className="flex-1 py-2 rounded-lg text-xs font-medium text-center bg-ping-blue-dark text-white hover:bg-ping-blue-light hover:text-ping-blue">
      &larr; Übersicht
    </button>
    <button onClick={speichern}
      className={`flex-1 py-2 rounded-lg text-xs font-bold text-center ${
        dirty ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-green-600 hover:bg-green-700 text-white'
      }`}>
      ✓ Speichern
    </button>
    <button onClick={speichernUndNeu}
      className="flex-1 py-2 rounded-lg text-xs font-medium text-center bg-ping-blue-dark text-white hover:bg-ping-blue-light hover:text-ping-blue">
      + Speichern &amp; Neu
    </button>
  </div>
  {/* Zeile 2: Info */}
  <div className="flex items-center gap-2 mt-1.5">
    <span className="bg-gray-600 text-white px-2 py-0.5 rounded text-[10px] font-medium">Neu</span>
    <span className="text-[10px] text-ping-blue-light/70 truncate">{protokoll.Name}</span>
    <span className="text-[10px] text-ping-blue-light">Neues Element</span>
  </div>
</div>
```

- [ ] **Step 4: Body komplett umbauen — Viewport-Filling Layout**

Den gesamten Body-Bereich (ab dem alten Button-Bar bis zum Ende) ersetzen. Das neue Layout nutzt `flex flex-col` mit dem Positionstext als `flex-1`:

```tsx
{/* Body — füllt den Viewport */}
<div className="flex flex-col gap-2 p-2.5" style={{ minHeight: 'calc(100vh - 76px)' }}>

  {/* 1. Positionstext — wächst mit dem verfügbaren Platz */}
  <div className="bg-white rounded-lg p-2.5 border-2 border-gray-300 flex-1 flex flex-col">
    <label className="text-xs text-gray-700 font-semibold mb-1">Positionstext *</label>
    <textarea value={positionstext} onChange={(e) => { setPositionstext(e.target.value); setDirty(true); }}
      placeholder="Beschreibung des Punktes..."
      className="flex-1 w-full px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-ping-blue resize-none min-h-[6rem]" />
  </div>

  {/* 2. Verantwortlich (2) + Thema (1) + Termin (1) */}
  <div className="flex gap-1.5">
    <div className="flex-[2] bg-white rounded-lg p-2 border-2 border-gray-300">
      <label className="text-xs text-gray-700 font-semibold block mb-1">Verantwortlich</label>
      <select value={verantwFirmaOid} onChange={(e) => { setVerantwFirmaOid(e.target.value); setDirty(true); }}
        className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-ping-blue">
        <option value=""></option>
        {alleFirmen.map(t => (
          <option key={t.Oid} value={t.Oid}>{t.Kuerzel ? `${t.Kuerzel} — ${t.Name}` : t.Name}</option>
        ))}
      </select>
    </div>
    <div className="flex-1 bg-white rounded-lg p-2 border-2 border-gray-300">
      <label className="text-xs text-gray-700 font-semibold block mb-1">Thema</label>
      <div className="flex gap-1">
        <select value={thema} onChange={(e) => { setThema(e.target.value); setDirty(true); }}
          className="flex-1 min-w-0 px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-ping-blue">
          {themenVorschlaege.map(t => <option key={t} value={t}>{t}</option>)}
          {thema && !themenVorschlaege.includes(thema) && <option value={thema}>{thema}</option>}
        </select>
        <button onClick={() => { const val = prompt('Neues Thema:', thema); if (val != null) { setThema(val); setDirty(true); } }}
          className="px-1.5 bg-ping-blue text-white rounded text-xs font-bold shrink-0">+</button>
      </div>
    </div>
    <div className="flex-1 bg-white rounded-lg p-2 border-2 border-gray-300">
      <label className="text-xs text-gray-700 font-semibold block mb-1">Termin</label>
      <input type="date" value={termin} onChange={(e) => { setTermin(e.target.value); setDirty(true); }}
        className={`w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-ping-blue ${terminUeberfaellig ? 'text-red-600 font-semibold' : ''}`} />
    </div>
  </div>

  {/* 3. Status (2) + Titel (2) */}
  <div className="flex gap-1.5">
    <div className="flex-[2] bg-white rounded-lg px-2.5 py-2 border border-gray-200 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">Status</span>
        <StatusBadge status={status} />
      </div>
      <button onClick={() => setShowWeitereStatus(!showWeitereStatus)}
        className="bg-gray-100 text-gray-500 w-8 h-8 rounded-lg border border-gray-300 flex items-center justify-center text-base">···</button>
    </div>
    <div className="flex-[2] bg-white rounded-lg border border-gray-200 overflow-hidden">
      <input type="text" value={titel} onChange={(e) => { setTitel(e.target.value); setDirty(true); }}
        placeholder="Titel (optional)"
        className="w-full h-full px-2.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ping-blue" />
    </div>
  </div>

  {/* Status-Auswahl (expandiert) */}
  {showWeitereStatus && (
    <div className="bg-white rounded-lg p-2.5 border border-gray-200">
      <div className="flex gap-1 flex-wrap">
        {[...HAUPT_STATUS, ...WEITERE_STATUS].filter(s => STATUS_MAP[s]).map(s => (
          <button key={s} onClick={() => { setStatus(s); setShowWeitereStatus(false); setDirty(true); }}
            className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
              status === s ? STATUS_MAP[s].css + ' ring-2 ring-ping-blue' : 'bg-gray-50 text-gray-500'
            }`}>
            {STATUS_MAP[s].label}
          </button>
        ))}
      </div>
    </div>
  )}

  {/* 4. Position + Bemerkung (Placeholder statt Label) */}
  <div className="flex gap-1.5">
    <div className="flex-1 bg-white rounded-lg border border-gray-200 overflow-hidden">
      <input type="text" value={position} onChange={(e) => { setPosition(e.target.value); setDirty(true); }}
        placeholder="Position (auto)"
        className="w-full px-2.5 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ping-blue" />
    </div>
    <div className="flex-[2] bg-white rounded-lg border border-gray-200 overflow-hidden">
      <input type="text" value={bemerkung} onChange={(e) => { setBemerkung(e.target.value); setDirty(true); }}
        placeholder="Optionale Bemerkung (intern)"
        className="w-full px-2.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ping-blue" />
    </div>
  </div>

  {/* 5. Standort + Fotos (kombiniert) */}
  <div className="bg-white rounded-lg p-2.5 border border-gray-200">
    <div className="flex justify-between items-start">
      {/* Standort links */}
      <div>
        <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">Standort</div>
        <div className="flex gap-1">
          <button onClick={gpsErfassen} className="bg-ping-blue text-white px-2.5 py-1 rounded text-[11px] font-medium">📍 GPS</button>
          <button onClick={() => setKarteOffen(true)} className="bg-ping-blue text-white px-2.5 py-1 rounded text-[11px] font-medium">🗺 Karte</button>
          {geoLat != null && (
            <button onClick={() => { setGeoLat(null); setGeoLon(null); setGeoAcc(null); setGeoHeading(null); setGeoText(''); setDirty(true); }}
              className="bg-gray-100 text-gray-500 px-2 py-1 rounded text-[11px] border border-gray-300">✕</button>
          )}
        </div>
      </div>
      {/* Fotos rechts */}
      <div className="text-right">
        <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">Fotos</div>
        <div className="flex gap-1 items-center">
          <button onClick={() => fotoRef.current?.click()} className="bg-ping-blue text-white px-2.5 py-1 rounded text-[11px] font-medium">📷</button>
          <button onClick={() => galerieRef.current?.click()} className="bg-gray-100 text-gray-700 px-2.5 py-1 rounded text-[11px] border border-gray-300">🖼</button>
          {tempFotos.length > 0 && (
            <span className="bg-amber-500 text-white w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold">{tempFotos.length}</span>
          )}
        </div>
      </div>
    </div>
    {geoLat != null && (
      <p className="text-[10px] text-gray-700 mt-1.5">📍 {geoText || `${geoLat.toFixed(5)}, ${geoLon?.toFixed(5)}`}</p>
    )}
    {geoLat == null && (
      <p className="text-[10px] text-gray-400 mt-1.5">Kein Standort erfasst</p>
    )}
    <div className="flex items-center gap-1.5 mt-1">
      <span className="text-[9px] text-gray-500">Auto-GPS</span>
      <button onClick={toggleAutoGps}
        className={`w-8 h-[18px] rounded-full relative transition-colors ${autoGps ? 'bg-green-500' : 'bg-gray-300'}`}>
        <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-transform ${autoGps ? 'right-[2px]' : 'left-[2px]'}`} />
      </button>
    </div>
    <input ref={fotoRef} type="file" accept="image/*" capture="environment" onChange={fotoHinzufuegen} className="hidden" />
    <input ref={galerieRef} type="file" accept="image/*" multiple onChange={fotoHinzufuegen} className="hidden" />
  </div>

</div>

{/* Karte Modal */}
{karteOffen && (
  <MapEditorModal ... />
)}

{/* Bautagebuch Wizard */}
{showBtWizard && (
  <BautagebuchWizard ... />
)}

<ScrollToTopFab />
```

- [ ] **Step 5: Import ScrollToTopFab + StatusBadge hinzufügen**

Am Anfang der Datei:
```typescript
import ScrollToTopFab from './ScrollToTopFab';
import StatusBadge from './StatusBadge';
```

- [ ] **Step 6: TypeScript-Check**

Run: `cd app && npx tsc -b --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add app/src/components/NeuesElement.tsx
git commit -m "feat: NeuesElement Redesign — kompaktes Layout, Schnelltyp entfernt, Outdoor-Kontrast"
```

---

### Task 3: ElementDetail.tsx Redesign

**Files:**
- Modify: `app/src/components/ElementDetail.tsx`

Gleiche Prinzipien wie NeuesElement anwenden. Header und Speichern/Rückgängig-Buttons bleiben unverändert.

- [ ] **Step 1: Verantwortlich-Dropdown mit Kürzel**

Gleiche Änderung wie in Task 2, Step 2 — `alleFirmen` mit Kuerzel, Dropdown-Anzeige `Kuerzel — Name`.

- [ ] **Step 2: Body umbauen — gleiche Reihenfolge wie NeuesElement**

Den Body-Bereich (ab Zeile 272) komplett umbauen. Die Reihenfolge wird:

1. Vorgänger/Nachfolger (wenn vorhanden, bleibt oben)
2. Positionstext (groß, border-2, bei editierbar textarea, sonst p)
3. Verantwortlich (flex:2) + Thema (flex:1) + Termin (flex:1) — eine Zeile
4. Status (flex:2, Badge + ···-Button) + Titel (flex:2) — eine Zeile
5. Position (flex:1) + Bemerkung (flex:2) — Placeholder statt Label
6. Standort + Fotos (kombiniert, eine Zeile)
7. Bautagebuch/Verschieben/Löschen Buttons (wenn editierbar, am Ende)

Die Kontrast-Regeln anwenden:
- Labels: `text-xs text-gray-700 font-semibold` statt `text-[10px] text-gray-400 uppercase`
- Hauptfeld-Borders: `border-2 border-gray-300` statt `border border-gray-100`
- Nebenfeld-Borders: `border border-gray-200`
- GPS/Foto-Buttons: einheitlich `bg-ping-blue` statt bunt
- Standort + Fotos: kombinierte Zeile mit Mini-Labels (gleicher Code wie NeuesElement Task 2 Step 4, angepasst für elem-State statt lokale States)

- [ ] **Step 3: Import ScrollToTopFab + am Ende einbinden**

```typescript
import ScrollToTopFab from './ScrollToTopFab';
```

Vor dem schließenden `</div>` des Root-Containers:
```tsx
<ScrollToTopFab />
```

- [ ] **Step 4: TypeScript-Check**

Run: `cd app && npx tsc -b --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add app/src/components/ElementDetail.tsx
git commit -m "feat: ElementDetail Redesign — gleiche Feld-Reihenfolge wie NeuesElement, Outdoor-Kontrast"
```

---

### Task 4: ScrollToTopFab in ProtokollUebersicht einbinden

**Files:**
- Modify: `app/src/components/ProtokollUebersicht.tsx`

- [ ] **Step 1: Import hinzufügen**

```typescript
import ScrollToTopFab from './ScrollToTopFab';
```

- [ ] **Step 2: FAB einbinden**

Vor dem schließenden `</div>` des Root-Containers (vor den bestehenden FABs), füge ein:
```tsx
<ScrollToTopFab />
```

- [ ] **Step 3: TypeScript-Check**

Run: `cd app && npx tsc -b --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add app/src/components/ProtokollUebersicht.tsx
git commit -m "feat: ScrollToTopFab in Protokoll-Übersicht"
```

---

### Task 5: Verification + Build + Deploy

- [ ] **Step 1: Full TypeScript-Check**

Run: `cd app && npx tsc -b --noEmit`

- [ ] **Step 2: PWA bauen**

Run: `cd app && VITE_BASE=server npm run build`

- [ ] **Step 3: PWA auf Server deployen**

```bash
rm -rf E:/pwa && cp -r app/dist E:/pwa
```

- [ ] **Step 4: Push**

```bash
git push origin layout-barrierefrei
```
