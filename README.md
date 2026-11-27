# Svelix
A compiler-first UI library for Svelte, inspired by the Unix philosophy.  Small, composable, native, and minimal by design.

## Development

Use Node.js 24 LTS for development. The checks for this revision were run with Node.js 22.23.4 and npm 10.9.9. This is a development-tool requirement, not a statement about consumers' runtime or browser compatibility. Install the locked dependencies with `npm ci`, then run `npm run check` and `npm run build`. The build writes the distributable package to `dist/`.

After building, run `npm run test:package` to pack the library, install it in a temporary Svelte application, type-check its entry point, and build that application. The test uses npm's local cache for the fixture installation.

Run `npm run test:package:clean` for a clean install and repeat-build comparison of the actual source, followed by a temporary Svelte component to verify generated types and an external application build. It requires npm registry access.

Run `npm run test:theme` to check the theme fixture in headless Chromium. It needs a local Chrome or Chromium binary and does not add a browser package. Set `CHROME_PATH` when the binary is not `google-chrome` on `PATH`. Set `THEME_SCREENSHOT_DIR` to write light and dark PNG captures of the fixture.

The package exposes its shared CSS as `svelix/styles.css`. UI components are under development.

## Theme

Import the shared stylesheet once in the application:

```svelte
<script lang="ts">
  import 'svelix/styles.css';
</script>
```

Light is the default. Set `data-svelix-theme="dark"` on the document root or on an element to select dark tokens for its subtree. Set `data-svelix-theme="light"` to explicitly select light, including inside a dark subtree.

```html
<section data-svelix-theme="dark">
  <!-- Dark-themed components -->
  <section data-svelix-theme="light">
    <!-- Light-themed components -->
  </section>
</section>
```

The stylesheet defines only namespaced CSS custom properties. It does not set the page background, text color, font, reset styles, or browser color scheme. Consumers own application-level styles. Theme selection needs no Svelix JavaScript. System color preferences are not applied automatically; explicit selection always wins.

### Tokens

Public token names use `--svelix-<semantic-role>`, with `-sm` / `-md` suffixes for scale values. Colors are reset by each explicit light/dark scope. Shared dimensions inherit from the document root unless overridden.

| Token suffix (prefix: `--svelix-`) | Purpose |
| --- | --- |
| `background`, `foreground` | Default surface and text |
| `primary`, `primary-foreground` | Primary actions and their text |
| `secondary`, `secondary-foreground` | Secondary actions and their text |
| `muted`, `muted-foreground` | Subdued surfaces and text |
| `border`, `border-width` | Control boundaries and separators |
| `danger` | Invalid/error text and indicators |
| `radius-sm`, `radius-md` | Corner radii |
| `spacing-xs`, `spacing-sm`, `spacing-md` | Padding and gaps |
| `focus-ring`, `focus-ring-width`, `focus-ring-offset` | Visible keyboard focus |

Exact default values are defined in [src/lib/styles.css](src/lib/styles.css). There are no duration or easing tokens. Button, Input, Checkbox, Radio Group, Label, and Separator do not animate, so a motion scale would be a public API with no consumer. The stylesheet also does not set `color-scheme`, `prefers-color-scheme`, or `prefers-reduced-motion`.

Components should consume these semantic tokens rather than duplicate palette values. The v0.1.0 components are implemented by #5, #6, and #7; this stylesheet does not ship those components. Their styles should use the tokens below:

| Component need | Tokens |
| --- | --- |
| Button primary | `primary`, `primary-foreground`, `radius-md`, `spacing-sm`, `spacing-md`, `border-width`, focus tokens |
| Button secondary | `secondary`, `secondary-foreground`, plus the shared radius, spacing, border, and focus tokens |
| Button outline | `background`, `foreground`, `border`, `border-width` |
| Button ghost | `foreground`. A transparent fill is the absence of a color, not another token |
| Button disabled | `muted`, `muted-foreground` |
| Input | `background`, `foreground`, `border`, `border-width`, `radius-sm`, `spacing-xs`, `spacing-sm`, focus tokens |
| Input invalid | `danger` for the border and the invalid text |
| Input disabled or readonly | `muted`, `muted-foreground` |
| Checkbox and radio | `primary` through `accent-color`, `foreground`, `border`, focus tokens |
| Radio group | `border`, `border-width`, `radius-sm`, `spacing-sm`, `foreground` |
| Label | `foreground` |
| Separator | `border`, `border-width`, `spacing-sm` |

Disabled controls use the muted colors rather than an opacity token. Opacity would also fade a focus ring, and the component issues do not ask for a separate disabled opacity. Hover and active colors are not part of those issues, so they are not tokens yet.

Because `color-scheme` is not set, an Input implementation has to paint `background`, `color`, and `border` from tokens itself. Native checkbox and radio marks should use `accent-color: var(--svelix-primary)` instead of relying on the user agent's color scheme.

For example, the following is an illustrative style, not a shipped Svelix component:

```css
button.example {
  background: var(--svelix-primary);
  color: var(--svelix-primary-foreground);
  border-radius: var(--svelix-radius-md);
}
button.example:focus-visible {
  outline: var(--svelix-focus-ring-width) solid var(--svelix-focus-ring);
  outline-offset: var(--svelix-focus-ring-offset);
}
```

Override tokens with ordinary CSS on the theme scope or a descendant. The library uses zero-specificity selectors, so application selectors such as classes take precedence. For equal-specificity rules, load overrides after the library stylesheet. Override paired background/foreground colors together and verify contrast.

```css
.my-theme {
  --svelix-primary: #047857;
  --svelix-primary-foreground: #ffffff;
  --svelix-radius-md: 1rem;
}
```

Apply the class directly to the desired scope; an explicitly themed nested scope resets its own color tokens.

### Reduced motion and visible focus

`prefers-reduced-motion` does not change these tokens, because nothing in the theme stylesheet animates or transitions. Visible focus is an instantaneous outline using the focus-ring tokens on `:focus-visible`. That outline stays in place when reduced motion is requested. A later component that introduces animation must add its own motion behavior and honor `prefers-reduced-motion: reduce` without removing the focus outline.

Keyboard focus is the supported check. Programmatic `element.focus()`, including `focus({ focusVisible: true })`, did not match `:focus-visible` in the headless Chromium runs of `npm run test:theme`, including the reduced-motion run. The fixture therefore records the focus outline only after a Tab key.

### Theme verification

`npm run test:theme` serves the repository and runs [tests/theme.html](tests/theme.html) in headless Chromium. The fixture reports PASS or FAIL for theme inheritance, explicit `data-svelix-theme` selection, ordinary CSS overrides, host-style isolation, semantic token consumption for the six component roles, representative contrast pairs, and keyboard focus styling. It repeats the page under `prefers-color-scheme: dark` and `prefers-reduced-motion: reduce` and checks that those preferences do not switch the theme or remove the focus outline. The controls in the fixture are test-only native elements. This run does not prove full WCAG conformance.

To inspect the same page manually, serve the repository root and open `tests/theme.html`, then press Tab through the primary button, the text field, and the dark-theme primary button until the page says PASS. The automated command is the project check. The package build and consumer checks remain required to verify the exported stylesheet.
