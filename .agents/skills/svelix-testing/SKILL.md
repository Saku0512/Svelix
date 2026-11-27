---
name: svelix-testing
description: Design, write, improve, and validate Svelix tests. Use when implementing or fixing components, writing regression tests, browser fixtures, type tests, package consumer tests, SSR/hydration checks, tree-shaking checks, or CI verification, and when evaluating whether issue acceptance criteria are covered.
---

# Svelix Testing

## Purpose

Test the public contract of Svelix, not the implementation that happens to exist today. A passing suite is necessary but does not prove that a feature is correct or complete.

Follow AGENTS.md and the issue's approved scope. Use svelix-component-design for API decisions, svelix-accessibility for accessibility requirements, svelix-performance for measurement, and svelix-code-review for adversarial review. Use the installed Svelte skills for Svelte-specific analysis.

Write test names, assertions, comments, documentation, and commit messages in English.

## Non-negotiable rules

- Derive expected behavior from the approved requirements, documented public API, native HTML/CSS semantics, and supported Svelte version before reading implementation details.
- Prefer observable behavior: rendered DOM, user interaction, parent state, events, form payloads, accessible semantics, computed styles, and actual generated artifacts.
- Never weaken assertions, change expected values to match a defect, skip failing cases, mock away the behavior under test, or alter production behavior solely to satisfy a test.
- Preserve native platform behavior. Do not introduce browser prototype patches, hidden global state, or a custom state machine merely to make tests pass.
- Cover meaningful failure modes, not arbitrary permutations or coverage percentages. Do not expand the public API or issue scope just to create tests.
- Keep fixtures minimal, deterministic, independent, and representative of real consumers. Reuse existing infrastructure; justify any new dependency.
- Distinguish verified results, static analysis, inferred behavior, and unverified claims.

## Required workflow

1. Read AGENTS.md, the latest issue and acceptance criteria, relevant comments, public documentation, implementation, package manifest, lockfile, and current tests on the actual target branch.
2. Identify the contract and its invariants. List expected behavior, supported input types and states, ownership, transitions, native defaults, and environmental assumptions.
3. Build an acceptance matrix: each criterion -> observable assertion -> test file/command. Mark unverified criteria explicitly. Include negative cases that would disprove the implementation.
4. Select the smallest test layer that can actually observe the behavior. A type check cannot prove browser behavior; a DOM mock cannot prove native form or keyboard behavior; a successful build cannot prove hydration or tree-shaking.
5. Write focused cases with arrange, act, and assert phases. For a bug fix, reproduce the original defect against the unfixed code when practical; the regression must fail for the expected reason, then pass with the fix. Report when a baseline run is unavailable.
6. Challenge the test suite independently: inspect every public branch, state transition, timing boundary, composition boundary, and unsupported input. Compare wrappers with an equivalent native control where their contract promises native behavior.
7. Run relevant existing checks on the final proposed revision. Inspect the entire diff and check that no unrelated behavior or coverage was lost.
8. Record criterion-by-criterion evidence, exact revision, environment, commands, results, and limitations. Follow the mandatory PR readiness gate in AGENTS.md.

## Test layers

| Layer | Use for |
| --- | --- |
| Unit | Pure functions, deterministic transforms, and isolated logic |
| Component/browser | Native semantics, interaction, binding, focus, events, state, forms, and computed styles |
| Type | Public props, event types, binding types, supported and rejected inputs, generated declarations |
| Package consumer | Install the actual packed distribution in an independent fixture; resolve exports, types, CSS, and compile/build using the public entry point |
| SSR/hydration | Server output, stable IDs, initial state, browser hydration, warnings/errors, and interaction after hydration |
| Production output | Representative imports, retained/removed modules, JS/CSS side effects, and tree-shaking |
| Accessibility | Roles, accessible names, keyboard, focus, state exposure, and relevant manual checks |
| CI | Repeat the applicable documented checks on the proposed revision in a clean environment |

