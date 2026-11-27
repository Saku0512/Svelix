---
name: svelix-accessibility
description: Design, implement, test, or review accessibility in Svelix components and examples. Use for semantic HTML, ARIA, keyboard interaction, focus management, forms, dialogs, menus, motion, and accessibility regressions.
---

# Svelix Accessibility Engineering

## Purpose

Accessibility is a baseline requirement for Svelix components. Prefer native semantic HTML and browser interaction over recreating interaction patterns with custom JavaScript.

Use this skill when building or reviewing interactive components, not only when a task explicitly says "accessibility".

## Standards and references

- Target WCAG 2.2 Level AA as the project goal.
- Use WAI-ARIA Authoring Practices Guide (APG) for complex widget interaction patterns.
- Prefer HTML Living Standard semantics and native controls.
- Verify requirements against current authoritative documentation; do not rely on memory for nuanced ARIA patterns.

References:
- WCAG 2.2: https://www.w3.org/TR/WCAG22/
- WAI-ARIA: https://www.w3.org/TR/wai-aria/
- ARIA Authoring Practices Guide: https://www.w3.org/WAI/ARIA/apg/
- MDN Accessibility: https://developer.mozilla.org/en-US/docs/Web/Accessibility

## Core rules

1. Use the correct native element first.
2. Prefer a native `button`, `input`, `select`, `dialog`, or link over a clickable `div`.
3. Every control must have an accessible name.
4. Do not add ARIA roles or states that conflict with native semantics.
5. All functionality must be operable by keyboard.
6. Focus must be visible and must not be lost unexpectedly.
7. Manage focus deliberately for dialogs and other modal interactions.
8. Expose dynamic state and validation feedback to assistive technology.
9. Respect reduced-motion preferences.
10. Do not use color as the only way to communicate information.
11. Test zoom, reflow, contrast, and touch target implications.
12. Accessibility must not depend on consumer-provided CSS or JavaScript.

## Interaction design

Before implementing an interactive pattern:

1. Determine whether a native HTML element already provides the behavior.
2. Identify the expected keyboard interaction from HTML semantics or the relevant APG pattern.
3. Define focus behavior for opening, closing, selection, and dismissal.
4. Define accessible name, description, role, and state.
5. Define behavior when content changes or the component becomes disabled.
6. Test keyboard-only operation and relevant screen-reader semantics.

Do not invent keyboard shortcuts or ARIA patterns. For menus, tabs, comboboxes, listboxes, tree views, and dialogs, follow the relevant APG pattern if a custom widget is genuinely necessary.

## Focus management

- Preserve normal browser tab order whenever possible.
- Do not use positive `tabindex`.
- Use `tabindex="0"` only when a non-native element genuinely needs to enter sequential focus order.
- Use `tabindex="-1"` for programmatic focus targets where appropriate.
- Never remove focus outlines without an equally visible replacement.
- When opening a modal dialog, move focus into it according to the pattern.
- When closing a dialog, restore focus to the invoking element when it still exists and is appropriate.
- Avoid focus traps in non-modal UI.
- Ensure hidden or inactive content is not accidentally focusable.

## Forms

- Associate labels with controls.
- Use native input types and constraints when appropriate.
- Identify errors in text, associate them with the relevant field, and expose invalid state.
- Do not rely on placeholder text as the only label.
- Preserve browser autofill and password-manager behavior.
- Ensure required fields and instructions are programmatically determinable.

## ARIA discipline

- No ARIA is better than incorrect ARIA.
- Prefer native semantics over redundant roles.
- Keep `aria-expanded`, `aria-selected`, `aria-checked`, and related state synchronized with actual behavior.
- Use `aria-live` only when an update needs announcement and no better semantic mechanism exists.
- Do not use `aria-hidden="true"` on focusable elements or ancestors of focusable elements.
- Do not use ARIA to make a non-functional control appear functional.
- Use unique, stable IDs for ID references.

## Motion and visual presentation

- Honor `prefers-reduced-motion: reduce`.
- Avoid flashing content.
- Provide non-color indicators for status and selection.
- Maintain visible focus in all themes.
- Avoid clipping focus indicators with overflow rules.
- Ensure content remains usable at increased text size and browser zoom.

## Testing

Use automated tools as aids, not proof of conformance. Include:

- Semantic DOM assertions.
- Accessible-name and role checks.
- Keyboard interaction tests.
- Focus placement and restoration tests.
- Disabled, invalid, expanded, selected, and loading state tests where relevant.
- Reduced-motion checks for animated components.
- Manual keyboard review for complex widgets.
- Screen-reader smoke testing for high-impact interactive components.

Automated axe-style checks cannot prove full WCAG conformance. Report what was tested and what remains unverified.

## Review checklist

- [ ] Native semantic element used where possible.
- [ ] Accessible name and description are available.
- [ ] Keyboard operation matches expected interaction pattern.
- [ ] Focus is visible and managed correctly.
- [ ] ARIA is valid, minimal, and synchronized.
- [ ] Dynamic feedback is exposed appropriately.
- [ ] Reduced motion is respected.
- [ ] Color is not the only communication channel.
- [ ] Tests cover semantics, keyboard, and focus.
- [ ] Remaining manual checks are documented.
