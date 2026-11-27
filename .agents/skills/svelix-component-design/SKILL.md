---
name: svelix-component-design
description: Design and implement Svelix UI components and public component APIs. Use when proposing, creating, changing, or reviewing reusable components, primitives, props, events, snippets, styling APIs, or composition patterns in this repository.
---

# Svelix Component Design

## Purpose

Design components that embody the Svelix product philosophy:

> Small, composable, native, and minimal by design.
>
> Do less. Compose more.

This skill governs Svelix-specific design decisions. Use the installed Svelte skills for Svelte syntax, runes, and framework-specific implementation details. Do not duplicate their documentation.

## Non-negotiable principles

1. **Native first** — Prefer semantic HTML, browser behavior, and platform APIs.
2. **Small API surface** — Expose only options that solve demonstrated use cases.
3. **Composition over configuration** — Prefer small components and composition over large prop objects or mode flags.
4. **No abstraction without leverage** — A wrapper must provide a concrete benefit such as consistent behavior, accessibility, styling, or type safety.
5. **No framework tax** — Do not require Tailwind, a CSS framework, a design system, or an application framework.
6. **Explicit data flow** — Prefer callback props and clear ownership. Use two-way binding only when it is a natural part of the component contract.
7. **Independent primitives** — Components should not depend on unrelated Svelix components.
8. **Accessible defaults** — Semantic behavior, keyboard support, focus behavior, and accessible naming are part of the API design.
9. **Svelte-native authoring** — Prefer ordinary Svelte components and supported Svelte APIs over custom syntax.
10. **Evidence before optimization claims** — Do not claim zero runtime cost or superior performance without inspecting compiled output and measuring it.

## Required design workflow

When designing or changing a component:

1. **Identify the user problem.** Describe the concrete interaction or presentation need. Do not start by inventing a component name.
2. **Check the platform.** Determine whether a native HTML element or browser API already solves the problem.
3. **Check existing Svelte capabilities.** Prefer built-in props, snippets, events, bindings, and CSS features where appropriate.
4. **Search the existing Svelix API.** Reuse established conventions; do not create competing abstractions.
5. **Define the smallest contract.** Specify required props, optional props, events/callbacks, snippets, defaults, and ownership.
6. **Consider accessibility and states.** Include disabled, invalid, loading, expanded, selected, and focus states only where relevant.
7. **Implement the simplest viable component.**
8. **Test behavior and API.** Cover keyboard, pointer, state transitions, SSR where relevant, and type inference.
9. **Review the public surface.** Remove redundant props, aliases, hidden behavior, and unnecessary dependencies.
10. **Document usage and limitations.**

## API design rules

- Use descriptive, consistent prop names.
- Prefer native attribute names when forwarding native element attributes.
- Preserve native element behavior and attributes unless there is a documented reason not to.
- Use discriminated unions for genuinely mutually exclusive modes; avoid boolean-prop combinations that create invalid states.
- Avoid generic `as` or polymorphic-element APIs unless there is a strong, tested need and the accessibility/type trade-offs are understood.
- Avoid boolean props that merely rename a native HTML attribute.
- Avoid redundant `size`, `variant`, or `type` options without a defined design-system need.
- Do not invent a global configuration provider for values that can be passed locally.
- Do not make internal state externally mutable unless controlled usage is a real requirement.
- Document whether a component is controlled, uncontrolled, or supports both.
- Do not silently change behavior based on environment, import order, or global state.

## Composition rules

- Prefer children/snippets for caller-owned content.
- Keep layout primitives independent from visual components.
- Do not force consumers to use Svelix layout primitives.
- Avoid deeply nested component hierarchies when native markup is clearer.
- Ensure components remain useful individually.
- Keep optional features optional; importing a basic component must not pull in unrelated features.

## Styling rules

- Use scoped CSS by default.
- Use CSS custom properties for intentional customization points.
- Do not require utility CSS classes or a global reset.
- Avoid leaking selectors into consumer applications.
- Avoid hard-coded assumptions about the host application's font, color scheme, or spacing scale.
- Respect `prefers-reduced-motion`.
- Provide visible focus indicators.
- Keep visual styling separate from behavior where practical.

## Accessibility requirements

For interactive components, explicitly evaluate:

- Correct native element and semantics.
- Accessible name and description.
- Keyboard interaction and expected key behavior.
- Focus entry, movement, restoration, and visibility.
- Disabled and unavailable states.
- State exposure to assistive technology.
- Reduced-motion behavior.
- High contrast and zoom/responsive behavior where relevant.

Prefer native HTML controls. Add ARIA only when native semantics are insufficient. Never add ARIA attributes as decoration.

## Anti-patterns

Reject or justify carefully:

- Wrapping every HTML element in a Svelix component.
- Creating a component solely to shorten markup.
- Large components with many unrelated modes.
- Global mutable state or singleton component state.
- Runtime DOM querying when bindings or component references are sufficient.
- Effects used to derive state that belongs in a derived value.
- Custom event systems duplicating native events.
- Dependencies for trivial utilities.
- Global CSS and implicit resets.
- APIs that expose implementation details rather than user intent.

## Validation checklist

Before considering a component complete:

- [ ] The problem cannot be solved more simply with native HTML/CSS.
- [ ] The API is small and documented.
- [ ] Composition is possible without mandatory Svelix wrappers.
- [ ] Native attributes and expected browser behavior are preserved.
- [ ] Keyboard and assistive-technology behavior are considered.
- [ ] CSS does not leak into the host application.
- [ ] TypeScript types are precise.
- [ ] Relevant tests cover behavior and edge cases.
- [ ] SSR/hydration behavior is safe where applicable.
- [ ] Bundle impact and dependencies have been considered.
- [ ] Examples show realistic usage.

If a proposed component does not pass this checklist, simplify it or explain why the exception is justified.
