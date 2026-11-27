# Release automation

[Documentation index](README.md) · [Development and verification](verification.md) · [Release notes](releases/v0.1.0.md)

Svelix uses `.github/workflows/release.yml` to create stable releases. Starting the workflow manually is an explicit release action: after validation succeeds, it can create and push an immutable Git tag, publish the npm package, and create the GitHub Latest Release.

## Safety model

The workflow enforces the repository release policy:

- Only stable `MAJOR.MINOR.PATCH` versions are accepted.
- The npm version comes from `package.json`; the Git tag must be the exact corresponding `vMAJOR.MINOR.PATCH` value.
- A manual release must run from the current `main` tip and requires the confirmation value `RELEASE`.
- A manually pushed matching tag may also start the workflow, but its commit must be contained in `main`.
- Type checks, the package build, the full test suite, the clean reproducible package check, dependency audit, and package archive review must pass before a new tag is created.
- Existing tags are never moved. A conflicting tag stops the workflow.
- All release triggers share one package-level concurrency group, so manual and tag-triggered publications cannot overlap.
- A candidate older than the current npm `latest` version is rejected before the workflow creates a tag or publishes anything.
- The validation job creates the real npm archive, verifies its allowlist and consumer contract, records its SHA-256 digest, and transfers that exact artifact to the publication job.
- A rerun only accepts an existing npm version when its registry tarball integrity matches the verified artifact and that version is still npm `latest`.
- The npm `latest` tag must resolve to the package version before the GitHub Release is published.
- The `npm` GitHub Environment gates the tag-and-publish job and can require maintainer approval.

## One-time GitHub setup

Create a GitHub Environment named `npm`. Add required reviewers so the deployment job cannot tag or publish without approval.

The first publication needs a short-lived npm credential because trusted publishing can only be configured after the package exists:

1. Create an npm granular access token that is permitted to publish `svelix` and satisfies the npm account's two-factor authentication policy.
2. Store it as an Environment secret named `NPM_TOKEN` in the `npm` Environment.
3. Run the first release, then remove the secret.

Do not weaken npm two-factor authentication to make automation work. If the npm account only permits staged publication, use npm's staged-publishing bootstrap flow, approve the staged package, and then configure trusted publishing before rerunning the release workflow.

## Preferred npm trusted-publisher setup

After `svelix` exists on npm, configure an npm trusted publisher with these exact values:

| Setting | Value |
| --- | --- |
| Provider | GitHub Actions |
| Organization or user | `Saku0512` |
| Repository | `Svelix` |
| Workflow filename | `release.yml` |
| Environment | `npm` |
| Allowed action | Direct `npm publish` |

The release job grants `id-token: write`, uses a GitHub-hosted runner, and publishes with provenance. When `NPM_TOKEN` is absent, npm uses the short-lived OIDC identity from the trusted-publisher configuration. See the [npm trusted publishing documentation](https://docs.npmjs.com/trusted-publishers/) for current setup and security options.

## Run a release

1. Merge the approved release pull request into `main`.
2. Confirm `package.json`, `CHANGELOG.md`, and `docs/releases/vMAJOR.MINOR.PATCH.md` describe the same stable version.
3. Open **Actions → Release → Run workflow**.
4. Select `main`, enter `RELEASE`, and start the workflow.
5. Approve the `npm` Environment deployment when the validation job has passed.
6. Verify the workflow summary, the npm package version and `latest` tag, the immutable Git tag, and the GitHub Latest Release.

Pushing an already-created matching stable tag can also start the workflow. Prefer manual dispatch because it runs all checks before creating the tag.

## Failure and rerun behavior

If validation fails, no new tag or publication is created. If a later external operation fails, fix the external configuration and rerun the same workflow without moving the tag or changing the package version. The rerun verifies the existing tag commit, the transferred artifact digest, the npm tarball integrity, and the current npm `latest` version before continuing. If a matching published version is no longer `latest`, the workflow stops for manual registry review instead of changing distribution tags implicitly.

Never delete or overwrite a published tag or npm version. Fix a defective release in a new SemVer version.
