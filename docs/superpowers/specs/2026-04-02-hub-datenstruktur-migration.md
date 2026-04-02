# Protokollbrowser: Hub-konforme Datenstruktur-Migration

**Datum:** 2026-04-02
**Referenz:** masterplan_hub_v2.3.md (ping-hub Boilerplate)

## Kontext

Der Protokollbrowser soll als Modul in den ping-hub integriert werden. Dafür müssen die internen Datenstrukturen dem Hub-Boilerplate-Schema entsprechen (HubBase/HubMixin, UUID-IDs, Timestamps, Response-Envelope, Pydantic-Schemas). Die App muss dabei mit den bestehenden Dateipfaden, Server-Standort und DOCUframe-Exchange weiter funktionieren. Nur die innere Datenstruktur wird angepasst.

## Entscheidungen

| Thema | Entscheidung |
|-------|-------------|
| Storage | SQLite als Zwischenschritt (später PostgreSQL) |
| IDs | Neue UUID4 + `legacy_id` für alte String-IDs |
| Offline | IndexedDB bleibt als Offline-Cache (Hub-konforme Objekte) |
| DOCUframe | Exchange-Layer (JSON-Dateien) bleibt unverändert |
| Ansatz | Inside-Out: 4 konzentrische Ringe, App bleibt nach jedem Ring funktional |

## Architektur: 4-Ring-Migration

### Ring 1 — Hub-konforme Backend-Models + SQLite

**Neue Verzeichnisstruktur im Backend:**

```
server/
├── core/
│   ├── base_model.py       # HubBase + HubMixin (UUID pk, created_at, updated_at, created_by)
│   ├── schemas.py          # ApiResponse[T], ApiListResponse[T], PaginationMeta
│   ├── database.py         # SQLAlchemy setup (SQLite, synchron)
│   └── dependencies.py     # CurrentUser stub (Header-basiert)
├── models/
│   ├── __init__.py
│   ├── protokollgruppe.py  # OBJECT_TYPE="protokollgruppe"
│   ├── protokoll.py        # OBJECT_TYPE="protokoll"
│   ├── element.py          # OBJECT_TYPE="protokollelement"
│   ├── teilnehmer.py       # OBJECT_TYPE="teilnehmer"
│   └── verantwortlicher.py # OBJECT_TYPE="verantwortlicher"
├── schemas/
│   ├── protokollgruppe.py  # Pydantic Create/Read/Update
│   ├── protokoll.py
│   ├── element.py
│   └── verantwortlicher.py
├── server.py               # Bestehend — behält DOCUframe-Exchange-Endpoints
├── hub.db                  # SQLite-Datenbank (neu)
└── data/                   # Unverändert
```

**HubMixin liefert für jedes Model:**

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | UUID4 | Primärschlüssel |
| `created_at` | datetime | Server-default: now() |
| `updated_at` | datetime | Server-default: now(), onupdate: now() |
| `created_by` | UUID \| None | Wer hat es erstellt (NULL im Prototyp) |

**Jedes Model hat zusätzlich:**

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `legacy_id` | str | Alte DOCUframe/App-ID für Rückwärtskompatibilität |
| `OBJECT_TYPE` | ClassVar[str] | Für polymorphe Queries (Hub-Baustein-Kompatibilität) |

**Model-Beispiel — Protokollelement:**

```python
class Protokollelement(HubBase, HubMixin):
    __tablename__ = "protokoll_elemente"
    OBJECT_TYPE: ClassVar[str] = "protokollelement"

    legacy_id: Mapped[str]
    protokoll_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("protokolle.id"))
    position: Mapped[str]
    positionstitel: Mapped[str] = mapped_column(default="")
    positionstext: Mapped[str] = mapped_column(default="")
    thema: Mapped[str] = mapped_column(default="")
    status: Mapped[int] = mapped_column(default=0)
    termin: Mapped[datetime | None]
    verantwortlicher_id: Mapped[uuid.UUID | None]
    verantwortlicher_name: Mapped[str] = mapped_column(default="")
    bemerkung: Mapped[str] = mapped_column(default="")
    erinnerung: Mapped[bool] = mapped_column(default=False)
    wert: Mapped[float] = mapped_column(default=0.0)
    verweise: Mapped[str] = mapped_column(default="[]")  # JSON-Array als String
    mobile_erfassung: Mapped[str | None]  # JSON-Column
    foto_anzahl: Mapped[int] = mapped_column(default=0)
    foto_pfad: Mapped[str | None]
    is_modified: Mapped[bool] = mapped_column(default=False)
    is_new: Mapped[bool] = mapped_column(default=False)
```

