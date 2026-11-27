# Svelix — AI Agent Guidelines

## Project identity

Svelix is a compiler-first UI library for Svelte, inspired by the Unix philosophy.

**Product statement:** Small, composable, native, and minimal by design.

Svelix aims to extend the Svelte development experience without replacing Svelte or undermining the qualities that make it effective.

### Core principles

1. **Small by default** — Keep generated output, runtime code, package size, and conceptual overhead small.
2. **Simple** — Prefer clear, familiar Svelte, HTML, CSS, and TypeScript over novel syntax or unnecessary abstractions.
3. **Composable** — Build focused primitives that work independently and combine predictably.
4. **Native first** — Prefer platform capabilities and semantic HTML over custom JavaScript implementations.
5. **Compile first** — Move work to build time when it is correct, measurable, and simpler than a runtime solution.
6. **Explicit behavior** — Avoid hidden side effects, surprising defaults, and implicit global state.
7. **Minimal dependencies** — Do not add a dependency when the platform, Svelte, or a small local implementation is sufficient.
8. **Accessible by design** — Accessibility, keyboard interaction, and semantic markup are requirements, not optional enhancements.
9. **Svelte compatibility** — Follow supported Svelte conventions and APIs. Do not fork or patch Svelte internals unless explicitly approved.
10. **Evidence over claims** — Support performance and bundle-size claims with reproducible benchmarks.

The Unix-inspired approach means focused tools and components that do one job well and compose cleanly. It does not mean minimizing line count at the expense of clarity, correctness, accessibility, or maintainability.

## Current project stage

The repository is at an early stage. Do not assume an implementation, package manager, build system, Svelte major version, public API, or release policy exists unless it is present in the repository.

Before making changes:
- Inspect the current repository structure, package manifests, README, tests, and existing conventions.
- Treat existing code and configuration as authoritative.
- Avoid introducing speculative architecture or dependencies.
- If a decision would establish a long-term public API or compatibility commitment, explain the trade-off and seek maintainer direction rather than silently deciding.

## Implementation guidelines

### Svelte and components
- Use the Svelte version and syntax already selected by the project; do not mix major-version APIs.
- Prefer ordinary Svelte components and standard HTML elements.
- Keep component APIs small, typed, consistent, and easy to discover.
- Prefer composition and slots/snippets supported by the project's Svelte version over large configuration objects.
- Do not wrap native elements without a concrete benefit.
- Do not create a component for a one-off use case unless it establishes a reusable primitive.
- Keep state local by default. Avoid global stores or context unless the use case requires shared state.
- Do not introduce custom template syntax unless a clear limitation cannot be solved through standard Svelte APIs.

### Compiler and build tooling
- Treat compiler extensions as an optional layer, not a requirement for using the core library.
- Preserve compatibility with the standard Svelte compilation pipeline wherever possible.
- Keep compiler transforms deterministic, narrowly scoped, and covered by input/output tests.
- Never rely on undocumented Svelte compiler internals without documenting the compatibility risk.
- Do not claim that a component produces zero JavaScript unless verified from compiled output.
- Prefer optimizations that reduce actual shipped output without making the authoring model harder to understand.

### HTML, CSS, and accessibility
- Use semantic HTML elements and native browser behavior first.
- Use CSS variables for theming and design tokens where appropriate.
- Avoid requiring Tailwind CSS or another CSS framework.
- Avoid global CSS leakage. Scope styles and document intentional global styles.
- Support keyboard operation, visible focus, appropriate accessible names, and reduced-motion preferences.
- Do not use ARIA where native HTML semantics already provide the required behavior.
- Test interactive components with keyboard and assistive-technology-relevant semantics.

### TypeScript and quality
- Preserve strict typing; avoid `any` unless there is a documented and unavoidable reason.
- Validate public inputs at appropriate boundaries.
- Handle errors explicitly; do not silently swallow failures.
- Keep modules focused and avoid premature generalization.
- Add or update tests for behavior changes and regression fixes.
- Run relevant formatting, lint, type-check, test, and build commands that are available in the repository.
- Report commands that could not be run and why. Never claim checks passed unless they were actually run.

### Performance and dependencies
- Consider runtime JavaScript, CSS size, package install size, and build time separately.
- Ensure package entry points support tree-shaking where applicable.
- Avoid importing an entire package when a focused import is available.
- Measure before and after meaningful performance changes using reproducible conditions.
- Document any unavoidable runtime cost introduced by a feature.
- Review dependency maintenance, license, transitive dependencies, and browser support before adding a dependency.

## API and compatibility discipline

- Treat exported symbols, component props, events, CSS variables, and package entry points as public API once released.
- Prefer additive, backwards-compatible changes.
- Document breaking changes and migration paths.
- Do not change public names or behavior incidentally during refactoring.
- Keep core functionality usable without opting into optional compiler or tooling packages.

## Repository workflow

### Before editing
1. Read relevant source files and tests.
2. Identify the smallest coherent change.
3. Check for existing utilities or patterns before adding new ones.
4. State assumptions when requirements are ambiguous.

### While editing
- Keep changes scoped to the task.
- Do not reformat unrelated files.
- Do not add generated artifacts, secrets, local environment files, or build output unless explicitly required.
- Update documentation and examples when public behavior changes.

### Before finishing
- Review the complete diff for unrelated changes, regressions, and accidental API changes.
- Run the checks relevant to the change.
- Summarize what changed, what was tested, and any remaining limitations.

## Commit messages

All commit messages MUST follow **Conventional Commits 1.0.0**.

Format:

```text
<type>[optional scope][!]: <description>

[optional body]

[optional footer(s)]
```

Rules:
- Use a valid type such as `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, or `revert`.
- Use a scope when it adds useful context, for example `feat(button): add disabled state`.
- Separate type/scope from description with exactly `: `.
- Write the description in the imperative mood, concise, and without a trailing period.
- Use the body to explain motivation and relevant implementation details, not repeat the diff.
- Use footers for issue references and metadata.
- Mark breaking changes with `!` before the colon and/or a `BREAKING CHANGE: ` footer.
- Reference issues using a footer such as `Closes #123` when the commit actually closes that issue.
- Do not invent new commit types or add non-standard prefixes.

Examples:

```text
feat(button): add loading state
fix(dialog): restore focus after close
docs: document accessibility requirements
refactor(compiler): isolate static layout transform
perf(core): reduce component entrypoint size
test(input): cover invalid value handling
chore: update development dependencies
feat!: replace legacy theme API

BREAKING CHANGE: remove the deprecated theme configuration
```

Conventional Commits specification: https://www.conventionalcommits.org/en/v1.0.0/

## Communication

- Be precise and concise.
- Distinguish verified facts from assumptions.
- Explain meaningful design trade-offs, especially when adding runtime complexity or dependencies.
- Do not overstate performance, compatibility, or accessibility guarantees.
