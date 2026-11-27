---
name: svelix-performance
description: Measure, benchmark, optimize, or review Svelix runtime cost, generated JavaScript, CSS, package size, tree-shaking, initialization, and build performance. Use whenever a change makes or claims a performance improvement.
---

# Svelix Performance Engineering

## Purpose

Performance is a product property, not a marketing adjective. Svelix aims to keep runtime code and generated output small, but correctness, accessibility, maintainability, and predictable behavior take priority over unmeasured micro-optimizations.

## Measurement principles

- Measure before optimizing.
- Compare equivalent implementations under the same conditions.
- Record toolchain versions and exact commands.
- Separate source size, package size, emitted JS/CSS, compressed transfer size, build time, and runtime cost.
- Include dependencies pulled into the bundle.
- Use repeatable fixtures and retain benchmark methodology.
- Do not publish a performance claim based on a single anecdotal run.
- Do not claim "zero JavaScript" unless the emitted production output proves it for the stated scenario.

## What to measure

### Bundle and package
- Installed package size and dependency footprint.
- ESM entrypoint size.
- Emitted JavaScript per component.
- Emitted CSS per component.
- Minified size.
- gzip and Brotli sizes.
- Shared code and duplicated code across imports.
- Tree-shaking behavior for unused components.

### Runtime
- Initialization and mount cost.
- DOM node count where relevant.
- Event listener count where relevant.
- Memory allocation and retained references for long-lived components.
- Update cost for stateful components.
- Layout, style recalculation, and paint implications for visual primitives.

### Build
- Cold and warm build time.
- Incremental rebuild time.
- Compiler transform overhead.
- Memory use for unusually expensive tooling.

## Benchmark workflow

1. Identify the suspected cost and user-visible impact.
2. Create a minimal, reproducible fixture.
3. Record a baseline with the current implementation.
4. Change one meaningful variable at a time.
5. Run the same commands and environment against the candidate.
6. Compare correctness and output before comparing speed.
7. Repeat noisy measurements and report the range or median.
8. Keep benchmark scripts and fixtures in the repository when they are useful for regression detection.
9. Summarize trade-offs and limitations.

## Bundle-size rules

- Test production builds, not development output.
- Test direct component imports and package-level imports.
- Verify unused exports are removed by the consumer bundler.
- Check whether CSS is duplicated or unexpectedly global.
- Include transitive dependencies in reports.
- Avoid barrel exports that accidentally prevent tree-shaking.
- Do not introduce a runtime helper solely to save a few bytes without measuring the trade-off.
- Treat side-effect annotations and package export maps carefully; incorrect metadata can break consumers.

## Runtime rules

- Prefer native HTML and CSS for behavior the platform already provides.
- Avoid unnecessary effects, subscriptions, observers, and event listeners.
- Ensure listeners and observers are cleaned up.
- Avoid repeated DOM reads/writes that cause layout thrashing.
- Avoid caching that creates stale state or memory leaks.
- Do not replace clear code with obscure micro-optimizations without a demonstrated benefit.
- Consider SSR and hydration costs separately from browser runtime costs.

## Compiler optimization claims

When evaluating compile-time optimization:

- Compare output from the same Svelte version and build settings.
- Inspect generated JavaScript and CSS.
- Verify that the optimization preserves semantics.
- Measure compile-time overhead as well as output reduction.
- Test both optimized and non-optimized paths.
- Clearly state which syntax or component usage the result applies to.

## Reporting format

For a performance change, report:

- Scenario and fixture.
- Baseline and candidate versions.
- Environment and toolchain.
- Measurement commands.
- JS/CSS and compressed sizes where applicable.
- Runtime/build measurements where applicable.
- Correctness checks.
- Trade-offs and limitations.

## Review checklist

- [ ] Baseline exists.
- [ ] Production output is measured.
- [ ] JS, CSS, dependencies, and runtime costs are distinguished.
- [ ] Tree-shaking is tested.
- [ ] Measurements are reproducible.
- [ ] Correctness and accessibility are unchanged.
- [ ] No optimization claim exceeds the evidence.
