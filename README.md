# Svelix
A compiler-first UI library for Svelte, inspired by the Unix philosophy.  Small, composable, native, and minimal by design.

## Development

Use Node.js 24 LTS for development. The checks for this revision were run with Node.js 22.23.4 and npm 10.9.9. This is a development-tool requirement, not a statement about consumers' runtime or browser compatibility. Install the locked dependencies with `npm ci`, then run `npm run check` and `npm run build`. The build writes the distributable package to `dist/`.

After building, run `npm run test:package` to pack the library, install it in a temporary Svelte application, type-check its entry point, and build that application. The test uses npm's local cache for the fixture installation.

Run `npm run test:package:clean` for a clean install and repeat-build comparison of the actual source, followed by a temporary Svelte component to verify generated types and an external application build. It requires npm registry access.

Run `npm run test:theme` to check the theme fixture in headless Chromium. It needs a local Chrome or Chromium binary and does not add a browser package. Set `CHROME_PATH` when the binary is not `google-chrome` on `PATH`. Set `THEME_SCREENSHOT_DIR` to write light and dark PNG captures of the fixture.

Run `npm run test:components` to build the Button and Input browser fixture and verify native form, keyboard, disabled, validation, binding, styling, and scoped-style behavior in headless Chromium. It uses the same `CHROME_PATH` override and adds no browser dependency.

The package exposes Button and Input from `svelix`, and its shared CSS from `svelix/styles.css`.

## Components

Import the shared stylesheet once in the application, then import components from the package entry point.

### Button

Button renders a native `<button>` and forwards native button attributes and event callbacks. It does not supply a `type`, so the browser default remains `submit` inside a form. Set `type="button"` for non-submit actions. The available variants are `primary` (default), `secondary`, `outline`, and `ghost`.

```svelte
<script lang="ts">
  import { Button } from 'svelix';
  import 'svelix/styles.css';
</script>

<form action="/profile" method="post">
  <Button name="intent" value="save">Save profile</Button>
  <Button type="button" variant="ghost" onclick={() => history.back()}>Cancel</Button>
</form>
```

Button content normally provides its accessible name. Icon-only buttons must receive a native naming attribute such as `aria-label`. Disabled buttons use the native `disabled` attribute; no loading behavior is simulated.

### Input

Input renders a native `<input>`, forwards native attributes and event callbacks, and applies the Svelte binding that matches the input type:

| `type` | Binding |
| --- | --- |
| `checkbox` | `bind:checked` (optional HTML `value` for form submission) |
| `radio` | `bind:group` shared across the radio set |
| `file` | `bind:files` (`FileList`; leave unset initially; do not assign a path string) |
| other | `bind:value` (supports `defaultValue` form reset on Svelte 5.6+) |

```svelte
<script lang="ts">
  import { Input } from 'svelix';
  import 'svelix/styles.css';

  let email = $state('');
  let accepted = $state(false);
  let size = $state('m');
  let uploads = $state();
</script>

<label for="email">Email address</label>
<Input
  id="email"
  name="email"
  type="email"
  autocomplete="email"
  bind:value={email}
  required
/>

<label>
  <Input type="checkbox" bind:checked={accepted} value="yes" />
  Accept terms
</label>

<label><Input type="radio" name="size" value="s" bind:group={size} /> S</label>
<label><Input type="radio" name="size" value="m" bind:group={size} /> M</label>

<label for="upload">Upload</label>
<Input id="upload" type="file" bind:files={uploads} />
```

Use a visible `<label>` associated with `for` and `id`; a placeholder is not a label. Native constraint failures receive invalid styling after user interaction through `:user-invalid`. For custom or server-side validation, set `aria-invalid="true"` and associate visible error text with `aria-describedby`. Svelix does not add validation timing, messages, or submission logic. Checkbox and radio controls use `accent-color` from the shared primary token.

### Component styling

Button and Input styles are scoped and consume the shared tokens documented below. Override a token on a component class to customize one instance, or set ordinary CSS properties on that class. Component rules use zero-specificity `:where(...)` selectors so a consumer class can override defaults without `!important`.

```svelte
<Button class="confirm">Confirm</Button>
<Input class="account-field" aria-label="Account code" />

<style>
  :global(.confirm) {
    --svelix-primary: #047857;
    --svelix-primary-foreground: #ffffff;
  }

  :global(.account-field) {
    border-radius: 0;
  }
</style>
```

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
