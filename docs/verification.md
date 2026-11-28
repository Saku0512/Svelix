# Development and verification

[Documentation index](README.md) · [Contributing](../CONTRIBUTING.md) · [Compatibility](compatibility.md) · [Release notes](releases/v0.1.0.md)

Use Node.js 24 LTS for repository development. The v0.1.0 release checks use Node.js 24.18.0 and npm 12.0.1.

```sh
npm ci
npm run check
npm run build
npm test
```

The build writes the distributable package to `dist/`. `npm test` runs the theme, component/browser, SSR/hydration, production bundle, and packed consumer checks. Tests that consume `dist/` verify a content-hash stamp against `src/`, `package.json`, `package-lock.json`, `tsconfig.json`, and `dist/`, rebuilding stale output once and reusing it across consecutive scripts.

## Individual checks

- `npm run test:theme`: verifies tokens, theme scopes, host isolation, contrast pairs, reduced motion, and keyboard focus in headless Chromium.
- `npm run test:components`: verifies native behavior, forms, bindings, styling, keyboard interaction, and Accessibility Tree semantics.
- `npm run test:ssr`: verifies deterministic server output, hydration, DOM identity, diagnostics, interactions, and form reset.
- `npm run test:bundle`: verifies production module/CSS elimination for representative imports and reports raw, gzip, and Brotli sizes.
- `npm run test:release`: verifies stable-version ordering, bootstrap placeholder and pending-stage handling, provenance/source identity, npm `latest` downgrade prevention, and safe rerun decisions without publishing.
- `npm run test:package`: packs Svelix, verifies the package contents and metadata, installs it with Svelte 5.59.0, checks public types, and builds a consumer.
- `npm run test:package:clean`: performs a clean locked install, compares repeat-build output hashes, and builds an external consumer. This command requires registry access.

GitHub Actions repeats the locked install, whitespace check, type check, build, full test suite, and clean package verification on pull requests and on `main` / `release_v*` pushes.

Read [CONTRIBUTING.md](../CONTRIBUTING.md) before creating a branch or pull request. Repository artifacts, code comments, commits, and pull-request descriptions are written in English.
