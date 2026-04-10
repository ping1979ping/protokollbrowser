# /forge-report — Efficiency Analysis & Skill-Selbstverbesserung

## Zweck
Analysiert alle .forge/ Daten, erkennt übergeordnete Muster,
macht Vorschläge für Workflow-Verbesserungen und kann Commands selbst anpassen.

## Aufruf
```
/forge-report                 ← vollständiger Bericht
/forge-report --quick         ← Kurzzusammenfassung
/forge-report --since <datum> ← nur neuere Einträge
/forge-report --apply         ← Verbesserungen direkt anwenden
```

## Ablauf

### 1. Alle .forge/ Daten laden

- `.forge/bugs.md` — alle Bug-Einträge
- `.forge/preventions.md` — aktive Rules
- `.forge/efficiency.md` — frühere Vorschläge + ob umgesetzt
- `features/` — Feature Specs (Status, Zeitverlauf)

### 2. Analyse

**Bug-Analyse:**
```
Gesamt Bugs: N
Top 3 Muster:
  1. <Muster A>: X mal (XX%)
  2. <Muster B>: X mal (XX%)
  3. <Muster C>: X mal (XX%)

Komponenten mit meisten Bugs:
  1. <Datei/Modul>: X Bugs

Durchschnittliche Zeit bis Erkennung: ...
Wiederholte Bugs (gleicher Fix): ...
```

**Rule-Wirksamkeit:**
```
Aktive Rules: N
  [ENFORCED]: X Rules
  [WATCH]: Y Rules

Rule-Lücken: Muster ohne Rule die >2x vorkommen
```

**Workflow-Effizienz:**
```
Commands am häufigsten genutzt: ...
Commands selten genutzt: ...
Oft übersprungene Steps: ...
```

### 3. Verbesserungsvorschläge

Für jeden Vorschlag:
```
## VORSCHLAG-N: <Titel>
Basis: <welche Daten führten zu diesem Vorschlag>
Problem: <was läuft suboptimal>
Lösung: <konkreter Vorschlag>
Änderung: <welche Datei würde wie geändert>
Impact: [HOCH/MITTEL/NIEDRIG]
Aufwand: [GERING/MITTEL/HOCH]
```

**Mögliche Vorschlag-Typen:**
- Neue Prevention Rule aus erkanntem Muster
- Command-Anpassung (z.B. neue Checklisten-Punkte in /backend)
- CLAUDE.md Ergänzung
- Neuer Slash-Command für wiederkehrende Aufgabe
- Vorschlag für globalen FORGE Skill (für my-brain)

### 4. Bericht ausgeben

```
📊 FORGE Efficiency Report — <Datum>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🐛 Bugs: <N> gesamt | Top-Muster: <X>
🛡️ Prevention Rules: <N> aktiv (<X> enforced)
📋 Features: <N> gesamt | Ø Durchlaufzeit: <X>

🔺 TOP PROBLEM: <Muster mit höchster Frequenz>

💡 Vorschläge (<N> gesamt):
  HOCH:   [VORSCHLAG-1] ...
  MITTEL: [VORSCHLAG-3] ...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Soll ich die HIGH-Impact Vorschläge anwenden? [ja / auswählen / nein]
```

### 5. Anwenden (wenn bestätigt)

Bei `ja` oder spezifischer Auswahl:
1. Dateien in `.claude/commands/` anpassen
2. `CLAUDE.md` ergänzen
3. `.forge/preventions.md` aktualisieren
4. Alle Änderungen in `.forge/changelog.md` dokumentieren

### 6. My-Brain Export (optional)

Wenn der User es möchte:
Erstelle einen Vorschlag für den globalen FORGE Skill im my-brain Format
(für Übernahme in `03-claude/projekte/forge/SKILL.md`).
