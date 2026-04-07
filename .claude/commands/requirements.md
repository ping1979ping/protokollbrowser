# /requirements — Feature Requirements Engineering

## Zweck
Klärt Anforderungen vollständig, bevor eine einzige Zeile Code geschrieben wird.
Produziert eine Feature Spec (`features/PROJ-X.md`) die als Single Source of Truth gilt.

## Aufruf
```
/requirements <kurze Feature-Beschreibung>
/requirements PROJ-X   ← existierende Spec überarbeiten
```

## Ablauf

### 0. Prevention Rules Vorab-Check

Bevor die Feature Spec geschrieben wird:
- Lies `.forge/preventions.md`
- Prüfe ob `[ENFORCED]` Rules den Scope des Features beeinflussen
- Wenn ja: Hinweis in Spec unter "Technische Notizen" aufnehmen
  → *"ENFORCED RULE-N muss bei Implementierung beachtet werden"*

### 1. Feature-ID vergeben
Lies `features/` Verzeichnis → nächste freie PROJ-Nummer bestimmen.

### 2. Anforderungen durchleuchten

Stelle **gezielte Fragen** zu diesen Bereichen (nur was noch unklar ist):

**Funktional:**
- Was ist der Happy Path? (Schritt für Schritt)
- Was sind die Edge Cases? (leere States, Grenzwerte, Sonderfälle)
- Was passiert bei Fehlern? (User-Feedback, Fallbacks)

**Nicht-funktional:**
- Performance-Erwartungen? (Ladezeiten, Datenmenge)
- Sicherheit? (Auth, Berechtigungen, Daten-Sensitivität)
- Mobilität / Responsiveness?

**Integration:**
- Welche bestehenden Komponenten sind betroffen?
- API-Änderungen? Datenbank-Migrationen nötig?

### 3. Akzeptanzkriterien formulieren

Maximal 5-7 klare, testbare Kriterien:
```
✅ User kann X tun wenn Y
✅ System zeigt Fehlermeldung Z wenn W
✅ Performance: X in unter Y ms
```

### 4. Feature Spec schreiben

Erstelle `features/PROJ-X.md`:

```markdown
# PROJ-X: <Feature-Name>

**Status:** Draft | In Progress | Done
**Erstellt:** YYYY-MM-DD
**Stack-Kontext:** <relevante Teile aus CLAUDE.md>

## Beschreibung
<Was und Warum>

## User Story
Als <Rolle> möchte ich <Aktion> damit <Nutzen>.

## Akzeptanzkriterien
- [ ] ...
- [ ] ...

## Technische Notizen
<Implementierungshinweise, betroffene Dateien, Abhängigkeiten>

## Out of Scope
<Was explizit NICHT Teil dieses Features ist>

## Offene Fragen
<Noch ungeklärtes>
```

### 5. Human-in-the-Loop

**Vor dem Abschließen:** Zeige die fertige Spec dem User.
Frage: *"Passt das so? Soll ich etwas anpassen, bevor wir mit /architecture oder /backend weitermachen?"*

Warte auf Bestätigung. Erst dann ist der Command abgeschlossen.

---

## FORGE Handoff

Nach Abschluss dieses Commands:
1. `.forge/state.md` → Phase `requirements` auf `DONE` setzen, `architecture` als nächste Phase
2. Session-Log Eintrag hinzufügen
3. Wenn im Pipeline-Modus: direkt `/architecture PROJ-X` starten
4. Wenn standalone: vorschlagen → *"Soll ich direkt mit /architecture weitermachen?"*
