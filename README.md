# Odlingskampen Live

En enkel liveskarm for en melonodlingstavling. Appen har nu bade admin- och deltagarlogin.

Adminvyer:

- `?view=settings` for tavlingsinstallningar
- `?view=operator` for deltagare, bilder och invagningar
- `?view=presenter` for presentationskontroll
- `?view=board` for publikskarmen

Deltagarvy:

- `/participant.html` for deltagarens egna bilder och placering

Appens visuella lager laddar Scania Tegel fran CDN. Om ni vill kunna kora helt offline senare behover Tegel-filerna laggas lokalt i projektet.

## Starta lokalt

1. Oppna en terminal i projektmappen.
2. Starta servern:

```powershell
py server.py
```

3. Oppna sedan login-sidan i webblasaren:

```text
http://127.0.0.1:8080/login
```

Standardinloggning for admin:

```text
Anvandarnamn: admin
Losenord: Odlingskampen2026
```

4. Deltagare loggar in med ett automatiskt anvandarnamn baserat pa namn:

```text
Anna Andersson -> Anna.Andersson
```

Admin satter deltagarens losenord under `Deltagare` i adminvyn.

5. Oppna sedan vyerna efter inloggning:

```text
http://127.0.0.1:8080/index.html?view=settings
http://127.0.0.1:8080/index.html?view=operator
http://127.0.0.1:8080/index.html?view=presenter
http://127.0.0.1:8080/index.html?view=board
http://127.0.0.1:8080/participant.html
```

## Byt adminlosenord

Kor detta i projektmappen och folj prompten:

```powershell
py server.py --set-password
```

## Visa pa annan dator i natverket

Starta servern sa att den lyssnar pa natverket:

```powershell
py server.py --host 0.0.0.0 --port 8080
```

Oppna sedan samma URL:er via datorns namn eller IP-adress.

## Deploy med Docker eller Portainer

Den har appen passar bra i en Linux-VM i Proxmox med Docker. Projektet innehaller nu:

- `Dockerfile`
- `compose.yaml`

Rekommenderat upplagg:

- kor appen som en enda container
- spara `data/` och `uploads/` i Docker-volymer
- lagg en reverse proxy framfor om ni vill na den via eget domannamn och HTTPS

### Docker Compose pa servern

1. Kopiera projektet till servern, till exempel `/opt/odlingskampen`
2. Gå till mappen
3. Starta:

```bash
docker compose up -d --build
```

Appen svarar sedan pa:

```text
http://SERVER-IP:8180/login
```

### Portainer

Enklast i Portainer ar att deploya som `Stack` fran Git-repo eller fran filer pa servern, eftersom stacken bygger en lokal image via `build: .`.

Anvand `compose.yaml` som stackfil.

### Viktigt i drift

- `data/` innehaller tavlingsdata och inloggningsuppgifter
- `uploads/` innehaller deltagarnas bilder
- om containern startas om loggas aktiva sessioner ut, eftersom sessionerna ligger i minnet
- Tegel laddas fortfarande fran CDN, sa servern behover internet om ni inte flyttar de filerna lokalt senare

## Hur appen fungerar

- Tavlingsdata och presentationslage sparas i `data/state.json`.
- Inloggningsuppgifter sparas i `data/auth.json`.
- Uppladdade deltagarbilder sparas som filer i `uploads/`.
- Scoreboarden uppdateras live nar ny vikt registreras.
- Spotlightlaget kan autovaxla mellan deltagare och visar bilder plus kort presentation.
- Om samma deltagare vags igen anvands den senaste invagningen som officiell vikt.

## Nasta steg

- Lagg till export till Excel eller CSV efter tavlingen.
- Lagg till foretagslogo och egen eventbranding.
- Koppla appen till en digital vag om ni har ett grannssnitt for den.

## Proxmox snabbstart

For Proxmox finns nu tva driftalternativ i projektet:

- `compose.yaml` for vanliga Docker-volymer
- `compose.proxmox.yaml` for bind mounts i projektmappen

Rekommenderat pa en Debian 12-VM eller Debian 12-LXC:

```bash
cd /opt
git clone <repo-eller-kopiera-filerna> odlingskampen
cd /opt/odlingskampen
chmod +x deploy/install-proxmox-vm.sh
sudo APP_DIR=/opt/odlingskampen APP_USER=$USER bash deploy/install-proxmox-vm.sh
docker compose -f compose.proxmox.yaml up -d --build
```

Appen blir da tillganglig pa:

```text
http://SERVER-IP:8180/login
```

I `compose.proxmox.yaml` sparas driftdata direkt i:

- `/opt/odlingskampen/data`
- `/opt/odlingskampen/uploads`
