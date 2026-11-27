# Changelog

All notable changes to Svelix are documented in this file. This project follows [Semantic Versioning 2.0.0](https://semver.org/).

## [0.1.0] - Unreleased

### Added

- `Button`, `Input`, `Checkbox`, `RadioGroup`, `Radio`, `Label`, and `Separator` Svelte 5 components with typed native-attribute forwarding.
- Shared light and dark theme tokens through `svelix/styles.css`, with scoped component styles and consumer overrides.
- Native form participation, controlled and uncontrolled state modes, form-reset synchronization, SSR-safe radio names, and SSR/hydration support.
- Browser behavior, accessibility-tree, theme, SSR/hydration, production tree-shaking, package-consumer, and reproducible-build checks.
- Repository documentation for installation, component APIs, theming, accessibility scope, compatibility, contribution, and release preparation.

### Fixed

- Preserve Input placeholder styling through Svelte scoped-CSS compilation.
- Reject stale distribution artifacts when source, package metadata, the dependency lockfile, TypeScript configuration, or built output changes.

### Compatibility

- Svelte 5.59.0 is the verified minimum peer version.
- Node.js 24 LTS is the development and release-check environment.
- Automated browser verification covers Google Chrome on Linux; Firefox, Safari/WebKit, and real assistive technologies remain manual release checks.

See the [v0.1.0 draft release notes](https://github.com/Saku0512/Svelix/blob/main/docs/releases/v0.1.0.md) for details and the pre-publication checklist.
