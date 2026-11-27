---
name: svelix-compiler
description: Design, implement, test, or review Svelix compiler integrations, Svelte preprocessors, AST transforms, compile-time optimizations, and generated output. Use whenever work touches compiler behavior or build-time transformation.
---

# Svelix Compiler Engineering

## Purpose

Keep compiler-related features optional, deterministic, narrow, and compatible with the supported Svelte toolchain. The compiler must serve Svelix's simple authoring model; it must not become complexity for its own sake.

Use the Svelte-specific skills for Svelte syntax and official compiler documentation. This skill defines Svelix's engineering constraints.

## Core rules

1. Prefer the public Svelte compiler and preprocessing APIs.
2. Do not fork Svelte or patch its internals as a default strategy.
3. Do not rely on undocumented AST node shapes or internal compiler modules without explicit maintainer approval.
4. A compiler feature must have a concrete use case that cannot be solved more simply with standard Svelte.
5. Compiler integration must be optional unless the repository explicitly establishes otherwise.
6. Preserve ordinary Svelte authoring and the standard compilation path.
7. Keep transforms deterministic, local, and idempotent where possible.
8. Never transform code in ways that change observable semantics without explicit documentation.
9. Every transform requires positive and negative tests.
10. Measure whether an optimization improves emitted output; do not infer it from source appearance.

## Required workflow

1. Inspect the installed Svelte version and its public compiler API documentation.
2. Inspect the repository's current build configuration and compiler integration points.
3. State the transformation's input, output, invariants, and expected benefit.
4. Confirm that the transformation cannot be achieved more safely with a component, CSS, or ordinary build configuration.
5. Choose the narrowest supported hook (for example, a documented preprocess or Vite integration point).
6. Implement a pure transform where possible.
7. Preserve source locations and useful diagnostics when the API supports it.
8. Add fixtures for valid input, invalid input, edge cases, and unchanged input.
9. Test interaction with Svelte compilation, SSR, and hydration where relevant.
10. Inspect emitted JavaScript/CSS and benchmark the claimed benefit.
11. Document supported Svelte versions, limitations, and opt-out behavior.

## Transform design

- Prefer explicit opt-in markers or narrowly defined syntax over guessing developer intent.
- Do not parse Svelte source with regular expressions when a parser or official preprocessing API is appropriate.
- Avoid broad text replacement.
- Do not reorder user code unless semantic equivalence is demonstrated.
- Preserve comments, formatting, and source maps when feasible.
- Ensure running a transform twice does not corrupt output.
- Fail with actionable diagnostics rather than silently producing partially transformed code.
- Do not silently skip unsupported syntax if doing so could create incorrect output.
- Avoid introducing generated runtime helpers for transformations that are intended to eliminate runtime work.
- Keep generated identifiers collision-safe and deterministic.

## Compatibility and safety

- Pin assumptions to the actual supported Svelte version range.
- Treat compiler ASTs as version-sensitive.
- Add compatibility tests before widening supported version ranges.
- Do not inspect or mutate private Svelte runtime state.
- Do not use `eval`, `new Function`, or runtime code generation as a shortcut.
- Avoid filesystem or environment side effects during compilation unless explicitly required and documented.
- Keep Vite-specific behavior in the Vite adapter package, not in the compiler-agnostic core.

## Testing strategy

Include, as applicable:

- Unit tests for transform functions.
- Golden/fixture tests for generated source.
- Compilation tests using the supported Svelte compiler.
- Negative tests for unsupported syntax and invalid options.
- Idempotency tests.
- Source-map and diagnostic tests.
- SSR and hydration tests.
- Integration tests through the actual supported Vite plugin pipeline.
- Regression tests for every discovered semantic bug.

A test that only asserts transformed source text is insufficient when runtime behavior may change.

## Performance evidence

For any optimization, record:

- Baseline and optimized source fixture.
- Svelte and toolchain versions.
- Build command and environment.
- Emitted JavaScript and CSS byte counts.
- Minified and compressed sizes when relevant.
- Runtime behavior and correctness checks.

Distinguish generated output size from package install size and build-time cost. A smaller source file is not evidence of a smaller bundle.

## Review checklist

- [ ] Uses supported public APIs or documents an approved exception.
- [ ] Compiler integration is optional where possible.
- [ ] Transformation is deterministic and narrowly scoped.
- [ ] No regex-based parsing of complex Svelte syntax.
- [ ] Semantics are preserved.
- [ ] Diagnostics are actionable.
- [ ] Positive, negative, and regression tests exist.
- [ ] SSR/hydration implications are tested.
- [ ] Output improvement is measured.
- [ ] Compatibility limits are documented.
