# /deploy — Production Deployment

## Zweck
Deployt sicher in die gewünschte Umgebung. Checkt Voraussetzungen,
führt durch den Prozess, verifiziert das Ergebnis.

## Aufruf
```
/deploy staging               ← auf Staging deployen
/deploy production            ← auf Production deployen
/deploy --check               ← nur Pre-Deploy Checklist prüfen
```

## ⚠️ Deploy-Sperre

Dieser Command wird **niemals automatisch** von der Pipeline ausgeführt.
Pipeline wartet immer auf explizite Bestätigung durch den User:
```
Pipeline hat Review abgeschlossen. Deploy starten? [ja / später]
```
Nur bei `ja` in der Chat-Eingabe wird /deploy ausgeführt.

## Ablauf

### 1. Pre-Deploy Checklist

**Code-Qualität:**
```
[ ] Alle Tests grün?
[ ] Keine offenen /qa Bugs?
[ ] Code Review (Review mit /review gemacht)?
[ ] CHANGELOG / Release Notes aktuell?
```

**Sicherheit:**
```
[ ] Keine Secrets im Code?
[ ] Environment Variables korrekt gesetzt?
[ ] .env Dateien in .gitignore?
[ ] Dependencies auf bekannte Vulnerabilities geprüft?
```

**Datenbank:**
```
[ ] Migrations vorhanden für alle Schema-Änderungen?
[ ] Migrations getestet (inkl. Rollback)?
[ ] Backup vor Migration?
```

**Deployment-Spezifisch** (aus CLAUDE.md laden):
```
[ ] [Projekt-spezifische Checks]
```

Wenn Checks fehlschlagen → STOP. Erklären was fehlt. Nicht deployen.

### 2. Deploy-Prozess

Führe die in CLAUDE.md definierten Deploy-Befehle aus:
1. Tests laufen lassen
2. Build erstellen
3. DB-Migrationen ausführen
4. App starten / neu starten
5. Health-Check

### 3. Post-Deploy Verifikation
```
[ ] App erreichbar?
[ ] Health-Endpoint antwortet?
[ ] Kritische User-Flows manuell testen
[ ] Fehler-Logs clean?
[ ] Performance normal?
```

### 4. Rollback-Plan
Wenn etwas schief geht:
- Zeige sofort den Rollback-Befehl
- DB-Migration zurückrollen wenn nötig
- Nie blind deployen ohne Rollback-Option

---

## FORGE Handoff

Nach erfolgreichem Deployment:
1. `.forge/state.md` → `deploy` auf `DONE`, Feature-Status auf `DONE`
2. Feature in "Abgeschlossene Features" Tabelle aufnehmen mit Datum
3. `CLAUDE.md` → letzte Deployment-Info aktualisieren
4. `.forge/changelog.md` → Deployment-Eintrag
5. Session-Log Eintrag: `[DATUM] PROJ-X deployed ✅`

Nach fehlgeschlagenem Deployment:
1. `.forge/state.md` → `deploy` auf `BLOCKED`
2. Rollback-Anweisungen ausgeben
3. Bug dokumentieren via `/forge-sync`
