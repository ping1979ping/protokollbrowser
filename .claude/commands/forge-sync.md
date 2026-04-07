# /forge-sync — Bug Memory & Prevention Engine

## Zweck
Das Herzstück des autonomen FORGE-Apparats.
Dokumentiert Bugs, leitet Prevention Rules ab, aktualisiert CLAUDE.md automatisch.

## Aufruf
```
/forge-sync                   ← nach einem Bugfix (Claude fragt nach Details)
/forge-sync "<Bug-Beschreibung> | Fix: <was gemacht wurde>"
/forge-sync --review          ← alle Einträge sichten
/forge-sync --add-rule "<Rule>"  ← manuelle Prevention Rule hinzufügen
```

## Automatisches Triggern

FORGE führt `/forge-sync` **automatisch** aus (ohne Aufforderung) wenn:
- Ein Bug gefunden und behoben wurde
- `/qa` einen Fehler gefunden hat der gefixt wurde
- `/review` kritische Issues identifiziert hat die behoben wurden

## Ablauf

### 1. Bug-Informationen erfassen

Wenn Informationen fehlen, frage kurz:
- Was war das Problem? (Symptom)
- Was war die Ursache? (Root Cause)
- Was war der Fix?
- Welche Komponente / Datei?

### 2. Bug-ID vergeben

Lies `.forge/bugs.md` → nächste freie BUG-Nummer.

### 3. In .forge/bugs.md eintragen

```markdown
## BUG-<N> | <YYYY-MM-DD>
**Komponente:** <Datei/Modul>
**Symptom:** <Was der User/Test gesehen hat>
**Root Cause:** <Warum es passiert ist>
**Fix:** <Was geändert wurde>
**Muster:** <Kategorie — z.B. "Memory-Buildup", "Missing Validation", "N+1 Query">
**Prevention:** <Wie man das in Zukunft verhindert>
```

### 4. Pattern-Matching

Analysiere alle bisherigen Einträge in `.forge/bugs.md`:

```python
# Pseudo-Logik
für jedes Muster:
    count = anzahl_bugs_mit_diesem_muster
    wenn count == 2:
        → Rule als [WATCH] markieren
    wenn count >= 3:
        → Rule als [ENFORCED] markieren
        → automatisch in CLAUDE.md aufnehmen
```

### 5. Prevention Rule aktualisieren

Füge/aktualisiere Eintrag in `.forge/preventions.md`:

```markdown
## RULE-<N> | Muster: <Kategorie>
**Status:** [WATCH] | [ENFORCED]
**Basis:** BUG-X, BUG-Y (, BUG-Z)
**Rule:** <Konkrete Handlungsanweisung für zukünftige Implementierungen>
**Beispiel:** <Kurzes Code-Snippet wenn hilfreich>
```

### 6. CLAUDE.md automatisch aktualisieren

Wenn Rule `[ENFORCED]` wird:
- Finde Abschnitt `## FORGE Prevention Rules` in `CLAUDE.md`
- Füge Rule hinzu:
  ```
  - [ENFORCED] <Rule-Text> (→ RULE-N, Basis: BUG-X/Y/Z)
  ```

### 7. Bestätigung

```
🔥 FORGE Sync abgeschlossen

Eingetragen: BUG-<N>
Muster erkannt: <Kategorie> (<N>x gesehen)
Rule-Status: [WATCH/ENFORCED/NEU]

[wenn ENFORCED]: CLAUDE.md aktualisiert ✅
```
