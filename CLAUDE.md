# Working on Pyltjies

Rules for any person or AI agent changing this repo. Read SPEC.md first.

- **Never commit or push straight to `main`.** Every change: `git switch -c <type>/<name>` (`feat/`, `fix/`, `docs/`, `chore/`), commits, push, `gh pr create`.
- **Tests run before the PR** and pass in CI: `npm test` for rules, ratings and server, and the Playwright phone tests (`e2e/`) for anything on screen. Local Node is broken on the Mac, so run them in Docker (see `playwright.config.js`).
- **Rules live in `app/games.js` only.** The phone and the server share it. The server replays every saved game from its darts and never believes a sent score.
- **Database:** schema changes are a new entry at the end of `MIGRATIONS` in `server/db.js`; never edit an old one.
- **Version:** every release bumps `package.json` (+ lock), `app/version.js` and `app/sw.js` together.
- **Docs move with the code:** README.md, SPEC.md, ROADMAP.md and DEPLOY.md are updated in the same PR as the change they describe.
- **PR description:** what changed, why, how it was tested, plus PR comments for anything a reviewer should look at.
- **Merging and deploying need the owner's go-ahead.** Never merge your own PR or run `ship.sh` without being asked.
- **Figures have sources:** handicap and league figures in `app/rating.js` say where they came from, or that they're our own starting point.
- **Privacy:** no public links, analytics or third-party scripts. Never commit `.env` or `data/`. League routes return names, never email addresses.
- **Style:** plain ES modules, no build step, no framework, strict CSP with no inline scripts or `style=""`. Sentence case, no emoji in the UI. User text goes in as text, never as HTML.
- Follow Dosie's patterns (`../dosie`) for sign-in, service worker, `ship.sh` and hosting unless SPEC.md says otherwise.
