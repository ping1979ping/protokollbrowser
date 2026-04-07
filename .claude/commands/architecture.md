# /architecture — System Design

## Zweck
Designed die technische Architektur für ein Feature oder das Gesamtsystem.
Klärt Struktur, bevor Sub-Agents mit der Implementierung beginnen.

## Aufruf
```
/architecture PROJ-X          ← Feature-Architektur
/architecture <Thema>         ← freie Architektur-Frage
/architecture --full          ← Gesamtsystem-Review
```

## Ablauf

### 1. Kontext laden
- Lies `CLAUDE.md` — Tech Stack, Conventions
- Lies `features/PROJ-X.md` wenn Feature-bezogen
- Lies `.forge/preventions.md` — aktive Prevention Rules beachten

### 2. Architektur entwerfen

Analysiere und dokumentiere:

**Komponenten-Übersicht:**
- Welche neuen Dateien / Module entstehen?
- Welche bestehenden Dateien werden geändert?
- Neue Abhängigkeiten nötig?

**Datenfluss:**
- Wie fließen Daten durch das System?
- API-Contracts (Request/Response Schemas)
- Datenbank-Schema-Änderungen?

**Schnittstellen:**
- Zwischen Frontend ↔ Backend
- Zu externen Services

**Risiken:**
- Performance-Bottlenecks?
- Sicherheits-Risiken?
- Breaking Changes?

### 3. Implementierungsplan

Erstelle eine geordnete Task-Liste:
```
[ ] 1. DB-Migration schreiben
[ ] 2. Model/Schema erstellen
[ ] 3. API-Endpoint implementieren
[ ] 4. Frontend-Komponente bauen
[ ] 5. Tests schreiben
[ ] 6. Integration testen
```

### 4. Feature Spec aktualisieren
Ergänze `features/PROJ-X.md` Sektion "Technische Notizen" mit dem Design.

### 5. Human-in-the-Loop
Zeige Architektur-Entscheidungen dem User.
Frage: *"Macht das technisch Sinn für euer Setup? Gibt es Constraints die ich nicht kenne?"*

Warte auf Bestätigung.

---

## FORGE Handoff

Nach Abschluss dieses Commands:
1. `.forge/state.md` → `architecture` auf `DONE`, `backend` als nächste Phase
2. Prüfe: Hat das Projekt ein Frontend? Wenn nein → `frontend` als `SKIPPED` markieren
3. Session-Log Eintrag hinzufügen
4. Wenn im Pipeline-Modus: direkt `/backend PROJ-X` starten
5. Wenn standalone: *"Soll ich direkt mit /backend weitermachen?"*