**SQLite-Besonderheiten vs. PostgreSQL:**
- Synchrone SQLAlchemy (kein asyncpg nötig)
- `JSON`-Typ als Text-Column mit JSON-Serialisierung
- Kein `TSVECTOR` — Volltext-Suche über SQLite FTS5 (optional, später)
- Migration: `Base.metadata.create_all()` (kein Alembic nötig für Prototyp)

**Dateien die geändert/erstellt werden:**

| Datei | Aktion |
|-------|--------|
| `server/core/base_model.py` | Neu erstellen |
| `server/core/schemas.py` | Neu erstellen |
| `server/core/database.py` | Neu erstellen |
| `server/core/dependencies.py` | Neu erstellen |
| `server/models/*.py` | Neu erstellen (5 Model-Dateien) |
| `server/schemas/*.py` | Neu erstellen (4 Schema-Dateien) |
| `server/server.py` | Erweitern: SQLite-Init, DOCUframe-Import → SQLite |

---

### Ring 2 — API-Envelope + Pagination

**Response-Envelope (alle Endpoints):**

```python
# Erfolg (Einzelobjekt)
{"data": {...}, "meta": {}, "errors": []}

# Erfolg (Liste mit Pagination)
{"data": [...], "meta": {"page": 1, "size": 20, "total": 42, "pages": 3}, "errors": []}

# Fehler
{"data": null, "meta": {}, "errors": [{"code": "NOT_FOUND", "message": "..."}]}
```

**Bestehende Endpoints — Envelope-Wrapping:**

| Endpoint | Änderung |
|----------|----------|
| `GET /api/projects` | Envelope + Pagination (`?page=&size=`) |
| `GET /api/projects/{id}/status` | Envelope |
| `GET /api/projects/{id}/export` | **Bleibt roh** (DOCUframe-Interface) |
| `POST /api/projects/{id}/sync` | Envelope |
| `POST /api/projects/{id}/upload-zip` | Envelope |
| `GET /api/health` | **Bleibt roh** (Konvention) |

**Neue CRUD-Endpoints (Hub-konform, SQLite-backed):**

```
GET    /api/protokollgruppen                    → Paginierte Liste
GET    /api/protokollgruppen/{id}               → Einzelobjekt
GET    /api/protokolle?gruppe_id={uuid}         → Paginierte Liste, Filter
GET    /api/protokolle/{id}                     → Einzelobjekt
GET    /api/elemente?protokoll_id={uuid}        → Paginierte Liste, Filter
GET    /api/elemente/{id}                       → Einzelobjekt
POST   /api/elemente                            → Erstellen (UUID generiert)
PUT    /api/elemente/{id}                       → Aktualisieren
DELETE /api/elemente/{id}                       → Löschen
GET    /api/verantwortliche                     → Liste aller Firmen/Personen
```

**Router-Struktur:**

| Datei | Prefix | Beschreibung |
|-------|--------|-------------|
| `server/routers/protokollgruppen.py` | `/api/protokollgruppen` | CRUD |
| `server/routers/protokolle.py` | `/api/protokolle` | CRUD + Filter |
| `server/routers/elemente.py` | `/api/elemente` | CRUD + Filter + Status |
| `server/routers/verantwortliche.py` | `/api/verantwortliche` | Read-only |

**Dateien die geändert/erstellt werden:**

| Datei | Aktion |
|-------|--------|
| `server/routers/*.py` | Neu erstellen (4 Router-Dateien) |
| `server/server.py` | Router registrieren, bestehende Endpoints Envelope wrappen |
| `app/src/syncService.ts` | Response-Parsing: `.data` extrahieren |

---

### Ring 3 — Frontend-Types + IndexedDB

**Neue Type-Hierarchie (`app/src/types.ts`):**

