import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareStableVersions,
  inspectCandidateStage,
  parseStableVersion,
  planProvenance,
  planStableRelease
} from '../scripts/release-policy.mjs';

const SOURCE_SHA = '1111111111111111111111111111111111111111';
const WORKFLOW_SHA = '2222222222222222222222222222222222222222';

const initialRelease = (overrides = {}) => ({
  candidateVersion: '0.1.0',
  latestVersion: null,
  packageExists: false,
  candidatePublished: false,
  integrityMatches: false,
  candidateStage: 'none',
  releaseMode: 'stage-first-release',
  ...overrides
});

test('compares stable semantic versions numerically', () => {
  assert.equal(compareStableVersions('0.1.0', '0.2.0'), -1);
  assert.equal(compareStableVersions('1.0.0', '0.99.99'), 1);
  assert.equal(compareStableVersions('2.3.4', '2.3.4'), 0);
  assert.equal(compareStableVersions('9007199254740993.0.0', '9007199254740992.0.0'), 1);
});

test('rejects non-stable and non-canonical versions', () => {
  for (const version of ['1.0', '1.0.0-rc.1', '01.0.0', 'v1.0.0']) {
    assert.throws(() => parseStableVersion(version), /stable MAJOR\.MINOR\.PATCH/);
  }
});

test('identifies a single matching pending stage by version, tag, and shasum', () => {
  const matchingStage = {
    id: '1aa11111-2222-3333-4444-555555555555',
    packageName: 'svelix',
    version: '0.1.0',
    tag: 'latest',
    shasum: 'abc123'
  };
  assert.deepEqual(inspectCandidateStage({
    stages: [matchingStage, { ...matchingStage, id: 'other', version: '0.2.0' }],
    packageName: 'svelix',
    candidateVersion: '0.1.0',
    expectedShasum: 'abc123'
  }), { state: 'matching', stageId: matchingStage.id });

  assert.deepEqual(inspectCandidateStage({
    stages: [],
    packageName: 'svelix',
    candidateVersion: '0.1.0',
    expectedShasum: 'abc123'
  }), { state: 'none', stageId: '' });
});

test('marks duplicate or mismatched pending stages as conflicts', () => {
  const baseStage = {
    id: '1aa11111-2222-3333-4444-555555555555',
    packageName: 'svelix',
    version: '0.1.0',
    tag: 'latest',
    shasum: 'abc123'
  };
  for (const stages of [
    [{ ...baseStage, shasum: 'different' }],
    [{ ...baseStage, tag: 'next' }],
    [baseStage, { ...baseStage, id: '2bb22222-2222-3333-4444-555555555555' }],
    [{ ...baseStage, version: '0.2.0' }]
  ]) {
    assert.deepEqual(inspectCandidateStage({
      stages,
      packageName: 'svelix',
      candidateVersion: '0.1.0',
      expectedShasum: 'abc123'
    }), { state: 'conflict', stageId: '' });
  }
});

test('stages a genuinely absent initial package and rejects direct publication', () => {
  assert.equal(planStableRelease(initialRelease()), 'stage');
  assert.throws(() => planStableRelease(initialRelease({ releaseMode: 'release' })),
    /use stage-first-release/);
});

test('waits for approval instead of restaging a matching pending candidate', () => {
  assert.equal(planStableRelease(initialRelease({
    latestVersion: '0.0.0-stage',
    packageExists: true,
    candidateStage: 'matching'
  })), 'await-approval');
  assert.equal(planStableRelease(initialRelease({
    packageExists: true,
    candidateStage: 'matching'
  })), 'await-approval');
});

