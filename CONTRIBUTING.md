# Contributing to Svelix

Thank you for helping improve Svelix. The project favors small, focused changes that preserve native HTML behavior, Svelte compatibility, accessibility, and a minimal dependency footprint.

## Before starting

1. Search the issue tracker for an existing issue or discussion.
2. Confirm the intended release and scope before establishing a new public API.
3. Read [AGENTS.md](AGENTS.md) for the complete repository, branch, commit, compatibility, and release policies.

## Development setup

Svelix development uses Node.js 24 LTS and npm with the committed lockfile.

```sh
npm ci
npm run check
npm run build
npm test
```

The browser checks use a local Chrome or Chromium executable. Set `CHROME_PATH` when it is not available as `google-chrome` on `PATH`.

## Branches

Create release work from the corresponding release branch:

```text
release_v0.1.0                 target release branch
v0.1.0/docs_release-notes      release-work branch
```

Use the full SemVer version and one of the supported work types documented in [AGENTS.md](AGENTS.md). Do not develop release features directly on `main` or merge a release-work branch directly into `main`.

## Changes

- Prefer semantic HTML and platform behavior over custom JavaScript.
- Keep component APIs small, typed, and consistent with the existing Svelte version.
- Preserve public names and behavior unless a breaking change is explicitly approved.
- Add or update observable tests for behavior changes and regression fixes.
- Avoid unrelated formatting, generated output, dependencies, and speculative abstractions.
- Write repository documentation, tests, comments, commits, and pull requests in English.

## Verification

Run the checks relevant to the change. The complete release-work verification is:

```sh
npm run check
npm run build
npm test
npm run test:package:clean
git diff --check origin/release_v0.1.0...HEAD
```

Report checks that cannot run. Do not claim compatibility, accessibility, performance, or bundle-size results that were not measured.

## Commits and pull requests

Each commit must contain one coherent change and use Conventional Commits 1.0.0, for example:

```text
docs(readme): add installation and compatibility guidance
test(package): verify release tarball contents
```

Before opening a pull request, re-read the latest linked issue and verify every acceptance criterion against the complete proposed diff. Include criterion-by-criterion evidence and the exact commands and revision tested. Do not open even a draft pull request while a required criterion is incomplete or unverified.

## Releases

Only a maintainer may authorize release integration, Git tags, npm publication, or a GitHub Release. Never create, move, or publish a release tag or package as part of an ordinary contribution.