```typescript
// Hub-Basis
interface HubEntity {
  id: string;            // UUID4
  created_at: string;    // ISO datetime
  updated_at: string;    // ISO datetime
  created_by: string | null;
}

// Domain-Types erben von HubEntity, alle Felder snake_case
interface Protokollgruppe extends HubEntity {
  object_type: "protokollgruppe";
  legacy_id: string;
  name: string;
  projekt_nummer: string;
  projekt_name: string;
  projekt_stammverzeichnis: string;
  protokollnummer: number;
  vorwort: string;
  nachwort: string;
  themen: string;
  bemerkung: string;
}

interface Protokoll extends HubEntity {
  object_type: "protokoll";
  legacy_id: string;
  gruppe_id: string;
  name: string;
  nummer: number;
  datum: string;
  ort: string;
  autor: string;
  vorbemerkung: string;
  nachbemerkung: string;
  erledigt: boolean;
  ist_einzelprotokoll: boolean;
  erstellt: boolean;
  signatur: string;
  teilnehmer: Teilnehmer[];
  verteiler: Teilnehmer[];
  is_new: boolean;
}

interface Protokollelement extends HubEntity {
  object_type: "protokollelement";
  legacy_id: string;
  protokoll_id: string;
  position: string;
  positionstitel: string;
  positionstext: string;
  thema: string;
  status: number;
  termin: string;
  verantwortlicher_id: string | null;
  verantwortlicher_name: string;
  bemerkung: string;
  erinnerung: boolean;
  wert: number;
  verweise: string[];
  mobile_erfassung: MobileErfassung;
  is_modified: boolean;
  is_new: boolean;
}
```

**Feld-Mapping (Alt → Neu):**

| Alt (PascalCase) | Neu (snake_case) |
|-------------------|------------------|
| `Id` | `id` (UUID) |
| `ProtokollId` | `protokoll_id` |
| `ProjektNummer` | `projekt_nummer` |
| `VerantwortlicherFirmaOid` | `verantwortlicher_id` |
| `VerantwortlicherFirmaName` | `verantwortlicher_name` |
| `_geaendert` | `is_modified` |
| `_neu` | `is_new` |
| `GruppeId` | `gruppe_id` |

**IndexedDB-Migration (`app/src/db.ts`):**

- `DB_VERSION`: 5 → 6
- `upgrade(db, oldVersion)`: Migration bei Version < 6
  - Bestehende Objekte lesen, UUID hinzufügen, Felder umbenennen
  - KeyPath bleibt `id`
  - Indices: `byGruppe` → `gruppe_id`, `byProtokoll` → `protokoll_id`, `byElement` → `element_id`

**Dateien die geändert werden:**

| Datei | Aktion |
|-------|--------|
| `app/src/types.ts` | Komplett umschreiben |
| `app/src/db.ts` | DB_VERSION 6, Migration, neue Feldnamen |
| `app/src/dfimport.ts` | UUID-Generierung, snake_case Mapping |
| `app/src/components/*.tsx` | Alle Feld-Referenzen PascalCase → snake_case |

---

### Ring 4 — Sync-Layer Anpassung

**Adapter-Schicht (`app/src/adapters/docuframe.ts`):**

```typescript
// DOCUframe-Export → Hub-konforme Objekte
export function dfToHub(rawPakete: DfRawData[]): ProtokollPaket[]

// Hub-konforme Objekte → DOCUframe-Import-Format
export function hubToDf(elemente: Protokollelement[]): DfElement[]
```

**Download-Flow (Server → PWA):**

```
GET /api/projects/{id}/export  →  DOCUframe-Rohformat
        ↓
  dfToHub(rawData)             →  Hub-konforme Objekte
        ↓
  importPakete(hubPakete)      →  IndexedDB (Hub-Format)
```

**Upload-Flow (PWA → Server):**

```
  IndexedDB (Hub-Format)       →  Geänderte Elemente sammeln
        ↓
  hubToDf(elemente)            →  DOCUframe-Format (PascalCase, legacy_id)
        ↓
  ZIP erstellen + Upload       →  POST /api/projects/{id}/upload-zip
        ↓
  Server: import/ready/        →  DOCUframe-kompatibel
  Server: SQLite update        →  Hub-konform
```

**Was NICHT geändert wird:**
- DOCUframe-Verzeichnisstruktur (`data/export/`, `data/import/`)
- JSON-Format der DOCUframe-Dateien
- Foto-Ablage-Pfade auf dem Fileserver (`K:\projekte\...`)
- Server-Umgebungsvariablen (`EXCHANGE_DATA_DIR`, `EXCHANGE_PORT`, `PROJEKTE_BASE`)

