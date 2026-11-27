# Svelix
A compiler-first UI library for Svelte, inspired by the Unix philosophy.  Small, composable, native, and minimal by design.

## Development

Install dependencies with `npm install`, then run `npm run check` and `npm run build`. The build writes the distributable package to `dist/`.

After building, run `npm run test:package` to pack the library, install it in a temporary Svelte application, and build that application. The test uses npm's local cache for the fixture installation.

The package exposes its shared CSS as `svelix/styles.css`. Components and theme tokens are under development.
