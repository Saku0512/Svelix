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

| Component | Native foundation | Purpose |
| --- | --- | --- |
| `Button` | `<button>` | Native button behavior with four visual variants. |
| `Input` | `<input>` | Native input types with type-appropriate value, checked, file, and group handling. |
| `Checkbox` | `<input type="checkbox">` | Controlled or uncontrolled checked and indeterminate state. |
| `RadioGroup` / `Radio` | `<fieldset>`, `<legend>`, and `<input type="radio">` | Native radio grouping, keyboard behavior, and form participation. |
| `Label` | `<label>` | Explicit or wrapping native control labels. |
| `Separator` | `<hr>` | Semantic or decorative horizontal and vertical separators. |

See the [component API and examples](https://github.com/Saku0512/Svelix/blob/main/docs/components.md) for props, bindings, state ownership, form behavior, and usage.

## Documentation

| Guide | Contents |
| --- | --- |
| [Documentation index](https://github.com/Saku0512/Svelix/blob/main/docs/README.md) | All user and contributor documentation. |
| [Components](https://github.com/Saku0512/Svelix/blob/main/docs/components.md) | Complete API reference and examples for every public component. |
| [Theming](https://github.com/Saku0512/Svelix/blob/main/docs/theming.md) | CSS import, theme scopes, tokens, overrides, focus, and reduced motion. |
| [Accessibility](https://github.com/Saku0512/Svelix/blob/main/docs/accessibility.md) | Automated coverage, consumer responsibilities, and manual checks. |
| [Compatibility](https://github.com/Saku0512/Svelix/blob/main/docs/compatibility.md) | Verified Svelte, toolchain, SSR, browser, TypeScript, and Node.js scope. |
| [Development and verification](https://github.com/Saku0512/Svelix/blob/main/docs/verification.md) | Repository setup and release-check commands. |
| [Contributing](https://github.com/Saku0512/Svelix/blob/main/CONTRIBUTING.md) | Branch, commit, test, and pull-request requirements. |

## Compatibility

Svelix v0.1.0 verifies Svelte 5.59.0 as its minimum peer version, standard Svelte compilation, SSR and hydration, generated TypeScript declarations, and automated Google Chrome behavior on Linux. It does not claim untested browser or assistive-technology coverage. See the [compatibility guide](https://github.com/Saku0512/Svelix/blob/main/docs/compatibility.md) for the exact scope.

## Development

Use Node.js 24 LTS and the committed npm lockfile:

```sh
npm ci
npm run check
npm run build
npm test
```

See [development and verification](https://github.com/Saku0512/Svelix/blob/main/docs/verification.md) for the individual checks and [CONTRIBUTING.md](https://github.com/Saku0512/Svelix/blob/main/CONTRIBUTING.md) before opening a pull request.

## Changelog and releases

- [CHANGELOG.md](CHANGELOG.md) records user-visible changes.
- [v0.1.0 release notes](https://github.com/Saku0512/Svelix/blob/main/docs/releases/v0.1.0.md) contain the release summary, compatibility notes, verification evidence, and publication checklist.

Creating a Git tag or publishing the npm package is a separate maintainer-authorized action. Preparing these documents does not publish or tag a release.

## License

Svelix is available under the [MIT License](LICENSE). Copyright (c) Saku0512.
