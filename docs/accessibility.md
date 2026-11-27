# Accessibility

[Documentation index](README.md) · [Components](components.md) · [Theming](theming.md) · [Compatibility](compatibility.md)

Svelix components use native buttons, inputs, labels, fieldsets, legends, and separators. Consumers remain responsible for meaningful labels, application-level validation messages, content order, and accessible composition.

## Automated coverage

Automated browser and Accessibility Tree checks (`npm run test:components`, `npm run test:theme`, and `npm run test:ssr`) verify native HTML tags, ARIA attributes, computed accessible names and descriptions, exposed states (`checked`, `mixed`, `disabled`, `required`, `readonly`, `invalid`, `orientation`, and `ignored` for decorative separators), sequential keyboard focus, `:focus-visible` outlines, and `forced-colors` border retention in headless Chromium.

## Manual and cross-environment checks

Automated checks cannot prove full WCAG conformance. The following checks require manual or cross-environment verification when qualifying a release or target application:

- Assistive-technology smoke testing with real screen readers (such as NVDA, JAWS, VoiceOver, and TalkBack) to confirm announcement phrasing and reading order in context.
- Cross-browser rendering and interaction checks in Firefox and Safari/WebKit (including Safari `accent-color` indicator contrast in light and dark themes).
- Operating-system High Contrast / Contrast Themes testing beyond Chromium media-feature emulation.
- Page-level zoom (up to 200%–400%), text-spacing overrides, touch-target spacing in dense consumer layouts, and cognitive/copy clarity of application labels and error messages.

See the [component guide](components.md) for component-specific naming and keyboard requirements and the [compatibility guide](compatibility.md) for the exact verified environment.
