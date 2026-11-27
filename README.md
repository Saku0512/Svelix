# Svelix

A compiler-first UI library for Svelte, inspired by the Unix philosophy. Small, composable, native, and minimal by design.

Svelix v0.1.0 is a conventional Svelte 5 component library that works with the standard Svelte toolchain. It does not require a custom compiler, preprocessor, CSS framework, or runtime dependency.

## Design philosophy

- **Small by default:** ship focused components, scoped CSS, and tree-shakeable entry points.
- **Native first:** preserve semantic HTML, browser form behavior, keyboard interaction, and platform accessibility.
- **Composable:** forward native attributes and events instead of replacing them with large configuration APIs.
- **Explicit:** keep state ownership, theme selection, and validation behavior visible to the consumer.
- **Evidence over claims:** verify package output, SSR/hydration, accessibility semantics, and bundle behavior with reproducible checks.

## Installation

Svelix requires Svelte 5.59.0 or newer within the Svelte 5 release line.

```sh
npm install svelix
```

Import the shared stylesheet once near the root of the application, then import only the components that are needed:

```svelte
<script lang="ts">
  import { Button, Input, Label } from 'svelix';
  import 'svelix/styles.css';

  let email = $state('');
</script>

<form>
  <Label for="email">Email address</Label>
  <Input id="email" name="email" type="email" bind:value={email} required />
  <Button>Subscribe</Button>
</form>
```

Svelix does not add application-level resets, fonts, page colors, validation messages, or form-submission logic. The consuming application remains responsible for those concerns.

## Components

Import the shared stylesheet once in the application, then import components from the package entry point.

### Button

Button renders a native `<button>` and forwards native button attributes and event callbacks. It does not supply a `type`, so the browser default remains `submit` inside a form. Set `type="button"` for non-submit actions. The available variants are `primary` (default), `secondary`, `outline`, and `ghost`.

#### API

| Svelix prop | Type | Default | Behavior |
| --- | --- | --- | --- |
| `variant` | `'primary' \| 'secondary' \| 'outline' \| 'ghost'` | `'primary'` | Selects the component style through `data-svelix-variant`. |

All native `HTMLButtonAttributes` are forwarded, including `type`, `disabled`, `name`, `value`, `form*`, `aria-*`, `data-*`, and event callbacks. Child content is rendered inside the native button.

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

Input renders a native `<input>`, forwards native attributes and event callbacks, and applies the Svelte binding that matches the input type. `type` matching is ASCII case-insensitive.

#### API

| Svelix prop / binding | Type | Default | Behavior |
| --- | --- | --- | --- |
| `type` | Native input type string | `'text'` | Selects the native input type and corresponding binding. |
| `bind:value` | Native input value type | `undefined` | Used by text-like and other value-based inputs. |
| `bind:checked` | `boolean` | `undefined` | Used by ungrouped checkbox and radio inputs. |
| `bind:files` | `FileList \| undefined` | `undefined` | Used by file inputs; browsers do not accept a path string. |
| `bind:group` | `string \| number \| boolean \| Array<string \| number \| boolean> \| null` | omitted | Enables reactive radio or checkbox grouping. |
| `defaultChecked` | `boolean` | inferred from initial state | Sets the mount-time form-reset baseline for checkbox and radio inputs. |

All other native `HTMLInputAttributes` except `children` are forwarded.

| `type` | Binding |
| --- | --- |
| `checkbox` | `bind:checked` by default, or `bind:group` for checkbox groups (array). Optional HTML `value` for form submission. |
| `radio` | native `checked` / `defaultChecked` when `group` is omitted; `bind:group` when grouping reactively (provide a non-`undefined` initial value such as `null` or a selected option) |
| `file` | `bind:files` (`FileList`; leave unset initially; do not assign a path string) |
| other | `bind:value` (supports `defaultValue` form reset) |

`defaultChecked` (and the inferred initial checked/`group` membership used when it is omitted) is snapshotted when the Input instance mounts. Later updates to a reactive `defaultChecked` prop do not change the form-reset baseline. Grouped checkbox reset follows trusted reset-button activation and `HTMLFormElement.reset()`, ignores synthetic `dispatchEvent(new Event('reset'))`, and does not overwrite a newer `group` write that happens immediately after `reset()`.

