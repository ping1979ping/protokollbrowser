# /gsd — Getting Shit Done

## Zweck
Strukturiertes Plan → Execute → Verify für jede Aufgabe.
GSD verhindert, dass Claude einfach draufloscode schreibt ohne Plan.

## Aufruf
```
/gsd <Aufgabenbeschreibung>
/gsd                          ← aktuellen Task-Status anzeigen
```

## Das GSD-Prinzip

**Nie direkt implementieren. Immer: Plan → Bestätigung → Execute → Verify.**

## Ablauf

### Phase 1: PLAN

1. **Aufgabe verstehen**
   - Was ist das gewünschte Ergebnis (Definition of Done)?
   - Was ist der Scope? Was ist explizit OUT of scope?
   - Welche Dateien / Systeme sind betroffen?

2. **Zerlegung in Schritte**
   Erstelle eine nummerierte Task-Liste. Jeder Schritt:
   - Konkret und ausführbar
   - Unabhängig verifizierbar
   - Max. 1 Stunde Arbeit

3. **Risiken identifizieren**
   - Was könnte schiefgehen?
   - Welche Prevention Rules aus `.forge/preventions.md` sind relevant?
   - Gibt es Breaking Changes?

4. **Plan zeigen + bestätigen**
   ```
   📋 GSD Plan: <Aufgabe>

   Schritte:
   1. [ ] ...
   2. [ ] ...
   3. [ ] ...

   Betroffene Dateien: ...
   Risiken: ...
   Prevention Rules anwendbar: ...

   Soll ich loslegen? [ja / anpassen]
   ```
   **WARTE AUF BESTÄTIGUNG.**

### Phase 2: EXECUTE

- Einen Schritt nach dem anderen
- Nach jedem Schritt: kurze Status-Meldung
- Bei unerwartetem Problem: STOP → User informieren → Plan anpassen
- **Kein scope creep** — nur was im Plan steht

### Phase 3: VERIFY

Für jeden abgeschlossenen Schritt:
```
✅ Schritt 1: <was gemacht wurde>
   Verifiziert durch: <Test / manueller Check / Code-Review>
```

Abschlussbericht:
```
🏁 GSD Abgeschlossen: <Aufgabe>

✅ X Schritte erfolgreich
⚠️ Y Abweichungen vom Plan: ...
📝 Nächste Schritte (falls nötig): ...

Bugs gefunden? → /forge-sync aufrufen
```

## Integration mit anderen Commands

- Komplexe Features → zuerst `/requirements` dann `/gsd`
- Nach Bugs → `/gsd` für den Fix-Plan + danach `/forge-sync`
- Für Code-Qualität-Tasks → `/gsd` + danach `/review`

---

## FORGE Handoff

Nach GSD-Abschluss:
1. Bugs aufgetreten und behoben? → automatisch `/forge-sync`
2. War dieser GSD-Task Teil einer Pipeline-Phase? → State aktualisieren
3. Session-Log Eintrag: `[DATUM] GSD: <Aufgabe> ✅`
4. Wenn im Pipeline-Modus: Kontrolle zurück an `/pipeline`
