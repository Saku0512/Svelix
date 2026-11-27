# Compatibility

[Documentation index](README.md) · [Getting started](../README.md) · [Accessibility](accessibility.md) · [Verification](verification.md)

## Verified scope for v0.1.0

| Area | Verified scope |
| --- | --- |
| Svelte | `5.59.0` minimum in an isolated packed consumer; the locked development version is also checked. |
| Toolchain | Standard Svelte 5 compilation with `@sveltejs/package` and Vite; no SvelteKit or custom preprocessor is required. |
| SSR/hydration | Server rendering plus in-place hydration and post-hydration interaction are tested. |
| Browser automation | Google Chrome 158 on Linux is the release-check environment. Firefox and Safari/WebKit remain manual checks. |
| TypeScript | Generated declarations and accepted/rejected public props are checked from the packed package. |
| Node.js | Node.js 24 LTS is the repository development and release-check environment, not a broad consumer-runtime compatibility claim. |

The components primarily use native HTML, CSS, and form behavior, but v0.1.0 does not claim compatibility with browsers or assistive technologies outside the environments actually tested above.

See [accessibility](accessibility.md) for manual assistive-technology and cross-browser responsibilities and [development and verification](verification.md) for the commands that establish this scope.
