# /qa — Quality Assurance Sub-Agent

## Zweck
Testet implementierte Features gegen die Feature Spec Akzeptanzkriterien.
Läuft als Sub-Agent. Findet was kaputt ist, bevor der User es findet.

## Aufruf
```
/qa PROJ-X                    ← Feature gegen Spec testen
/qa <Datei oder Komponente>   ← gezielter Test
/qa --regression              ← alle Features kurz durchchecken
```

## Ablauf

### 1. Kontext laden
- `features/PROJ-X.md` — Akzeptanzkriterien sind die Test-Basis
- `CLAUDE.md` — Test-Framework, Test-Conventions
- `.forge/bugs.md` — bekannte Bug-Muster als Test-Inspiration

### 2. Test-Strategie

**Unit Tests** (wenn Test-Framework vorhanden):
- Jede neue Funktion / Methode mit Edge Cases abdecken
- Happy Path + Fehlerfall + Grenzwert

**Integration Tests**:
- API-Endpoints gegen echte (Test-)DB
- Frontend-Backend-Interaktion

**Manuelle Test-Anleitung** (immer):
Schreibe eine klare Step-by-Step Anleitung für den User:
```
1. Navigiere zu ...
2. Klicke auf ...
3. Erwartetes Ergebnis: ...
4. Edge Case: Was passiert wenn Feld leer?
```

### 3. Bug-orientierte Tests
Nutze `.forge/bugs.md` als Inspiration:
- Wurden bekannte Bug-Muster in dieser Implementierung vermieden?
- Teste explizit gegen die dokumentierten Prevention Rules

### 4. Akzeptanzkriterien abhaken
Gehe jeden Punkt aus `features/PROJ-X.md` durch:
```
✅ Kriterium 1 — bestanden (Unit Test: test_x.py::test_y)
✅ Kriterium 2 — bestanden (manuell verifiziert)
❌ Kriterium 3 — FEHLER: ...
⚠️ Kriterium 4 — unklar, braucht User-Input
```

### 5. Bugs reporten
Für jeden gefundenen Bug:
1. Beschreibe genau was kaputt ist
2. Gib Reproduktions-Schritte
3. Schlage Fix vor
4. Frage: Soll ich den Fix direkt machen?

### 6. Human-in-the-Loop
Zeige QA-Report mit allen Ergebnissen.
Frage: *"X von Y Kriterien bestanden. Soll ich die Bugs direkt fixen und dann /forge-sync aufrufen?"*

---

## FORGE Handoff

Nach Abschluss:
1. `.forge/state.md` → `qa` auf `DONE` (nur wenn alle Akzeptanzkriterien bestanden)
   - Wenn Bugs offen: `qa` auf `BLOCKED`, Grund eintragen
2. Für jeden gefixten Bug: automatisch `/forge-sync` ausführen
3. Feature Spec `features/PROJ-X.md` → QA-Ergebnisse eintragen + Status auf `Review`
4. Session-Log Eintrag
5. Pipeline-Modus: direkt `/review PROJ-X` | Standalone: Vorschlag machen

⚠️ Pipeline geht nur weiter wenn QA-Status = DONE (alle Kriterien bestanden).
