# Contributing to Quizzora

Thank you for helping improve Australian curriculum ed-tech for secondary schools and families. Quizzora welcomes contributions via [GitHub issues and pull requests](https://github.com/VineelD/quizzora).

**Canonical repository:** [https://github.com/VineelD/quizzora](https://github.com/VineelD/quizzora)

This guide is practical orientation only — **not legal advice**. For licensing and hosted vs self-host questions, see [docs/OPEN-SOURCE.md](docs/OPEN-SOURCE.md) and [LICENSE](LICENSE).

## Maintainer

**Quizzora** is maintained by **Mr Vineel Davuluri** (voluntary hobby project).  
Support: [support@quizzora.org](mailto:support@quizzora.org)

## License for contributions

Quizzora is licensed under the [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE). By submitting a pull request, patch, or other contribution, you agree that your work is licensed under the same terms as the project. Do not submit material you cannot license this way.

## Ways to contribute

- **Bug reports** — open an issue with steps to reproduce, expected vs actual behaviour, and environment (browser, Node version, self-host vs quizzora.org if relevant).
- **Feature ideas** — issues are welcome; curriculum and pedagogy feedback (ACARA / VCAA alignment) is especially valuable — see [docs/CURRICULUM-SOURCE.md](docs/CURRICULUM-SOURCE.md).
- **Code** — fork, branch, make a focused change, run tests, and open a pull request.
- **Documentation** — fixes and clarifications for teachers, families, and self-hosters are appreciated.

For private coordination (e.g. school IT), email [support@quizzora.org](mailto:support@quizzora.org).

## Local setup

From the repository root:

```bash
npm install
```

Copy environment variables from the example file (never commit real secrets):

```bash
cp .env.example .env.local   # Linux / macOS
# Windows: copy .env.example .env.local
```

Edit `.env.local` with your values. At minimum for local development you will need `AUTH_SECRET` and, for AI quiz generation, `OPENAI_API_KEY`. See [README.md](README.md) for full configuration notes.

Run the test suite:

```bash
npm test
```

Start the development server:

```bash
npm run dev
```

Open `http://127.0.0.1:3000`. Demo credentials are listed in the README.

## Pull request guidelines

1. **Keep changes focused** — one logical fix or feature per PR when possible.
2. **Run tests** — `npm test` should pass before you open or update a PR.
3. **No secrets** — do not commit `.env`, `.env.local`, API keys, passwords, or production data. Use `.env.example` for documented placeholders only.
4. **Match the codebase** — follow existing style, naming, and patterns in the files you touch.
5. **Describe your change** — explain what problem you solve and how to verify it. Link related issues when applicable.

Maintainers may request edits or close PRs that are out of scope, duplicate existing work, or cannot be merged for licensing or security reasons.

## Code of conduct

Be respectful and constructive. Quizzora serves schools, families, and educators; collaborate in good faith, assume positive intent, and keep discussion professional. Harassment, discrimination, and personal attacks are not tolerated.

## Questions

- **Open source & AGPL:** [docs/OPEN-SOURCE.md](docs/OPEN-SOURCE.md)
- **Hosted service:** [quizzora.org](https://quizzora.org)
- **General help:** [support@quizzora.org](mailto:support@quizzora.org)
