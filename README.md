# Svelix
A compiler-first UI library for Svelte, inspired by the Unix philosophy.  Small, composable, native, and minimal by design.

## Development

Use Node.js 24 LTS for development; the current checks have been run with Node.js 26.13.1 and npm 11.20.0. This is a development-tool requirement, not a statement about consumers' runtime or browser compatibility. Install the locked dependencies with `npm ci`, then run `npm run check` and `npm run build`. The build writes the distributable package to `dist/`.

After building, run `npm run test:package` to pack the library, install it in a temporary Svelte application, type-check its entry point, and build that application. The test uses npm's local cache for the fixture installation.

Run `npm run test:package:clean` for a clean install and repeat-build comparison of the actual source, followed by a temporary Svelte component to verify generated types and an external application build. It requires npm registry access.

The package exposes its shared CSS as `svelix/styles.css`. Components and theme tokens are under development.
