import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareStableVersions,
  parseStableVersion,
  planStableRelease
} from '../scripts/release-policy.mjs';

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

test('publishes the first version or a version newer than npm latest', () => {
  assert.equal(planStableRelease({
    candidateVersion: '0.1.0',
    latestVersion: null,
    candidatePublished: false,
    integrityMatches: false
  }), 'publish');
  assert.equal(planStableRelease({
    candidateVersion: '0.2.0',
    latestVersion: '0.1.0',
    candidatePublished: false,
    integrityMatches: false
  }), 'publish');
});

test('rejects an unpublished version older than npm latest', () => {
  assert.throws(() => planStableRelease({
    candidateVersion: '0.1.0',
    latestVersion: '0.2.0',
    candidatePublished: false,
    integrityMatches: false
  }), /npm latest is newer/);
});

test('only resumes a published version when integrity and npm latest both match', () => {
  assert.equal(planStableRelease({
    candidateVersion: '0.2.0',
    latestVersion: '0.2.0',
    candidatePublished: true,
    integrityMatches: true
  }), 'resume');

  assert.throws(() => planStableRelease({
    candidateVersion: '0.2.0',
    latestVersion: '0.2.0',
    candidatePublished: true,
    integrityMatches: false
  }), /integrity differs/);
  assert.throws(() => planStableRelease({
    candidateVersion: '0.2.0',
    latestVersion: '0.1.0',
    candidatePublished: true,
    integrityMatches: true
  }), /review the registry state manually/);
  assert.throws(() => planStableRelease({
    candidateVersion: '0.1.0',
    latestVersion: '0.2.0',
    candidatePublished: true,
    integrityMatches: true
  }), /npm latest is newer/);
  assert.throws(() => planStableRelease({
    candidateVersion: '0.2.0',
    latestVersion: null,
    candidatePublished: true,
    integrityMatches: true
  }), /npm latest is missing/);
});

test('rejects inconsistent registry state for an unpublished latest version', () => {
  assert.throws(() => planStableRelease({
    candidateVersion: '0.2.0',
    latestVersion: '0.2.0',
    candidatePublished: false,
    integrityMatches: false
  }), /archive was not found/);
});