**Dateien die geändert/erstellt werden:**

| Datei | Aktion |
|-------|--------|
| `app/src/adapters/docuframe.ts` | Neu erstellen |
| `app/src/syncService.ts` | Adapter nutzen, Envelope-Parsing |
| `app/src/components/ExportScreen.tsx` | hubToDf() beim Export nutzen |
| `app/src/components/ServerImportScreen.tsx` | dfToHub() beim Import nutzen |
| `server/server.py` | Upload-Endpoint: zusätzlich SQLite updaten |

---

## Zusammenfassung: Betroffene Dateien

### Neue Dateien (Backend)

| Datei | Inhalt |
|-------|--------|
| `server/core/__init__.py` | Package |
| `server/core/base_model.py` | HubBase + HubMixin |
| `server/core/schemas.py` | ApiResponse, ApiListResponse, Pagination |
| `server/core/database.py` | SQLAlchemy Engine + Session (SQLite) |
| `server/core/dependencies.py` | CurrentUser Stub |
| `server/models/__init__.py` | Model-Imports |
| `server/models/protokollgruppe.py` | Protokollgruppe Model |
| `server/models/protokoll.py` | Protokoll Model |
| `server/models/element.py` | Protokollelement Model |
| `server/models/teilnehmer.py` | Teilnehmer Model |
| `server/models/verantwortlicher.py` | Verantwortlicher Model |
| `server/schemas/__init__.py` | Schema-Imports |
| `server/schemas/protokollgruppe.py` | Pydantic CRUD Schemas |
| `server/schemas/protokoll.py` | Pydantic CRUD Schemas |
| `server/schemas/element.py` | Pydantic CRUD Schemas |
| `server/schemas/verantwortlicher.py` | Pydantic CRUD Schemas |
| `server/routers/__init__.py` | Router-Imports |
| `server/routers/protokollgruppen.py` | CRUD Router |
| `server/routers/protokolle.py` | CRUD Router |
| `server/routers/elemente.py` | CRUD Router |
| `server/routers/verantwortliche.py` | Read-only Router |

### Neue Dateien (Frontend)

| Datei | Inhalt |
|-------|--------|
| `app/src/adapters/docuframe.ts` | dfToHub() + hubToDf() Adapter |

### Geänderte Dateien

| Datei | Änderung |
|-------|----------|
| `server/server.py` | SQLite-Init, Router-Registration, Envelope-Wrapping |
| `server/requirements.txt` | sqlalchemy hinzufügen |
| `app/src/types.ts` | HubEntity-Basis, snake_case, UUID |
| `app/src/db.ts` | DB_VERSION 6, Migration, neue Feldnamen |
| `app/src/dfimport.ts` | UUID-Gen, snake_case Output |
| `app/src/syncService.ts` | Adapter, Envelope-Parsing |
| `app/src/components/*.tsx` | Feld-Referenzen PascalCase → snake_case |

---

## Verifikation

Nach jedem Ring muss die App vollständig funktionieren:

### Ring 1
- [ ] SQLite-DB wird beim Server-Start erstellt
- [ ] DOCUframe-JSON-Import schreibt korrekt in SQLite
- [ ] `legacy_id` enthält alte DOCUframe-OIDs
- [ ] Bestehende Exchange-Endpoints funktionieren weiterhin

### Ring 2
- [ ] Alle Endpoints liefern `{data, meta, errors}` Envelope
- [ ] Pagination funktioniert (`?page=1&size=20`)
- [ ] Neue CRUD-Endpoints liefern korrekte Daten aus SQLite
- [ ] DOCUframe-Export-Endpoint bleibt roh (kein Envelope)

### Ring 3
- [ ] IndexedDB-Migration v5 → v6 funktioniert ohne Datenverlust
- [ ] Alle Komponenten nutzen snake_case Felder
- [ ] UUID-Generierung bei neuem Import funktioniert
- [ ] Status-Map und Filterung weiterhin korrekt

### Ring 4
- [ ] Download: DOCUframe → dfToHub() → IndexedDB Hub-Format
- [ ] Upload: IndexedDB → hubToDf() → DOCUframe-Format ZIP
- [ ] Server schreibt Upload sowohl in `import/ready/` als auch SQLite
- [ ] Offline-Queue (pendingExports) funktioniert mit Hub-Format
- [ ] Foto-Upload und Ablage auf Fileserver unverändert
