# /frontend — Frontend Sub-Agent

## Zweck
Baut UI/UX Komponenten als isolierter Sub-Agent.
Läuft in eigenem Prozess um den Haupt-Kontext schlank zu halten.

## Aufruf
```
/frontend PROJ-X              ← Feature aus Spec implementieren
/frontend <Beschreibung>      ← freie Frontend-Aufgabe
```

## Sub-Agent Verhalten

Dieser Command läuft als **Sub-Agent**:
- Erhält nur den nötigen Kontext (Feature Spec + CLAUDE.md Frontend-Teil)
- Arbeitet isoliert bis zur Fertigstellung
- Meldet sich mit Ergebnis zurück

## Ablauf

### 1. Kontext laden (isoliert)
- `features/PROJ-X.md` — Was soll gebaut werden?
- `CLAUDE.md` → Abschnitt Tech Stack (nur Frontend-Teil)
- `.forge/preventions.md` → Frontend-relevante Rules
- Bestehende Komponenten sichten (nur betroffene Dateien)

### 2. Implementation

Für jede Komponente:
1. **Struktur** — Komponentenhierarchie planen
2. **Markup/Template** — Semantic HTML / JSX / Template
3. **Styling** — nach Projekt-Convention (Tailwind / CSS Modules / etc.)
4. **State & Logic** — Lokaler State, Props, Event Handler
5. **API-Anbindung** — Fetch/Store-Integration
6. **Error States** — Loading, Empty, Error korrekt behandeln
7. **Responsive** — Mobile-Breakpoints wenn relevant

### 3. Prevention Rules anwenden
Bevor Code geschrieben wird: Prevention Rules aus `.forge/preventions.md` checken.
Markiere welche Rules angewendet wurden.

### 4. Self-Review Checklist
```
[ ] Alle Akzeptanzkriterien aus Feature Spec erfüllt?
[ ] Error States implementiert?
[ ] Loading States implementiert?
[ ] Accessibility (aria-labels, keyboard nav)?
[ ] Prevention Rules befolgt?
[ ] Keine Console-Errors?
```

### 5. Human-in-the-Loop
**Vor dem Abschluss:** Zeige implementierte Dateien + Kurz-Zusammenfassung.
Frage: *"Schau dir das kurz an — passt die UI so? Soll ich /qa laufen lassen?"*

Warte auf Feedback.

---

## FORGE Handoff

Nach Abschluss (nach User-Bestätigung beim Human-in-the-Loop):
1. `.forge/state.md` → `frontend` auf `DONE`, `qa` als nächste Phase
2. Wenn Bugs aufgetreten: automatisch `/forge-sync`
3. Session-Log Eintrag
4. Pipeline-Modus: direkt `/qa PROJ-X` | Standalone: Vorschlag machen
