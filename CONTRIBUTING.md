# Contributing to 快传 (file-transfer-access)

Thank you for your interest in contributing! This project welcomes bug reports, feature suggestions, documentation improvements, and pull requests.

## How to contribute

### Report a bug or request a feature

1. Search [existing issues](https://github.com/HGDliwannian/file-transfer-access/issues) to avoid duplicates.
2. Open a new issue with:
   - Clear title and description
   - Steps to reproduce (for bugs)
   - Expected vs actual behavior
   - OS version, Node.js version, and app version
   - Screenshots or logs if helpful

### Submit a pull request

1. Fork the repository and create a branch from `main`.
2. Install dependencies: `npm install`
3. Make your changes with clear, focused commits.
4. Test locally:
   - `npm start` for development
   - `npm run build:mac:app` on macOS (or `npm run build:win` on Windows) for packaging smoke test
5. Open a PR against `main` and describe what changed and why.

## Development setup

```bash
git clone https://github.com/HGDliwannian/file-transfer-access.git
cd file-transfer-access
npm install
npm start
```

On macOS, after code changes you can run:

```bash
npm run enable   # stop → build .app → launch
```

See [README.md](README.md) and [AGENTS.md](AGENTS.md) for more workflow details.

## Code style

- Match the existing style in each file (plain JS, minimal dependencies).
- Keep changes scoped; avoid unrelated refactors in the same PR.
- Prefer user-facing copy in Simplified Chinese for UI strings.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