```svelte
<script lang="ts">
  import { Input } from 'svelix';
  import 'svelix/styles.css';

  let email = $state('');
  let accepted = $state(false);
  let size = $state('m');
  let toppings = $state([]);
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

<label><Input type="checkbox" value="rice" bind:group={toppings} /> Rice</label>
<label><Input type="checkbox" value="beans" bind:group={toppings} /> Beans</label>

<label><Input type="radio" name="size" value="s" bind:group={size} /> S</label>
<label><Input type="radio" name="size" value="m" bind:group={size} /> M</label>

<label>
  <Input type="radio" name="plain" value="a" />
  A
</label>
<label>
  <Input type="radio" name="plain" value="b" checked />
  B
</label>

<label for="upload">Upload</label>
<Input id="upload" type="file" bind:files={uploads} />
```

Use a visible `<label>` associated with `for` and `id`; a placeholder is not a label. Native constraint failures receive invalid styling after user interaction through `:user-invalid`. For custom or server-side validation, set `aria-invalid="true"` and associate visible error text with `aria-describedby`. Svelix does not add validation timing, messages, or submission logic. Checkbox and radio controls use `accent-color` from the shared primary token.

### Checkbox

`Checkbox` renders a native `<input type="checkbox">` and forwards `HTMLInputAttributes` (omitting `type` and `children`). It supports both controlled/bound and uncontrolled state ownership:

#### API

| Svelix prop / binding | Type | Default | Behavior |
| --- | --- | --- | --- |
| `bind:checked` | `boolean` | omitted | Enables controlled/bound ownership; omit it for browser-owned state. |
| `bind:indeterminate` | `boolean` | `false` | Synchronizes the DOM `indeterminate` property. |
| `defaultChecked` | `boolean` | `undefined` | Sets the initial and form-reset checked state. |

Native input attributes and event callbacks are forwarded except `type` and `children`; the rendered input type is always `checkbox`.

- **Controlled / bound**: Pass `bind:checked` (or `checked`). The mount-time `defaultChecked` (or initial `checked`) is snapshotted so native `form.reset()` restores the baseline and syncs the binding.
- **Uncontrolled**: Omit `checked` and optionally pass `defaultChecked`. The browser owns checked state and form reset natively.
- **Indeterminate**: Pass `indeterminate` or `bind:indeterminate` to control the DOM `indeterminate` property (for example, partial "select all" state). User activation clears `indeterminate` natively and updates the binding.

Always associate each `Checkbox` with a visible `<label>` using `for`/`id` or by wrapping the control so the label expands the clickable target area.

```svelte
<script lang="ts">
  import { Checkbox } from 'svelix';
  import 'svelix/styles.css';

  let selectAll = $state(false);
  let partial = $state(true);
</script>

<label for="select-all">Select all items</label>
<Checkbox id="select-all" name="all" bind:checked={selectAll} bind:indeterminate={partial} />

<label>
  <Checkbox name="newsletter" value="yes" defaultChecked />
  Receive release updates
</label>
```

### RadioGroup and Radio

`RadioGroup` renders a native `<fieldset>` with an optional `<legend>` (`legend` prop accepts a string or a Svelte snippet; omit it to place your own `<legend>` as the first child). `Radio` renders a native `<input type="radio">` and forwards `HTMLInputAttributes` (omitting `type` and `children`). No custom ARIA radio widget or focus-management layer is introduced; native arrow-key navigation, `Tab` order, `disabled` skipping, and `FormData` submission are preserved.

#### RadioGroup API

| Svelix prop / binding | Type | Default | Behavior |
| --- | --- | --- | --- |
| `legend` | `string \| Snippet` | `undefined` | Renders the group label in a native `<legend>`. |
| `name` | `string` | generated | Sets the shared radio name; blank or omitted values receive an SSR-safe name. |
| `bind:value` | `string \| null` | omitted | Enables controlled/bound selection; `null` represents no selection. |

Native `HTMLFieldsetAttributes`, including `disabled`, are forwarded. Child content is rendered inside the fieldset.

#### Radio API

| Svelix prop | Type | Default | Behavior |
| --- | --- | --- | --- |
| `value` | Native input value | `'on'` | Supplies the DOM value, `FormData` value, and group model value. |
| `checked` | `boolean` | `undefined` | Controls checked state outside a controlled `RadioGroup`. |
| `defaultChecked` | `boolean` | `undefined` | Sets the initial and form-reset checked state. |
| `name` | `string` | inherited/generated in a group | Used outside `RadioGroup`; the group name wins inside one. |

Native input attributes and event callbacks are forwarded except `type` and `children`; the rendered input type is always `radio`.

