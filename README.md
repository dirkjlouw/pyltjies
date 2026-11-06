# Pyltjies

*For tossers.* A private darts scorer, league and banter board for friends. It's a PWA, so you add it to your phone's home screen.

- **301 and 501:** tap each dart or type a three-dart total. It does the subtraction and calls busts. Double in and double out can be set per player.
- **Killer, as on the cupboard door:** rows 20 to 10, D, T and B. See [SPEC.md](SPEC.md) for the rules.
- **Handicap like golf:** your best 8 of your last 20 games under the same rules, turned into a head start.
- **League:** a ladder, head-to-heads, match log, banter and result pictures for WhatsApp.
- **Works without signal:** a game lives on the phone, and a finished one is sent when you're back online.

## Run the tests

Local Node is broken on the Mac, so use Docker:

```bash
docker run --rm -v "$PWD":/w -w /w -e HOME=/root mcr.microsoft.com/playwright:v1.64.1-noble sh -c "npm ci && npm test && npx playwright test"
```

## Try it locally

```bash
docker compose -f compose.local.yaml up --build
```

Sign-in codes appear in `docker compose -f compose.local.yaml logs`. Set `OWNER_EMAIL` in `.env` first. Stop it and remove the image when you're done, because an old tab keeps showing the cached version.

See [SPEC.md](SPEC.md), [ROADMAP.md](ROADMAP.md) and [DEPLOY.md](DEPLOY.md).