Use real browsers for browser-owned behavior. A small native HTML/JavaScript reproduction is useful for diagnosing the platform, but it does not replace running the Svelte component that uses that behavior.

## Component behavior matrix

Select the rows applicable to the approved API. For each omitted relevant category, record the reason rather than claiming comprehensive coverage.

| Concern | Representative cases |
| --- | --- |
| Native semantics | Element type, forwarded attributes and events, default behavior, labels, focus, validation, and form participation |
| Public inputs | Omitted, explicit, empty, false, zero, null, undefined, valid/invalid variants, native input types, and dynamic prop changes where supported |
| State ownership | Uncontrolled defaults, one-way props, two-way bindings, parent updates, initial no-selection state, and repeated interaction |
| State transitions | Initial -> changed -> cleared/reset -> changed again; programmatic updates before and after user interaction |
| Events | Correct event type and currentTarget, callbacks not overwritten, called exactly as specified, cancellation and event ordering |
| Forms | Submitter, FormData, repeated names via getAll, default vs live value/checked, reset, required/invalid, readonly, disabled fieldset, external form association |
| Composition | Multiple instances, independent groups, shared state where supported, nested components, unrelated native controls, and reassigned form owners |
| Lifecycle | Mount, unmount, remount, cleanup, pending async work, dynamic branch changes, and no mutation of unrelated host state |
| Accessibility | Accessible names, keyboard-only use, disabled skipping, visible focus, native semantics and appropriate state exposure |
| Styling | Light/dark, token and class overrides, relevant state styles, reduced motion, no leakage into adjacent native elements |

Test combinations where behavior crosses boundaries. Testing each feature individually does not establish that the combination is correct. A documented limitation or unsupported combination must be explicit and must not silently weaken an issue criterion.

## Native forms and asynchronous regressions

Form controls are especially sensitive to browser algorithms and Svelte binding semantics. Apply these checks when relevant:

- Compare a wrapper and equivalent native element under the same inputs and operations.
- Exercise real keyboard and pointer activation through the browser automation API, as well as programmatic methods such as `form.reset()` and `element.click()`. A synthetic event or script-driven click is not a substitute for trusted user interaction.
- Distinguish native default actions, synthetic event dispatch, canceled events, synchronous writes, microtasks, and later tasks. Verify actual ordering; do not assume that one deferred callback always runs after a native default action.
- Assert both DOM state and the consumer's bound state, plus FormData or validity where applicable. Use the correct observable type; an empty rendered string cannot distinguish null, undefined, and an empty string.
- Check initial empty state, user selection, reset to empty, selection again, and application-driven clear/reselect. Verify that ownership mode and binding still work after clearing.
- Separate live checked/value state from reset defaults. Test explicit defaults, omitted defaults, and reactive default updates when supported.
- Cover reset cancellation, repeated resets, newer application writes, concurrent independent controls/forms, and shared-group resets if the API supports them.
- Verify actual native form ownership rather than assuming DOM ancestry. Check that unrelated controls and forms remain unchanged.
- Confirm listeners and scheduled work are cleaned up and browser-standard methods retain their identity. Do not solve timing issues by monkey-patching native APIs.
- When a sequence exposes a contract conflict, simplify the design or obtain explicit maintainer approval for a scope/API change instead of accumulating workaround logic.

## Public types, packaging, and compatibility

- Exercise accepted and rejected prop combinations through the public package API. Use `@ts-expect-error` only for an intentionally invalid case that would fail if the expected type error disappeared.
- Test actual consumer bindings and callbacks in Svelte source, not just standalone TypeScript object assignments.
- Test the advertised minimum peer version using a compatible toolchain and the current locked development version where relevant. Distinguish type/build verification from browser runtime compatibility.
- Install a tarball produced from the actual build in an isolated consumer, not a source alias that bypasses package exports.
- Verify generated declarations, public exports, CSS imports, and absence of unintended files or dependencies.
- For reproducibility, build the actual source using locked dependencies and compare recursive relative output paths and content hashes. State whether the result covers only one environment.
- For SSR and hydration, assert server-rendered output and meaningful post-hydration interaction; capture hydration warnings and runtime errors.
- For tree-shaking, inspect production output for representative imports and required CSS side effects. Do not infer tree-shaking or zero JavaScript from source code or a passing build.