test('fails closed for placeholder, missing-latest, and conflicting bootstrap states', () => {
  assert.throws(() => planStableRelease(initialRelease({
    latestVersion: '0.0.0-stage',
    packageExists: true
  })), /without a matching pending stage/);
  assert.throws(() => planStableRelease(initialRelease({ packageExists: true })),
    /without a matching pending stage/);
  assert.throws(() => planStableRelease(initialRelease({ candidateStage: 'conflict' })),
    /conflicting pending stage/);
  assert.throws(() => planStableRelease(initialRelease({
    latestVersion: '0.0.0-stage',
    packageExists: true,
    releaseMode: 'release'
  })), /bootstrap placeholder/);
});

test('rejects initial staging after a stable npm package already exists', () => {
  assert.throws(() => planStableRelease(initialRelease({
    candidateVersion: '0.2.0',
    latestVersion: '0.1.0',
    packageExists: true
  })), /before a stable npm package exists/);
});

test('publishes a version newer than npm latest', () => {
  assert.equal(planStableRelease({
    candidateVersion: '0.2.0',
    latestVersion: '0.1.0',
    packageExists: true,
    candidatePublished: false,
    integrityMatches: false
  }), 'publish');
});

test('rejects an unpublished version older than npm latest', () => {
  assert.throws(() => planStableRelease({
    candidateVersion: '0.1.0',
    latestVersion: '0.2.0',
    packageExists: true,
    candidatePublished: false,
    integrityMatches: false
  }), /npm latest is newer/);
});

test('only resumes a published version when integrity and npm latest both match', () => {
  const publishedCandidate = {
    candidateVersion: '0.2.0',
    latestVersion: '0.2.0',
    packageExists: true,
    candidatePublished: true,
    integrityMatches: true
  };
  assert.equal(planStableRelease(publishedCandidate), 'resume');

  assert.throws(() => planStableRelease({ ...publishedCandidate, integrityMatches: false }),
    /integrity differs/);
  assert.throws(() => planStableRelease({ ...publishedCandidate, latestVersion: '0.1.0' }),
    /review the registry state manually/);
  assert.throws(() => planStableRelease({
    ...publishedCandidate,
    candidateVersion: '0.1.0'
  }), /npm latest is newer/);
  assert.throws(() => planStableRelease({ ...publishedCandidate, latestVersion: null }),
    /npm latest is missing/);
});

test('rejects inconsistent registry package, latest, and candidate states', () => {
  assert.throws(() => planStableRelease({
    candidateVersion: '0.2.0',
    latestVersion: '0.2.0',
    packageExists: true,
    candidatePublished: false,
    integrityMatches: false
  }), /archive was not found/);
  assert.throws(() => planStableRelease({
    candidateVersion: '0.2.0',
    latestVersion: null,
    packageExists: true,
    candidatePublished: false,
    integrityMatches: false
  }), /package exists but latest is missing/);
  assert.throws(() => planStableRelease({
    candidateVersion: '0.2.0',
    latestVersion: '0.1.0',
    packageExists: false,
    candidatePublished: false,
    integrityMatches: false
  }), /latest exists while the package lookup is missing/);
});

test('generates provenance only when the workflow identity matches the package source', () => {
  assert.equal(planProvenance({
    publicationPlan: 'stage',
    sourceSha: SOURCE_SHA,
    workflowSha: SOURCE_SHA
  }), 'generate');
  assert.equal(planProvenance({
    publicationPlan: 'stage',
    sourceSha: SOURCE_SHA,
    workflowSha: WORKFLOW_SHA
  }), 'omit-bootstrap-recovery');
  assert.equal(planProvenance({
    publicationPlan: 'await-approval',
    sourceSha: SOURCE_SHA,
    workflowSha: WORKFLOW_SHA
  }), 'not-applicable');
  assert.equal(planProvenance({
    publicationPlan: 'resume',
    sourceSha: SOURCE_SHA,
    workflowSha: WORKFLOW_SHA
  }), 'not-applicable');
  assert.throws(() => planProvenance({
    publicationPlan: 'publish',
    sourceSha: SOURCE_SHA,
    workflowSha: WORKFLOW_SHA
  }), /differs from package source/);
});
