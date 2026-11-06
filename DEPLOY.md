# Deploying Pyltjies

One small Docker container serves the app and the API. The database lives in one Docker volume, with a daily snapshot taken automatically. Put a reverse proxy in front of it for HTTPS.

```
phone ──HTTPS──▶ reverse proxy ──▶ pyltjies container :8080 ──▶ /data/pyltjies.db, /data/backups/
```

This repo is public, so keep your own addresses and host details out of it.

## 1. The host

Any small Linux machine or container with Docker: 1 core, 512 MB RAM and 8 GB of disk is plenty. Install Docker and rsync, and include the machine in your backups.

## 2. Settings

On the first ship, `.env.example` is copied to `/opt/pyltjies/.env`. Fill it in and run `docker compose up -d`.

| Setting | What it does |
|---|---|
| `OWNER_EMAIL` | **Required.** The first person who can sign in. |
| `PUBLIC_URL` | Used in invite links. |
| `TRUST_PROXY` | `1` behind a proxy: rate limits use `X-Forwarded-For`, and the cookie is `Secure` over HTTPS. `0` if the port is reached directly. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Mail for sign-in codes and invites. Without `SMTP_HOST` they go to `docker compose logs pyltjies`. |
| `BACKUP_KEEP` | Daily database snapshots to keep in `/data/backups` (14). |
| `TZ`, `PYLTJIES_PORT` | Time zone for logs, and the port the proxy points at. |

## 3. Ship

From a clean `main`, after a snapshot of the host, with the owner's go-ahead:

```bash
./scripts/ship.sh user@your-host
```

Data is in a Docker volume and is never touched by a ship.

**Versions.** Every release bumps `package.json` (+ lock), `app/version.js` and `app/sw.js` together. A test checks that they match.

## 4. HTTPS and DNS

Point a DNS record for your domain at the proxy, and proxy that domain to `<host>:8080`. Rate limit `POST /api/auth/*` at the proxy as well as in the app.

## 5. First sign-in

Open the site and sign in with `OWNER_EMAIL`. Then go to **You → Make an invite link**.

## Backups

The server writes `/data/backups/pyltjies-YYYY-MM-DD.db` once a day. A backup of the host covers it. The database holds email addresses and sign-in data, so never commit it.