## Browser harness quality

- Use the repository's existing browser harness and fixture layout unless a justified change is required. Inspect current scripts rather than assuming a particular runner is installed.
- Use assertions that fail with useful expected/actual values and a meaningful scenario name.
- Prefer waiting for explicit observable conditions over arbitrary sleeps. Bound browser startup, network requests, connection setup, individual commands, and polling.
- Capture page errors, unhandled rejections, unexpected console errors, and failed resource loads where relevant. Do not silently ignore a test-harness failure.
- Isolate temporary directories, ports, browser profiles, fixtures, and state. Close sockets and servers, terminate browser processes portably, and remove temporary artifacts in finally/teardown.
- Do not let test order conceal missing initialization or reset behavior. Use independent setup and ensure tests can fail without hanging.
- Use a locally available browser or the configured CI browser. Report exact browser/version and unavailable targets; do not claim cross-browser coverage from Chromium alone.
- Use screenshots only as supplemental evidence unless the test explicitly validates visual output with a reliable comparison.

## Existing Svelix checks

Discover the scripts on the branch first. The initial v0.1.0 development line uses:

- `npm ci` — locked dependency installation.
- `npm run check` — Svelte/TypeScript checks.
- `npm run build` — production library packaging.
- `npm run test:components` — real-browser component fixture.
- `npm run test:theme` — theme and CSS behavior.
- `npm run test:package` — packed external consumer.
- `npm run test:package:clean` — clean install and repeatable package build.
- `git diff --check` against the intended base.
- Svelte autofixer according to the installed svelte-code-writer skill, when Svelte files are involved.

Run additional configured lint, formatting, SSR/hydration, accessibility, CI, or bundle checks when relevant. Do not report a command that does not exist as passing. Do not silently skip an existing relevant check because it is slower than others.

## Evidence and readiness gate

Use an explicit verification record:

| Acceptance criterion | Scenario or test | Command / evidence | Result |
| --- | --- | --- | --- |
| Native form reset | Reset to default; verify binding, DOM, and FormData | Component browser test | PASS / FAIL / BLOCKED / NOT RUN |

Include the final commit SHA or exact proposed working-tree revision, Node/npm/Svelte/browser versions as relevant, exit status and important warnings, and any manual checks or remaining limitations. Distinguish your own execution from an author's report or CI result. A static review, minimal reproduction, type check, or screenshot is not a substitute for another required test layer.

Do not reuse success from an earlier revision when changed code invalidates the evidence. Never claim full WCAG conformance from automated checks alone. Do not claim unsupported browser or Svelte-version compatibility.

**Do not open a PR, including a draft, if any applicable issue acceptance criterion remains incomplete, failed, blocked, or unverified.** Follow AGENTS.md; report the remaining evidence or obtain explicit maintainer approval for any change in scope.

## Final checklist

- [ ] Every applicable acceptance criterion has a meaningful observable test or other appropriate verification.
- [ ] Regression cases can detect the defect rather than simply exercise the code.
- [ ] Public API, state ownership, native behavior, interactions, and relevant boundary combinations are covered.
- [ ] Tests verify the real component/package, not just a mock or equivalent reproduction.
- [ ] No unrelated host state, native prototype, or independent component is modified.
- [ ] Harness failures are bounded and resources are cleaned up.
- [ ] Relevant checks were run on the final revision; unavailable checks and limitations are documented.
- [ ] Tests, documentation, and code agree, and the mandatory PR readiness gate is satisfied before opening a PR.