- **Shared `name`**: Set `name` on `RadioGroup` so descendant `Radio` controls form one native radio group (when omitted or blank, `RadioGroup` generates an SSR-safe unique name; inside a `RadioGroup`, the group's `name` always wins so native mutual exclusion stays aligned with the group model).
- **Controlled / bound**: Pass `bind:value` on `RadioGroup` with a non-`undefined` initial value (`string` or `null` for no selection; omit `value` for uncontrolled mode). Omitting `value` on a `Radio` uses the native `"on"` default consistently across DOM, `FormData`, and `bind:value`. Native `form.reset()` syncs only owned `Radio` controls belonging to the reset form—restoring the form's checked default or clearing to `null` when no option in that form has a checked default—and preserves newer application writes immediately after `reset()`.
- **Uncontrolled**: Omit `value` on `RadioGroup` and set `defaultChecked` on the default `Radio`. The browser owns selection and form reset natively.
- **Disabled**: Set `disabled` on an individual `Radio` to disable one option, or set `disabled` on `RadioGroup` (`<fieldset disabled>`) to disable the entire group natively.

```svelte
<script lang="ts">
  import { Radio, RadioGroup } from 'svelix';
  import 'svelix/styles.css';

  let plan = $state('pro');
</script>

<RadioGroup legend="Billing plan" name="plan" bind:value={plan}>
  <label><Radio value="basic" /> Basic</label>
  <label><Radio value="legacy" disabled /> Legacy (unavailable)</label>
  <label><Radio value="pro" /> Pro</label>
</RadioGroup>

<RadioGroup name="delivery">
  {#snippet legend()}Delivery method{/snippet}
  <label><Radio value="standard" defaultChecked /> Standard</label>
  <label><Radio value="express" /> Express</label>
</RadioGroup>
```

### Label

`Label` renders a semantic `<label>` and forwards `HTMLLabelAttributes` (`for`, `form`, `id`, `class`, event callbacks, and ARIA/data attributes). It does not generate hidden IDs or implicit context relationships; associate it explicitly via `for` and `id` or implicitly by wrapping a single labelable control.

#### API

`Label` adds no Svelix-specific props. It forwards native `HTMLLabelAttributes` and renders child content inside the native label.

```svelte
<script lang="ts">
  import { Checkbox, Input, Label } from 'svelix';
  import 'svelix/styles.css';

  let accepted = $state(false);
</script>

<Label for="username">Username</Label>
<Input id="username" name="username" autocomplete="username" required />

<Label>
  <Checkbox name="terms" value="yes" bind:checked={accepted} />
  Accept terms of service
</Label>
```

### Separator

`Separator` renders a static native `<hr>` styled with logical borders from `--svelix-border`, `--svelix-border-width`, and `--svelix-spacing-sm` so lines remain visible in forced-colors modes. It forwards standard `<hr>` attributes except `children`, the component-managed ARIA attributes (`role`, `aria-orientation`, `aria-hidden`—owned exclusively by `orientation` and `decorative`), and focusability attributes (`tabindex`, `autofocus`, `contenteditable`—reserved in TypeScript and stripped at runtime because `Separator` is a non-interactive structural divider rather than a focusable splitter widget).

| Prop | Values | Default | Behavior |
| --- | --- | --- | --- |
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` | Horizontal spans full inline size (`100%`) with block spacing; vertical stretches along the cross axis (`min-block-size: 1em`) with inline spacing. |
| `decorative` | `boolean` | `false` | `false` exposes the native `<hr>` separator semantics (adding `aria-orientation="vertical"` only when vertical, with no redundant `role="separator"`). `true` sets `aria-hidden="true"`, omits `aria-orientation`, and keeps the element non-focusable so assistive technologies always ignore purely visual dividers. |

```svelte
<script lang="ts">
  import { Button, Separator } from 'svelix';
  import 'svelix/styles.css';
</script>

<section>
  <h2>Profile</h2>
  <p>Public account details.</p>
  <Separator />
  <h2>Security</h2>
  <p>Authentication and active sessions.</p>
</section>

<div style="display: flex; align-items: center;">
  <Button type="button" variant="ghost">Cut</Button>
  <Separator orientation="vertical" decorative />
  <Button type="button" variant="ghost">Copy</Button>
</div>
```

### Component styling

Component styles are scoped and consume the shared tokens documented below. Override a token on a component class to customize one instance, or set ordinary CSS properties on that class. Component rules use zero-specificity `:where(...)` selectors so a consumer class can override defaults without `!important`.

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

The v0.1.0 components consume these semantic tokens rather than duplicating palette values:

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

Because `color-scheme` is not set, Svelix Input paints `background`, `color`, and `border` from the shared tokens. Checkbox and radio marks use `accent-color: var(--svelix-primary)` instead of relying on the user agent's color scheme.

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

## Accessibility

Automated browser and Accessibility Tree checks (`npm run test:components`, `npm run test:theme`, and `npm run test:ssr`) verify native HTML tags, ARIA attributes, computed accessible names and descriptions, exposed states (`checked`, `mixed`, `disabled`, `required`, `readonly`, `invalid`, `orientation`, and `ignored` for decorative separators), sequential keyboard focus, `:focus-visible` outlines, and `forced-colors` border retention in headless Chromium.

Automated checks cannot prove full WCAG conformance. The following checks require manual or cross-environment verification when qualifying a release or target application:

- Assistive-technology smoke testing with real screen readers (such as NVDA, JAWS, VoiceOver, and TalkBack) to confirm announcement phrasing and reading order in context.
- Cross-browser rendering and interaction checks in Firefox and Safari/WebKit (including Safari `accent-color` indicator contrast in light and dark themes).
- Operating-system High Contrast / Contrast Themes testing beyond Chromium media-feature emulation.
- Page-level zoom (up to 200%–400%), text-spacing overrides, touch-target spacing in dense consumer layouts, and cognitive/copy clarity of application labels and error messages.

## Compatibility

| Area | Verified scope for v0.1.0 |
| --- | --- |
| Svelte | `5.59.0` minimum in an isolated packed consumer; the locked development version is also checked. |
| Toolchain | Standard Svelte 5 compilation with `@sveltejs/package` and Vite; no SvelteKit or custom preprocessor is required. |
| SSR/hydration | Server rendering plus in-place hydration and post-hydration interaction are tested. |
| Browser automation | Google Chrome 158 on Linux is the release-check environment. Firefox and Safari/WebKit remain manual checks. |
| TypeScript | Generated declarations and accepted/rejected public props are checked from the packed package. |
| Node.js | Node.js 24 LTS is the repository development and release-check environment, not a broad consumer-runtime compatibility claim. |

The components primarily use native HTML, CSS, and form behavior, but v0.1.0 does not claim compatibility with browsers or assistive technologies outside the environments actually tested above.

## Development and verification

Use Node.js 24 LTS for repository development. The v0.1.0 release checks use Node.js 24.18.0 and npm 12.0.1.

```sh
npm ci
npm run check
npm run build
npm test
```

The build writes the distributable package to `dist/`. `npm test` runs the theme, component/browser, SSR/hydration, production bundle, and packed consumer checks. Tests that consume `dist/` verify a content-hash stamp against `src/`, `package.json`, `package-lock.json`, `tsconfig.json`, and `dist/`, rebuilding stale output once and reusing it across consecutive scripts.

Additional commands:

- `npm run test:theme`: verifies tokens, theme scopes, host isolation, contrast pairs, reduced motion, and keyboard focus in headless Chromium.
- `npm run test:components`: verifies native behavior, forms, bindings, styling, keyboard interaction, and Accessibility Tree semantics.
- `npm run test:ssr`: verifies deterministic server output, hydration, DOM identity, diagnostics, interactions, and form reset.
- `npm run test:bundle`: verifies production module/CSS elimination for representative imports and reports raw, gzip, and Brotli sizes.
- `npm run test:package`: packs Svelix, verifies the package contents and metadata, installs it with Svelte 5.59.0, checks public types, and builds a consumer.
- `npm run test:package:clean`: performs a clean locked install, compares repeat-build output hashes, and builds an external consumer. This command requires registry access.

GitHub Actions repeats the locked install, whitespace check, type check, build, full test suite, and clean package verification on pull requests and on `main` / `release_v*` pushes.

## Contributing

See [CONTRIBUTING.md](https://github.com/Saku0512/Svelix/blob/main/CONTRIBUTING.md) for setup, branch, commit, test, and pull-request requirements. Repository artifacts, code comments, commits, and pull-request descriptions are written in English.

## Changelog and releases

- [CHANGELOG.md](CHANGELOG.md) records user-visible changes.
- [v0.1.0 release notes](https://github.com/Saku0512/Svelix/blob/main/docs/releases/v0.1.0.md) contain the release summary, compatibility notes, verification evidence, and publication checklist.

Creating a Git tag or publishing the npm package is a separate maintainer-authorized action. Preparing these documents does not publish or tag a release.

## License

Svelix is available under the [MIT License](LICENSE). Copyright (c) Saku0512.
