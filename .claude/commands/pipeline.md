# /pipeline — Autonomer Orchestrator

## Zweck
Führt automatisch durch den gesamten Feature-Entwicklungszyklus.
Liest den aktuellen State, entscheidet den nächsten Schritt, führt ihn aus,
aktualisiert den State — ohne dass der User jeden Schritt manuell eintippen muss.

## Aufruf
```
/pipeline PROJ-X              ← Feature von aktuellem State aus weitermachen
/pipeline PROJ-X --from requirements  ← von bestimmter Phase starten
/pipeline --status            ← was ist gerade aktiv?
/pipeline --resume            ← nach Abbruch weitermachen
```

## Pipeline-Phasen (in Reihenfolge)

```
1. requirements   → Feature Spec erstellen
2. architecture   → System Design
3. backend        → API/DB implementieren (Sub-Agent)
4. frontend       → UI implementieren (Sub-Agent) [wenn Frontend vorhanden]
5. qa             → Tests + Verifikation (Sub-Agent)
6. review         → Code Review
7. deploy         → Deployment [nur wenn explizit gewünscht]
```

Frontend kann parallel zu Backend oder wegfallen je nach Projekttyp.

## Ablauf

### 1. State laden

Lies `.forge/state.md`.

Wenn kein State für dieses Feature: Starte bei Phase `requirements`.
Wenn State vorhanden: Prüfe `Nächste Phase` und `Blockiert durch`.

Wenn blockiert:
```
⛔ PROJ-X ist blockiert: <Grund>
Bitte klären: <was der User tun muss>
Danach: /pipeline PROJ-X --resume
```
STOP — warte auf User.

### 2. Pre-Phase: Prevention Rules prüfen

Vor jeder Phase: Lies `.forge/preventions.md`.
Prüfe ob `[ENFORCED]` Rules für diese Phase relevant sind.

Wenn ENFORCED Rule verletzt würde (erkennbar aus geplanter Implementierung):
```
⛔ ENFORCED Rule würde verletzt: [RULE-N]
Regel: <Rule-Text>
Betroffen: <was konkret>

Optionen:
  [a] Implementierungsplan anpassen (empfohlen)
  [b] Override mit Begründung
  [c] Abbrechen
```
WARTE AUF USER-ANTWORT.

### 3. Phase ausführen

Führe den entsprechenden Command vollständig aus (wie in seiner eigenen .md definiert).

Nach jedem Human-in-the-Loop Checkpoint innerhalb des Commands:
→ Warte auf User-Bestätigung
→ Dann weiter

### 4. State aktualisieren

Nach jeder abgeschlossenen Phase → `.forge/state.md` updaten:
- Abgeschlossene Phase als `[DONE]` markieren
- Nächste Phase setzen
- Timestamp aktualisieren

### 5. Nahtlos weitergehen

Nach erfolgreicher Phase:
```
✅ Phase <X> abgeschlossen — PROJ-Y
⏭️ Starte Phase <X+1>: <n> ...
```

Direkt weitermachen ohne auf Bestätigung zu warten,
**außer** wenn:
- Sub-Agent Phase beginnt (frontend/backend/qa) → kurze Ankündigung
- deploy Phase → immer explizit bestätigen lassen

### 6. Pipeline-Abschluss

Wenn alle Phasen done:
```
🏁 Pipeline abgeschlossen: PROJ-X
━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ requirements  ✅ architecture  ✅ backend
✅ frontend      ✅ qa            ✅ review

State: DONE | Bereit für /deploy wenn gewünscht

📋 FORGE Handoff:
→ forge-sync aufgerufen: [ja/nein]
→ Neue Prevention Rules: [N]
→ Feature Spec aktualisiert: ✅
```

## Fehlerbehandlung

Wenn eine Phase fehlschlägt oder unerwartet abbricht:
1. State als `BLOCKED` markieren mit Fehlerbeschreibung
2. User informieren was passiert ist
3. Optionen anbieten: retry / skip / manuell lösen
4. `/pipeline --resume` um fortzufahren

## Interaktion mit /gsd

Komplexe Implementierungsschritte innerhalb einer Phase laufen als `/gsd` Sub-Tasks:
- Plan erstellen
- Auf Bestätigung warten
- Ausführen
- Verifizieren
- Dann zurück zur Pipeline
