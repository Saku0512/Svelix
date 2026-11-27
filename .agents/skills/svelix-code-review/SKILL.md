---
name: svelix-code-review
description: Review Svelix changes for architecture, API simplicity, Svelte compatibility, correctness, accessibility, performance, tests, and adherence to the Unix-inspired product philosophy. Use for code reviews, pre-merge reviews, and audits of proposed implementations.
---

# Svelix Code Review

## Purpose

Review changes as a maintainer of Svelix, not as a generic style checker.

The central question is:

> Is this the smallest clear implementation that solves the problem while preserving native web behavior and Svelte compatibility?

Use this skill for pull requests, staged diffs, implementation plans, and targeted audits. Follow repository AGENTS.md and existing conventions.

## Review priorities

Report findings in this order:

1. **Correctness and regressions** — broken behavior, runtime errors, data loss, SSR/hydration defects.
2. **Security and unsafe behavior** — injection, unsafe DOM use, leaks, unsafe parsing, dependency risks.
3. **Accessibility** — semantic errors, keyboard failures, focus defects, inaccessible state.
4. **Public API design** — unnecessary complexity, breaking changes, inconsistent naming, weak types.
5. **Svelte compatibility** — unsupported APIs, incorrect runes, legacy patterns, compiler assumptions.
6. **Performance** — unnecessary runtime code, CSS, dependencies, repeated work, bundle regressions.
7. **Maintainability** — unclear abstractions, duplicated logic, inadequate tests or docs.

Do not report stylistic preferences as defects.

## Review workflow

1. Read AGENTS.md and relevant project documentation.
2. Inspect the full diff and surrounding code.
3. Identify affected public APIs, package entrypoints, and supported environments.
4. Trace behavior through the relevant component, compiler, and build paths.
5. Check tests and determine whether they actually cover the changed behavior.
6. Evaluate accessibility and native platform behavior.
7. Evaluate runtime, generated output, and dependency impact when relevant.
8. Verify claims by running available checks or inspecting authoritative documentation.
9. Report only actionable findings supported by evidence.
10. Summarize residual risks and checks not performed.

## Svelix philosophy checks

### Small
- Does the change add runtime code, CSS, dependencies, or configuration?
- Is each addition necessary for the use case?
- Can unused functionality be tree-shaken?

### Simple
- Is the API understandable without reading implementation details?
- Are there unnecessary flags, wrappers, aliases, or configuration layers?
- Is the implementation more complex than the problem requires?

### Composable
- Can the feature be used independently?
- Does it force consumers into a specific component hierarchy?
- Does it introduce hidden coupling or global state?

### Native
- Could HTML, CSS, or a browser API solve this more directly?
- Does the implementation preserve native semantics and behavior?
- Does it recreate a browser feature unnecessarily?

### Compile first
- Is work being done at runtime that can safely be done at build time?
- If a compiler transform is introduced, is it deterministic and semantics-preserving?
- Are generated output and performance claims tested?

### Explicit
- Are side effects, ownership, state transitions, and defaults clear?
- Does behavior depend on hidden environment or import order?

## Technical review checks

- Svelte APIs match the version actually supported by the repository.
- Runes are used correctly; effects are not used for simple derived state.
- Props are treated as reactive inputs.
- Event listeners, observers, and subscriptions are cleaned up.
- SSR does not access browser-only globals during module initialization or server rendering.
- Hydration output is deterministic where required.
- TypeScript public types are precise.
- Errors are actionable and not silently swallowed.
- CSS is scoped and does not leak into consumers.
- Package exports and side-effect metadata are correct.
- Tests include relevant edge cases and regression scenarios.
- Documentation reflects actual behavior.

## Performance review checks

Do not infer performance from code aesthetics. For relevant changes, request or inspect:

- Production bundle output.
- Per-entrypoint and per-component JS/CSS size.
- Tree-shaking results.
- Compressed sizes where meaningful.
- Runtime or build benchmarks.
- Dependency and transitive dependency changes.

A smaller source diff or fewer lines does not prove better performance.

## Finding format

For each finding, include:

- **Severity:** Critical / High / Medium / Low.
- **Location:** Exact file and line(s), when available.
- **Problem:** What is wrong and under what condition.
- **Impact:** User-visible, compatibility, accessibility, security, or maintenance consequence.
- **Recommendation:** Smallest practical correction.

Do not invent line numbers. If no actionable defects are found, state that clearly and list meaningful test or verification gaps.

## Review discipline

- Be adversarial about correctness, not dismissive about design choices.
- Separate confirmed defects from questions and suggestions.
- Avoid duplicate findings.
- Do not demand speculative abstractions or optimizations.
- Do not approve based only on passing tests if the design violates project principles.
- Do not claim tests passed unless they were executed.
- Do not modify code during a review unless explicitly asked to implement fixes.

## Final review checklist

- [ ] No correctness or regression issue found.
- [ ] No security issue found or unresolved risk identified.
- [ ] Accessibility behavior reviewed.
- [ ] Public API remains small and consistent.
- [ ] Svelte compatibility verified.
- [ ] Performance impact considered with evidence where relevant.
- [ ] Tests and documentation are adequate.
- [ ] Findings are actionable and evidence-based.
