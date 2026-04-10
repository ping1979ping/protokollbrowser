# Cloudflare Tunnel: Einrichtung auf SvDocu

## Anleitung für Stefan

### Was ist das?

Cloudflare Tunnel erlaubt es, einen internen Server **ohne offene Firewall-Ports** im Internet erreichbar zu machen. Der Dienst `cloudflared` auf SvDocu baut eine **ausgehende** Verbindung zu Cloudflare auf. Anfragen von außen werden durch diesen Tunnel zum lokalen Server weitergeleitet.

- Kein Port öffnen in der Firewall nötig
- Kein VPN nötig auf den Endgeräten (iPhone, iPad, Laptop)
- Kostenlos (Cloudflare Zero Trust Free Tier, bis 50 User)
- HTTPS automatisch (TLS-Zertifikat von Cloudflare)
- Zugangsschutz per Cloudflare Access (nur bestimmte Email-Adressen)

### Architektur

```
[iPhone/iPad/Laptop]
    ↓ (HTTPS über beliebiges Internet)
[Cloudflare Edge + Access-Zugangsschutz]
    ↓ (ausgehender Tunnel von SvDocu)
[SvDocu: cloudflared → localhost:8080]
    ↓
[FastAPI Server (protokoll-exchange.exe)]
    ↓
[K:\Sonstige\Docuframe-Exchange\data\]
```

### Voraussetzungen

- Domain `pettering.de` (DNS muss angepasst werden, siehe Schritt 2)
- SvDocu hat Internet-Zugang (ausgehend, HTTPS Port 443)
- `protokoll-exchange.exe` läuft auf SvDocu und lauscht auf Port 8080

---

## Schritt 1: Cloudflare-Account erstellen

1. https://dash.cloudflare.com/sign-up öffnen
2. Account erstellen (Email + Passwort)
3. **Free Plan** auswählen (reicht vollkommen)

## Schritt 2: Domain bei Cloudflare einrichten

### Option A — Nameserver umstellen (empfohlen)

1. Im Cloudflare Dashboard → **"Add a site"** → `pettering.de` eingeben
2. Free Plan wählen
3. Cloudflare zeigt zwei Nameserver an (z.B. `anna.ns.cloudflare.com`, `bob.ns.cloudflare.com`)
4. Beim aktuellen Domain-Registrar die Nameserver auf diese Cloudflare-Nameserver umstellen
5. **Wichtig:** Bestehende DNS-Records (Webseite, Email MX-Records etc.) **vorher** in Cloudflare übernehmen!
6. Warten bis Propagation abgeschlossen (bis zu 24h, oft unter 1h)

### Option B — Nur CNAME (falls Nameserver nicht umgestellt werden sollen)

1. Beim bestehenden DNS-Provider einen CNAME-Record anlegen:
   ```
   exchange.pettering.de → <tunnel-id>.cfargotunnel.com
   ```
   (Die Tunnel-ID bekommt man in Schritt 4)

## Schritt 3: cloudflared auf SvDocu installieren

1. **Download:** https://github.com/cloudflare/cloudflared/releases/latest
   - Datei: `cloudflared-windows-amd64.msi`
2. **Installieren:** MSI-Datei ausführen
   - Installiert nach `C:\Program Files (x86)\cloudflared\`
3. **Prüfen:** Eingabeaufforderung als **Administrator** öffnen:
   ```cmd
   cloudflared --version
   ```
   → Sollte Version anzeigen (z.B. `cloudflared version 2025.x.x`)

## Schritt 4: Tunnel erstellen

Eingabeaufforderung **als Administrator** auf SvDocu:

### 4a. Bei Cloudflare anmelden

```cmd
cloudflared tunnel login
```

→ Öffnet einen Browser, dort mit dem Cloudflare-Account anmelden und Domain `pettering.de` autorisieren.

### 4b. Tunnel erstellen

```cmd
cloudflared tunnel create protokoll-exchange
```

→ Zeigt eine **Tunnel-ID** (UUID, z.B. `a1b2c3d4-e5f6-...`)
→ Erstellt eine Credentials-Datei: `C:\Users\<User>\.cloudflared\<tunnel-id>.json`

**Tunnel-ID notieren!**

### 4c. DNS-Eintrag automatisch erstellen

```cmd
cloudflared tunnel route dns protokoll-exchange exchange.pettering.de
```

→ Erstellt automatisch den CNAME-Eintrag bei Cloudflare.

## Schritt 5: Tunnel konfigurieren

Datei erstellen: `C:\Users\<User>\.cloudflared\config.yml`

```yaml
tunnel: protokoll-exchange
credentials-file: C:\Users\<User>\.cloudflared\<tunnel-id>.json

