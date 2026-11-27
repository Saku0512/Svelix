// Ensures dist/ matches the current source tree before running any test that
// consumes built package artifacts, while avoiding duplicate builds across
// consecutive test scripts when neither inputs nor dist/ have changed.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

function hashDirectory(baseDir, prefix = '') {
  const current = join(baseDir, prefix);
  if (!existsSync(current)) return [];
  return readdirSync(current, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) return hashDirectory(baseDir, rel);
      if (!entry.isFile()) return [];
      const digest = createHash('sha256').update(readFileSync(join(baseDir, rel))).digest('hex');
      return [`${rel}:${digest}`];
    });
}

export function computeSourceSignature(projectRoot) {
  const hash = createHash('sha256');
  for (const entry of hashDirectory(join(projectRoot, 'src'))) {
    hash.update(`src/${entry}\n`);
  }
  for (const manifest of ['package.json', 'tsconfig.json']) {
    const file = join(projectRoot, manifest);
    if (existsSync(file)) {
      hash.update(`${manifest}:`);
      hash.update(readFileSync(file));
      hash.update('\n');
    }
  }
  return hash.digest('hex');
}

export function computeDistSignature(projectRoot) {
  const distDir = join(projectRoot, 'dist');
  if (!existsSync(join(distDir, 'index.js'))) return null;
  const entries = hashDirectory(distDir);
  if (entries.length === 0) return null;
  return createHash('sha256').update(entries.join('\n')).digest('hex');
}

export function defaultStampPath(projectRoot) {
  return join(projectRoot, 'node_modules/.cache/svelix-build-stamp.json');
}

export function isDistFresh(projectRoot, stampFile = defaultStampPath(projectRoot)) {
  if (!existsSync(stampFile)) return false;
  const distHash = computeDistSignature(projectRoot);
  if (!distHash) return false;
  try {
    const recorded = JSON.parse(readFileSync(stampFile, 'utf8'));
    return (
      recorded?.sourceHash === computeSourceSignature(projectRoot) &&
      recorded?.distHash === distHash
    );
  } catch {
    return false;
  }
}

export function ensureFreshDist(
  projectRoot,
  { stampFile = defaultStampPath(projectRoot), buildRunner } = {}
) {
  if (isDistFresh(projectRoot, stampFile)) {
    return { rebuilt: false };
  }

  if (buildRunner) {
    buildRunner(projectRoot);
  } else {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    execFileSync(npm, ['run', 'build'], {
      cwd: projectRoot,
      stdio: 'inherit',
      shell: process.platform === 'win32'
    });
  }

  const distHash = computeDistSignature(projectRoot);
  if (!distHash) {
    throw new Error(`Build completed in ${projectRoot}, but dist/index.js is missing.`);
  }
  const sourceHash = computeSourceSignature(projectRoot);
  mkdirSync(dirname(stampFile), { recursive: true });
  writeFileSync(stampFile, JSON.stringify({ sourceHash, distHash }, null, 2));
  return { rebuilt: true };
}
