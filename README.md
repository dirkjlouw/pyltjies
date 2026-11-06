# Pyltjies

*For tossers.* A free, open source darts scorer, league and banter board for you and your friends. It's a PWA, so you add it to your phone's home screen.

No ads, no tracking, and nobody is making money from this. It's just for fun, and [contributions are welcome](CONTRIBUTING.md).

- **301 and 501:** tap each dart or type a three-dart total. It does the subtraction and calls busts. Double in and double out can be set per player.
- **Killer, as on the cupboard door:** rows 20 to 10, D, T and B. See [SPEC.md](SPEC.md) for the rules.
- **Handicap like golf:** your best 8 of your last 20 games under the same rules, turned into a head start.
- **League:** a ladder, head-to-heads, match log, banter and result pictures for WhatsApp.
- **Works without signal:** a game lives on the phone, and a finished one is sent when you're back online.

## Browsers

Automated tests run on the engines behind Safari, Chrome, Edge, Brave and Firefox, at phone and desktop sizes, upright and sideways. Those are simulated devices, so tell us if something looks wrong on a real one.

## Run your own

Each group of friends runs its own copy, so every league is its own. The code is public, but your league isn't: games, names and banter stay behind sign-in on your server. See [DEPLOY.md](DEPLOY.md).

## Contribute

Bug reports, house rules, banter lines and code are all welcome, and you're free to fork it. The maintainer approves what goes into `main`. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Run the tests

The easiest way is Docker:

```bash
docker run --rm -v "$PWD":/w -w /w -e HOME=/root mcr.microsoft.com/playwright:v1.64.1-noble sh -c "npm ci && npm test && npx playwright test"
```

## Try it locally

```bash
docker compose -f compose.local.yaml up --build
```

Sign-in codes appear in `docker compose -f compose.local.yaml logs`. Set `OWNER_EMAIL` in `.env` first. Stop it and remove the image when you're done, because an old tab keeps showing the cached version.

See [SPEC.md](SPEC.md) for the rules and [ROADMAP.md](ROADMAP.md) for what's next.

## Licence

[MIT](LICENSE). Use it, change it and share it, and keep the licence notice.
