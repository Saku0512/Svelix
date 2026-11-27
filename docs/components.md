# Component API and examples

[Documentation index](README.md) · [Getting started](../README.md) · [Theming](theming.md) · [Accessibility](accessibility.md)

Import the shared stylesheet once in the application, then import components from the package entry point.

## Button

Button renders a native `<button>` and forwards native button attributes and event callbacks. It does not supply a `type`, so the browser default remains `submit` inside a form. Set `type="button"` for non-submit actions. The available variants are `primary` (default), `secondary`, `outline`, and `ghost`.

### API

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

## Input

Input renders a native `<input>`, forwards native attributes and event callbacks, and applies the Svelte binding or native checked-state behavior that matches the input type. `type` matching is ASCII case-insensitive.

### API

| Svelix prop / binding | Type | Default | Behavior |
| --- | --- | --- | --- |
| `type` | Native input type string | `'text'` | Selects the native input type and corresponding state handling. |
| `bind:value` | Native input value type | `undefined` | Used by text-like and other value-based inputs. |
| `bind:checked` | `boolean` | `undefined` | Provides two-way checked-state binding for ungrouped checkbox inputs. |
| `checked` | `boolean` | `undefined` | Sets an ungrouped radio's native checked state. User selection is not written back through `bind:checked`; use `bind:group` for reactive radio selection. |
| `bind:files` | `FileList \| undefined` | `undefined` | Used by file inputs; browsers do not accept a path string. |
| `bind:group` | `string \| number \| boolean \| Array<string \| number \| boolean> \| null` | omitted | Enables reactive radio or checkbox grouping. |
| `defaultChecked` | `boolean` | inferred from initial state | Sets the mount-time form-reset baseline for ungrouped checkboxes/radios and grouped checkboxes. It is not forwarded for grouped radios. |

All other native `HTMLInputAttributes` except `children` are forwarded.

| `type` | Binding |
| --- | --- |
| `checkbox` | `bind:checked` by default, or `bind:group` for checkbox groups (array). Optional HTML `value` for form submission. |
| `radio` | native `checked` / `defaultChecked` when `group` is omitted; `bind:group` when grouping reactively (provide a non-`undefined` initial value such as `null` or a selected option) |
| `file` | `bind:files` (`FileList`; leave unset initially; do not assign a path string) |
| other | `bind:value` (supports `defaultValue` form reset) |

For ungrouped checkboxes/radios and grouped checkboxes, `defaultChecked` (and the inferred initial checked/`group` membership used when it is omitted) is snapshotted when the Input instance mounts. Later updates to a reactive `defaultChecked` prop do not change the form-reset baseline. A grouped radio does not forward `defaultChecked`; initialize its bound `group` to the desired option or `null`. Grouped checkbox reset follows trusted reset-button activation and `HTMLFormElement.reset()`, ignores synthetic `dispatchEvent(new Event('reset'))`, and does not overwrite a newer `group` write that happens immediately after `reset()`.

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

## Checkbox

`Checkbox` renders a native `<input type="checkbox">` and forwards `HTMLInputAttributes` (omitting `type` and `children`). It supports both controlled/bound and uncontrolled state ownership:

### API

| Svelix prop / binding | Type | Default | Behavior |
| --- | --- | --- | --- |
| `bind:checked` | `boolean` | omitted | Enables controlled/bound ownership; omit it for browser-owned state. |
| `bind:indeterminate` | `boolean` | `false` | Synchronizes the DOM `indeterminate` property. |
| `defaultChecked` | `boolean` | `undefined` | Sets the initial and form-reset checked state. |

Native input attributes and event callbacks are forwarded except `type` and `children`; the rendered input type is always `checkbox`.

When binding `checked` or `indeterminate`, initialize the parent state to a defined boolean (`true` or `false`). Svelte rejects an initially `undefined` binding because these bindable props provide fallback values.

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

## RadioGroup and Radio

`RadioGroup` renders a native `<fieldset>` with an optional `<legend>` (`legend` prop accepts a string or a Svelte snippet; omit it to place your own `<legend>` as the first child). `Radio` renders a native `<input type="radio">` and forwards `HTMLInputAttributes` (omitting `type` and `children`). No custom ARIA radio widget or focus-management layer is introduced; native arrow-key navigation, `Tab` order, `disabled` skipping, and `FormData` submission are preserved.

### RadioGroup API

| Svelix prop / binding | Type | Default | Behavior |
| --- | --- | --- | --- |
| `legend` | `string \| Snippet` | `undefined` | Renders the group label in a native `<legend>`. |
| `name` | `string` | generated | Sets the shared radio name; blank or omitted values receive an SSR-safe name. |
| `bind:value` | `string \| null` | omitted | Enables controlled/bound selection; `null` represents no selection. |

Native `HTMLFieldsetAttributes`, including `disabled`, are forwarded. Child content is rendered inside the fieldset.

### Radio API

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

## Label

`Label` renders a semantic `<label>` and forwards `HTMLLabelAttributes` (`for`, `form`, `id`, `class`, event callbacks, and ARIA/data attributes). It does not generate hidden IDs or implicit context relationships; associate it explicitly via `for` and `id` or implicitly by wrapping a single labelable control.

### API

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

## Separator

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
