import { pathToFileURL } from 'node:url';

const STABLE_SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export const parseStableVersion = (version) => {
  const match = STABLE_SEMVER.exec(version);
  if (!match) throw new Error(`Expected a stable MAJOR.MINOR.PATCH version, received ${version}`);
  return match.slice(1).map(BigInt);
};

export const compareStableVersions = (left, right) => {
  const leftParts = parseStableVersion(left);
  const rightParts = parseStableVersion(right);

  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] < rightParts[index]) return -1;
    if (leftParts[index] > rightParts[index]) return 1;
  }
  return 0;
};

export const planStableRelease = ({
  candidateVersion,
  latestVersion,
  candidatePublished,
  integrityMatches
}) => {
  parseStableVersion(candidateVersion);
  const comparison = latestVersion === null
    ? null
    : compareStableVersions(candidateVersion, latestVersion);

  if (comparison !== null && comparison < 0) {
    throw new Error(
      `Refusing to release ${candidateVersion}: npm latest is newer at ${latestVersion}`
    );
  }

  if (candidatePublished) {
    if (!integrityMatches) {
      throw new Error(
        `Refusing to resume ${candidateVersion}: the published tarball integrity differs`
      );
    }
    if (latestVersion === null) {
      throw new Error(
        `Refusing to resume ${candidateVersion}: the version exists but npm latest is missing`
      );
    }
    if (comparison !== 0) {
      throw new Error(
        `Refusing to resume ${candidateVersion}: npm latest is ${latestVersion}; review the registry state manually`
      );
    }
    return 'resume';
  }

  if (comparison === 0) {
    throw new Error(
      `Refusing to publish ${candidateVersion}: npm latest already names that version but its archive was not found`
    );
  }

  return 'publish';
};

const runCli = () => {
  const [command, candidateVersion, latestArgument, publicationState, integrityState] = process.argv.slice(2);
  if (command !== 'plan') {
    throw new Error(
      'Usage: node scripts/release-policy.mjs plan <candidate> <latest|-> <published|unpublished> <match|mismatch>'
    );
  }
  if (!['published', 'unpublished'].includes(publicationState)) {
    throw new Error(`Expected published or unpublished state, received ${publicationState}`);
  }
  if (!['match', 'mismatch'].includes(integrityState)) {
    throw new Error(`Expected match or mismatch integrity state, received ${integrityState}`);
  }

  const action = planStableRelease({
    candidateVersion,
    latestVersion: latestArgument === '-' ? null : latestArgument,
    candidatePublished: publicationState === 'published',
    integrityMatches: integrityState === 'match'
  });
  process.stdout.write(action);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runCli();
