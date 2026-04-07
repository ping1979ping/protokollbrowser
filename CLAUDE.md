# CLAUDE.md — protokollbrowser

> Automatisch generiert von FORGE | Letzte Aktualisierung: 2026-04-07

---

## Projekt-Übersicht

**Name:** protokollbrowser (Protokoll-App)
**Typ:** Mobile PWA + Python Server + DOCUframe-Bridge
**Status:** aktiv

Mobile PWA zur Erfassung und Bearbeitung von Baustellenprotokollen auf Smartphone und Tablet. Arbeitet vollständig offline, synchronisiert über JSON-Export/Import mit DOCUframe (DOCUcontrol-Makros). Bidirektionale Synchronisation via Hub-konformem Datenformat.

---

## Tech Stack

**Backend:** Python (FastAPI/HTTP), SQLite, Pydantic-Schemas, PyInstaller-Build
**Frontend:** React 19 + TypeScript + Vite, Tailwind CSS v4, IndexedDB (`idb`), Service Worker (vite-plugin-pwa / Workbox), Leaflet (`react-leaflet`), JSZip
**Datenbank:** SQLite (Server-seitig), IndexedDB (Client-seitig, offline-first)
**Deployment:** SvDocu-Server (PWA via E:/pwa/) + DOCUframe (Server-Sync via DOCUcontrol-Hub-Makros)
**Package Manager:** npm (App), pip + venv (Server)
**Test-Framework:** TODO — bisher manuelles UAT

---

## Verzeichnisstruktur

```
protokollbrowser/
├── app/                    # React/Vite PWA
│   ├── src/
│   │   ├── components/     # UI-Komponenten
│   │   ├── db.ts           # IndexedDB-Layer
│   │   └── syncService.ts  # Sync-Logik gegen Server
│   └── vite.config.ts
├── server/                 # Python-Server
│   ├── server.py           # Entry-Point
│   ├── routers/            # HTTP-Routen
│   ├── core/               # Kernlogik
│   ├── models/             # ORM/Schemas
│   ├── schemas/            # Pydantic
│   ├── data/               # SQLite + Bestände
│   └── venv/               # Python venv (KAPUTT — neu erstellen)
├── docucontrol/            # DOCUframe-Makros (.dfm, UTF-16LE)
├── docs/superpowers/       # GSD-Plans und Specs
├── INBOX/                  # Unsortierte Notizen
└── README.md
```

---

## Code-Conventions

- **Sprache:** TypeScript (App), Python (Server), DOCUcontrol (DOCUframe-Makros) — Kommentare & Commits: Deutsch
- **Formatting:** ESLint (App), keine harten Regeln Server-seitig
- **Linting:** ESLint mit react-hooks + react-refresh
- **Namenskonventionen:** PING-Präfix für DOCUcontrol-Custom-Felder/-Klassen (`_PING…`), Hub-konformes snake_case in JSON-Payloads, camelCase in TypeScript

---

## Wichtige Befehle

```bash
# App: Entwicklung starten
cd app && npm run dev

# App: Produktion bauen
cd app && npm run build

# Server: starten (lokal)
cd server && start-local.bat

# Server: Build (PyInstaller .exe — Server hat kein Python)
cd server && python -m PyInstaller protokoll-exchange.spec

# Deploy PWA auf SvDocu
cd server && deploy_pwa.bat
```

---

## FORGE Prevention Rules

> Auto-generiert aus .forge/preventions.md | Nicht manuell bearbeiten

_(noch keine Rules — werden über `/forge-sync` bei Bug-Erkennung gepflegt)_

---

## Feature-Tracking

Feature Specs liegen in `features/PROJ-X.md`.
GSD-Plans liegen parallel in `docs/superpowers/plans/`.
Aktuelles Feature: —

---

## Bekannte Eigenheiten & Gotchas

- **Server hat kein Python** — nur EXEs deployen, kein Unicode in `print()`
- **Server-venv kaputt** — `server/venv/` muss bei Bedarf neu erstellt werden
- **PWA-Deploy auf SvDocu**: nach `E:/pwa/` kopieren; Manifest-Description ändern, damit iPhone den Service-Worker als Update erkennt
- **DOCUcontrol-Syntax**: nie raten — immer `docucontrol`-Skill-Referenz prüfen (`MessageBox` nicht `MsgBox`, `INT` nicht `INTEGER`, etc.)
- **`.dfm`-Dateien sind UTF-16LE** mit BOM — beim Lesen mit `sed 's/\x00//g'` filtern
- **Hub-Format**: snake_case + `object_type` + `legacy_id` (siehe letzte Migration)
- **GSD läuft parallel** — `.planning/`, `docs/superpowers/plans/` und FORGE-Pipeline ergänzen sich, ersetzen sich nicht
- **Vorhandene Skills**: `docucontrol`, `ping-corporate-design`

---

## Externe Services & Abhängigkeiten

- **DOCUframe-Server** (SvDocu) — Sync-Ziel via Hub-Format, Zugriff über VPN, HTTPS/SSL
- **GitHub Pages** — Hosting der PWA (HTTPS für Service-Worker erforderlich)
- **VPN-Zugang** zum Exchange-Server SvDocu (Cloudflare fraglich)
