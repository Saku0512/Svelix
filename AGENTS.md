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

The repository is at an early stage. The v0.0 development target is a conventional Svelte UI component library. Do not make a custom compiler, AST transform, or Svelte syntax extension a requirement for v0.0. Keep the implementation compatible with the standard Svelte toolchain. Compiler-related work may be explored separately, but it must not delay or complicate the initial UI library.

Do not assume an implementation, package manager, build system, Svelte major version, public API, or release policy exists unless it is present in the repository.

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

## Branch strategy

Svelix uses release-oriented development. Apart from the default branch, there are two branch categories: release branches and release-work branches.

### Branch naming

| Category | Format | Example |
| --- | --- | --- |
| Default | `main` | `main` |
| Release | `release_v<version>` | `release_v0.1.0` |
| Release work | `v<version>/<type>_<description>` | `v0.1.0/feature_button` |

- Use the full target SemVer version (including MAJOR, MINOR, and PATCH).
- Use lowercase ASCII for work types and descriptions. Use hyphens between words in the description.
- Supported work types: `feature`, `fix`, `security`, `refactor`, `perf`, `docs`, `test`, `build`, `ci`, and `chore`.
- Prefer a single focused issue or task per work branch. The description should identify its purpose.
- Branch types are naming conventions, not commit types. For example, a `feature_` work branch normally uses `feat:` commits according to Conventional Commits 1.0.0.

Examples:

```text
release_v0.1.0
v0.1.0/build_package-foundation
v0.1.0/feature_css-tokens
v0.1.0/feature_button-and-input
v0.1.0/test_ssr-and-hydration
v0.1.0/docs_release-notes
release_v0.1.1
v0.1.1/security_dependency-update
```

### Development workflow

1. Create the release branch from the current `main` for the intended release version.
2. Create each release-work branch from its corresponding release branch, using the latest integrated changes.
3. Commit focused changes using Conventional Commits 1.0.0.
4. Open a pull request from the work branch into the corresponding release branch. Reference the issue and include validation results.
5. Merge the work PR only after relevant review and checks. Delete completed work branches after merging when appropriate.
6. Once the release scope and acceptance criteria are satisfied, open a release PR from the release branch into `main`.
7. After the release PR is approved and merged, create the matching release tag on the intended commit in `main`, subject to the release authorization rules below.

### Safety and maintenance

- Do not develop release features directly on `main` or merge a release-work branch directly into `main`.
- Do not merge work into a release branch with a different target version.
- Do not bypass review or failing checks to meet a release deadline.
- Keep release branches scoped to their intended version; defer unrelated work to a later release.
- For a patch release, create a new release branch for the patch version and apply the same workflow. If maintaining an older release line is necessary, use the appropriate released tag as the base only with maintainer approval and agree on the integration and tagging strategy before proceeding.
- Do not force-push shared branches, rewrite published history, delete active release branches, or merge or tag a release without maintainer authorization.
- Repository administration and initial policy changes may be made directly on `main` when explicitly authorized by the maintainer.

## Release tags and versioning

Svelix uses **Semantic Versioning 2.0.0 (SemVer)** for release tags and published package versions. Git tags and npm package versions MUST use the same `MAJOR.MINOR.PATCH` version.

### Version format

Use the format `MAJOR.MINOR.PATCH`, with a leading `v` for Git tags:

- Git tag: `v1.2.3`
- npm package version: `1.2.3`

Do not use shortened tags such as `v1.0` or `v1.1`.

### Version increments

- **MAJOR** (`1.2.3` → `2.0.0`): introduce incompatible public API changes or other changes that require consumers to migrate.
- **MINOR** (`1.2.3` → `1.3.0`): add functionality in a backwards-compatible manner.
- **PATCH** (`1.2.3` → `1.2.4`): make backwards-compatible bug fixes, maintenance updates, and security fixes.

During initial development, use `0.MINOR.PATCH` versions. The public API may change before `1.0.0`; increment the minor version for development milestones or backwards-incompatible changes, and the patch version for backwards-compatible fixes.

### Pre-release versions

Use SemVer pre-release identifiers when publishing or tagging test builds, for example:

- `0.3.0-alpha.1`
- `0.3.0-beta.1`
- `0.3.0-rc.1`

Do not use pre-release tags as stable releases.

### Release discipline

- Create release tags only from the intended release commit on the default branch.
- The Git tag and package version MUST match, excluding the leading `v` on the Git tag.
- Before tagging, review changes since the previous release and confirm relevant tests, type checks, linting, and production builds pass where configured.
- Update release notes or a changelog with user-visible changes, fixes, security notes, and known limitations.
- Never move or overwrite an existing release tag. If a release is defective, publish a new, incremented version with a clear explanation.
- Do not claim a security fix is complete until the fix and its regression test have been reviewed.
- Do not create, push, or publish release tags or packages unless the maintainer explicitly requests the release action.
- Do not invent version numbers. Determine the next version from the latest existing release and the actual compatibility impact of the changes.

Specification: https://semver.org/spec/v2.0.0.html

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
