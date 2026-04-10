# /review — Deep Code Review (Superpowers)

## Zweck
Gründlicher Code-Review mit vollem Kontext-Wissen.
Findet nicht nur Bugs, sondern auch Architektur-Probleme, Security-Issues,
Performance-Fallen und Technical Debt.

## Aufruf
```
/review <Datei oder Verzeichnis>
/review PROJ-X                ← alle Dateien eines Features reviewen
/review --security            ← Security-fokussierter Review
/review --performance         ← Performance-fokussierter Review
/review --debt                ← Technical Debt aufdecken
```

## Ablauf

### 1. Kontext aufbauen (Superpowers-Ansatz)
- `CLAUDE.md` — Tech Stack, Conventions, Standards
- `.forge/preventions.md` — bekannte Problemmuster
- `.forge/bugs.md` — historische Bugs als Kontext
- Feature Spec (falls vorhanden) — Was sollte implementiert werden?

### 2. Code lesen — nicht überfliegen

Lies den Code vollständig. Dann analysiere:

**Correctness:**
- Logik-Fehler? Off-by-one? Race Conditions?
- Error Handling vollständig?
- Edge Cases abgedeckt?

**Security:**
- Input-Validierung überall?
- SQL Injection / XSS möglich?
- Auth-Checks an richtiger Stelle?
- Sensitive Daten richtig behandelt?

**Performance:**
- N+1 Query Probleme?
- Fehlende Indizes?
- Unnötige Loops / Berechnungen?
- Memory Leaks möglich?

**Maintainability:**
- Funktionen zu lang / zu komplex?
- Duplizierter Code?
- Magic Numbers / Strings?
- Verständliche Benennung?

**Prevention Rules Compliance:**
- Werden alle aktiven Prevention Rules eingehalten?
- Neue Muster erkannt die eine neue Rule rechtfertigen?

### 3. Review-Report

```
## Code Review: <Datei/Feature>
Datum: YYYY-MM-DD

### 🔴 Kritisch (sofort fixen)
- [Zeile X]: ...

### 🟡 Wichtig (bald fixen)
- [Zeile X]: ...

### 🟢 Verbesserungsvorschläge
- ...

### ✅ Was gut ist
- ...

### Prevention Rule Vorschläge
- Neue Rule: "..." (Basis: gefundenes Muster)
```

### 4. Aktionen

Nach dem Report fragen:
1. *"Soll ich die kritischen Issues direkt fixen?"*
2. *"Soll ich neue Prevention Rules via /forge-sync hinzufügen?"*
3. *"Soll ich einen /gsd Plan für die anderen Issues erstellen?"*

---

## FORGE Handoff

Nach Abschluss:
1. `.forge/state.md` → `review` auf `DONE`
2. Kritische Issues gefunden? → `review` auf `BLOCKED`, Pipeline pausiert bis behoben
3. Neue Prevention Rule Vorschläge? → Direkt `/forge-sync --add-rule` ausführen
4. Feature Spec Status → `Done` (wenn kein Deploy ausstehend)
5. Session-Log Eintrag
6. Pipeline-Modus: Deploy-Phase ankündigen + explizit fragen
   *"Review abgeschlossen. Soll ich /deploy starten? [ja / später]"*
   **Immer warten — Deploy nie automatisch.**