ingress:
  - hostname: exchange.pettering.de
    service: http://localhost:8080
  - service: http_status:404
```

**Hinweis:** `<User>` und `<tunnel-id>` durch die tatsächlichen Werte ersetzen!

## Schritt 6: Testen

```cmd
cloudflared tunnel run protokoll-exchange
```

→ Tunnel startet, Ausgabe zeigt "Registered connectors"

Im Browser testen:
```
https://exchange.pettering.de/api/health
```

→ Erwartete Antwort: `{"status": "ok", "time": "2026-03-23T..."}`

Mit **Strg+C** beenden wenn Test erfolgreich war.

## Schritt 7: Als Windows-Dienst installieren

```cmd
cloudflared service install
```

→ Installiert als Windows-Dienst (startet automatisch bei Serverstart)
→ Dienst heißt **"Cloudflared"** in `services.msc`

**Prüfen:**
```cmd
sc query cloudflared
```
→ Status sollte "RUNNING" sein.

## Schritt 8: Zugangsschutz einrichten (Cloudflare Access)

Damit nicht jeder im Internet auf den Server zugreifen kann:

1. Im Cloudflare Dashboard → **Zero Trust** (linkes Menü)
2. **Access** → **Applications** → **Add an Application**
3. **Self-hosted** auswählen
4. Konfiguration:
   - **Application name:** `Protokoll Exchange`
   - **Application domain:** `exchange.pettering.de`
   - **Session Duration:** 24 hours (oder 7 days)
5. **Policy erstellen:**
   - **Policy name:** `Mitarbeiter`
   - **Action:** Allow
   - **Include:** Emails ending in `@pettering.de`
     (oder: Liste spezifischer Email-Adressen der Nutzer)
6. **Speichern**

**Ergebnis:** Beim ersten Zugriff auf `exchange.pettering.de` wird eine Email-Verifizierung verlangt. Danach bleibt man für die gewählte Dauer eingeloggt.

**Für die PWA:** Cloudflare Access setzt ein Cookie (`CF_Authorization`). Die App im Browser bekommt das Cookie automatisch — API-Calls funktionieren transparent.

---

## Troubleshooting

| Problem | Lösung |
|---------|--------|
| `cloudflared tunnel login` öffnet keinen Browser | URL aus der Ausgabe manuell im Browser öffnen |
| DNS-Eintrag nicht sichtbar | 5 Min warten, dann `ipconfig /flushdns` |
| Tunnel startet nicht als Dienst | `cloudflared service uninstall` dann `cloudflared service install` erneut |
| 502 Bad Gateway | `protokoll-exchange.exe` läuft nicht auf Port 8080 — prüfen mit `curl http://localhost:8080/api/health` |
| Access-Login bei jedem Besuch | Session Duration in Cloudflare Access erhöhen (z.B. 7 days) |

---

## Zusammenfassung

Nach der Einrichtung:
- **Nutzer** öffnen einfach `https://exchange.pettering.de` im Browser — kein VPN, keine App, kein Setup
- **Sync** funktioniert automatisch über jede Internetverbindung (Mobil, WLAN, egal)
- **Sicherheit** durch Cloudflare Access (Email-Verifizierung)
- **Kosten:** 0 € (Free Tier)
