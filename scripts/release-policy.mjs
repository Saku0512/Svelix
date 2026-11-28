import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const STABLE_SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const BOOTSTRAP_PLACEHOLDER = '0.0.0-stage';
const GIT_SHA = /^[0-9a-f]{40}$/;

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

export const inspectCandidateStage = ({
  stages,
  packageName,
  candidateVersion,
  expectedShasum
}) => {
  if (!Array.isArray(stages)) throw new Error('Expected npm stage list to return an array');

  const packageStages = stages.filter((stage) => stage?.packageName === packageName);
  const candidates = packageStages.filter((stage) => stage?.version === candidateVersion);
  if (candidates.length === 0) {
    return { state: packageStages.length === 0 ? 'none' : 'conflict', stageId: '' };
  }

  const [candidate] = candidates;
  if (
    candidates.length === 1
    && typeof candidate.id === 'string'
    && candidate.id.length > 0
    && candidate.tag === 'latest'
    && candidate.shasum === expectedShasum
  ) {
    return { state: 'matching', stageId: candidate.id };
  }

  return { state: 'conflict', stageId: '' };
};

export const planStableRelease = ({
  candidateVersion,
  latestVersion,
  packageExists,
  candidatePublished,
  integrityMatches,
  candidateStage = 'none',
  releaseMode = 'release'
}) => {
  parseStableVersion(candidateVersion);
  if (!['release', 'stage-first-release'].includes(releaseMode)) {
    throw new Error(`Unknown release mode: ${releaseMode}`);
  }
  if (typeof packageExists !== 'boolean') {
    throw new Error(`Expected a boolean package-existence state, received ${packageExists}`);
  }
  if (!['none', 'matching', 'conflict'].includes(candidateStage)) {
    throw new Error(`Unknown candidate stage state: ${candidateStage}`);
  }

  const hasPlaceholder = latestVersion === BOOTSTRAP_PLACEHOLDER;
  if (latestVersion !== null && !hasPlaceholder) parseStableVersion(latestVersion);
  if (!packageExists && latestVersion !== null) {
    throw new Error('Refusing release: npm latest exists while the package lookup is missing');
  }
  if (!packageExists && candidatePublished) {
    throw new Error('Refusing release: the candidate exists while the package lookup is missing');
  }

  if (releaseMode === 'stage-first-release') {
    if (candidatePublished || (latestVersion !== null && !hasPlaceholder)) {
      throw new Error('Initial staging is only allowed before a stable npm package exists');
    }
    if (candidateStage === 'conflict') {
      throw new Error(
        'Refusing to stage: a conflicting pending stage exists; inspect it manually'
      );
    }
    if (candidateStage === 'matching') return 'await-approval';
    if (packageExists || hasPlaceholder) {
      throw new Error(
        'Refusing to restage: the npm package or bootstrap placeholder exists without a matching pending stage; inspect the registry manually'
      );
    }
    return 'stage';
  }

  if (hasPlaceholder) {
    throw new Error(
      'Refusing direct publication: npm latest is the bootstrap placeholder; inspect and approve the pending stage first'
    );
  }
  if (packageExists && latestVersion === null && !candidatePublished) {
    throw new Error(
      'Refusing publication: the npm package exists but latest is missing; inspect the registry manually'
    );
  }

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

  if (latestVersion === null) {
    throw new Error(
      `Refusing to publish ${candidateVersion} directly: use stage-first-release for the initial npm package`
    );
  }

  return 'publish';
};

export const planProvenance = ({ publicationPlan, sourceSha, workflowSha }) => {
  if (!['stage', 'await-approval', 'publish', 'resume'].includes(publicationPlan)) {
    throw new Error(`Unknown publication plan: ${publicationPlan}`);
  }
  if (!GIT_SHA.test(sourceSha) || !GIT_SHA.test(workflowSha)) {
    throw new Error('Expected full lowercase Git commit SHAs for provenance planning');
  }
  if (['await-approval', 'resume'].includes(publicationPlan)) return 'not-applicable';
  if (sourceSha === workflowSha) return 'generate';
  if (publicationPlan === 'stage') return 'omit-bootstrap-recovery';
  throw new Error(
    `Refusing to publish with provenance: workflow identity ${workflowSha} differs from package source ${sourceSha}`
  );
};

const runCli = () => {
  const [command, ...args] = process.argv.slice(2);

  if (command === 'stage-state') {
    const [stageFile, packageName, candidateVersion, expectedShasum] = args;
    if (!stageFile || !packageName || !candidateVersion || !expectedShasum) {
      throw new Error(
        'Usage: node scripts/release-policy.mjs stage-state <stage-list.json> <package> <candidate> <shasum>'
      );
    }
    const result = inspectCandidateStage({
      stages: JSON.parse(readFileSync(stageFile, 'utf8')),
      packageName,
      candidateVersion,
      expectedShasum
    });
    process.stdout.write(JSON.stringify(result));
    return;
  }

  if (command === 'provenance') {
    const [publicationPlan, sourceSha, workflowSha] = args;
    process.stdout.write(planProvenance({ publicationPlan, sourceSha, workflowSha }));
    return;
  }

  if (command !== 'plan') {
    throw new Error(
      'Usage: node scripts/release-policy.mjs plan <candidate> <latest|-> <present|absent> <published|unpublished> <match|mismatch> <none|matching|conflict> [release|stage-first-release]'
    );
  }

  const [
    candidateVersion,
    latestArgument,
    packageState,
    publicationState,
    integrityState,
    candidateStage,
    releaseMode = 'release'
  ] = args;
  if (!['present', 'absent'].includes(packageState)) {
    throw new Error(`Expected present or absent package state, received ${packageState}`);
  }
  if (!['published', 'unpublished'].includes(publicationState)) {
    throw new Error(`Expected published or unpublished state, received ${publicationState}`);
  }
  if (!['match', 'mismatch'].includes(integrityState)) {
    throw new Error(`Expected match or mismatch integrity state, received ${integrityState}`);
  }
  if (!['none', 'matching', 'conflict'].includes(candidateStage)) {
    throw new Error(`Expected none, matching, or conflict stage state, received ${candidateStage}`);
  }
  if (!['release', 'stage-first-release'].includes(releaseMode)) {
    throw new Error(`Expected release or stage-first-release mode, received ${releaseMode}`);
  }

  const action = planStableRelease({
    candidateVersion,
    latestVersion: latestArgument === '-' ? null : latestArgument,
    packageExists: packageState === 'present',
    candidatePublished: publicationState === 'published',
    integrityMatches: integrityState === 'match',
    candidateStage,
    releaseMode
  });
  process.stdout.write(action);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runCli();
