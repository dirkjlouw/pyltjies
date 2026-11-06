# Contributing to Pyltjies

Pyltjies is a free community project made for fun. Contributions are very welcome, and so are forks.

## Ways to help

- **Report a bug or a rules mistake** by opening an issue.
- **Share your house rules.** Darts rules differ from pub to pub, so tell us how your board works.
- **Suggest or build a feature.** [ROADMAP.md](ROADMAP.md) lists what's planned. For anything big, open an issue first so nobody wastes an evening.
- **Write better banter.** Keep it cheeky and about the darts, never about who someone is.

## Making a change

1. Fork the repo and create a branch: `feat/`, `fix/`, `docs/` or `chore/`.
2. Make the change, and add tests. Rules go in `app/games.js`, with tests in `tests/`. New screens get a flow in `e2e/`.
3. Run the tests. See [README.md](README.md).
4. Update the docs in the same pull request.
5. Open a pull request saying what changed, why, and how you tested it.

The style rules are in [CLAUDE.md](CLAUDE.md): plain ES modules, no build step, no framework, no third-party scripts.

## Who decides

The maintainer, [dirkjlouw](https://github.com/dirkjlouw), reviews every pull request and approves what goes into `main`. Nothing merges without that approval. If your idea doesn't fit, you're free to run it in your own fork.

By contributing, you agree that your work is released under the [MIT License](LICENSE).

## Be decent

Rude about darts is the whole point. Rude about people isn't. Be kind in issues and reviews.

## Security

Please don't post security problems in a public issue. Use GitHub's private vulnerability reporting on this repo's Security tab if it's available, or contact the maintainer through GitHub.
