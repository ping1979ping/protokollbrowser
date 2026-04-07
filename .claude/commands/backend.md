# /backend — Backend Sub-Agent

## Zweck
Entwickelt APIs, Datenbank-Layer und Business-Logic als isolierter Sub-Agent.

## Aufruf
```
/backend PROJ-X               ← Feature aus Spec implementieren
/backend <Beschreibung>       ← freie Backend-Aufgabe
```

## Sub-Agent Verhalten
Läuft isoliert. Erhält nur Backend-relevanten Kontext.

## Ablauf

### 1. Kontext laden (isoliert)
- `features/PROJ-X.md` — Spec und Akzeptanzkriterien
- `CLAUDE.md` → Backend Stack, DB, Conventions
- `.forge/preventions.md` → Backend-relevante Rules
- Betroffene bestehende Dateien sichten

### 2. Datenbank (wenn nötig)
1. Schema-Änderungen / Migration planen
2. Migration-Datei erstellen (mit Down-Migration!)
3. Model/ORM-Klassen anpassen

### 3. Business Logic
1. Service-Layer / Helper-Funktionen
2. Input-Validierung (IMMER — auch wenn Frontend validiert)
3. Error Handling mit aussagekräftigen Messages
4. Logging an kritischen Punkten

### 4. API-Endpoints
1. Route definieren (REST-Convention)
2. Auth/Permission-Check (wenn nötig)
3. Request-Validation
4. Response-Schema klar definieren
5. HTTP-Status-Codes korrekt setzen

### 5. Prevention Rules Checkliste
Vor der Implementierung checken:
```
[ ] Pagination bei Listen-Queries?
[ ] Streaming bei großen Datenmengen?
[ ] Input-Validierung bei allen POST/PUT?
[ ] [weitere aus .forge/preventions.md]
```

### 6. Self-Review Checklist
```
[ ] Alle API-Contracts aus Feature Spec implementiert?
[ ] Fehlerbehandlung vollständig?
[ ] DB-Migration reversibel?
[ ] Prevention Rules angewendet?
[ ] Keine hardcoded Credentials / Secrets?
[ ] Sensitive Daten nicht geloggt?
```

### 7. Human-in-the-Loop
Zeige implementierte Endpoints + Schema-Änderungen.
Frage: *"API sieht so aus — passt das zu euren Erwartungen? Soll ich /qa laufen lassen?"*

Warte auf Feedback.

---

## FORGE Handoff

Nach Abschluss (nach User-Bestätigung beim Human-in-the-Loop):
1. `.forge/state.md` → `backend` auf `DONE`
2. Nächste Phase bestimmen:
   - Frontend vorhanden? → `frontend` als nächste Phase
   - Kein Frontend (API-only)? → `qa` als nächste Phase, `frontend` als `SKIPPED`
3. Wenn Bugs während Implementierung aufgetreten: automatisch `/forge-sync` ausführen
4. Session-Log Eintrag
5. Pipeline-Modus: direkt weiter | Standalone: Vorschlag machen
