import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { build } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const root = process.cwd();
const temporary = mkdtempSync(join(tmpdir(), 'svelix-clean-'));
const library = join(temporary, 'library');
const consumer = join(temporary, 'consumer');
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run this test with npm run test:package:clean');
const runNpm = (args, cwd) => execFileSync(process.execPath, [npm, ...args], { cwd, stdio: 'inherit' });
const hashes = (directory, prefix = '') => readdirSync(join(directory, prefix), { withFileTypes: true })
  .sort((a, b) => a.name.localeCompare(b.name))
  .flatMap((entry) => {
    const path = join(prefix, entry.name);
    if (entry.isDirectory()) return hashes(directory, path);
    if (!entry.isFile()) throw new Error(`Unexpected output entry: ${path}`);
    return [[path, createHash('sha256').update(readFileSync(join(directory, path))).digest('hex')]];
  });

try {
  mkdirSync(library);
  mkdirSync(consumer);
  for (const file of ['package.json', 'package-lock.json', 'tsconfig.json']) copyFileSync(join(root, file), join(library, file));
  cpSync(join(root, 'src'), join(library, 'src'), { recursive: true });
  runNpm(['ci', '--ignore-scripts', '--no-audit', '--no-fund'], library);
  runNpm(['run', 'build'], library);
  const first = hashes(join(library, 'dist'));
  rmSync(join(library, 'dist'), { recursive: true });
  runNpm(['run', 'build'], library);
  if (JSON.stringify(first) !== JSON.stringify(hashes(join(library, 'dist')))) throw new Error('Build outputs differ');
  console.log('Actual package builds matched.');
  writeFileSync(join(library, 'src/lib/Probe.svelte'), '<script lang="ts">\n  let { message }: { message: string } = $props();\n</script>\n<p>{message}</p>\n');
  writeFileSync(join(library, 'src/lib/index.ts'), "export { default as Probe } from './Probe.svelte';\n");
  runNpm(['run', 'build'], library);
  runNpm(['pack', '--pack-destination', consumer], library);
  const version = JSON.parse(readFileSync(join(library, 'package.json'))).version;
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({ name: 'svelix-clean-consumer', private: true, type: 'module', dependencies: { svelix: `file:svelix-${version}.tgz`, svelte: JSON.parse(readFileSync(join(library, 'node_modules/svelte/package.json'))).version } }));
  runNpm(['install', '--ignore-scripts', '--no-audit', '--no-fund'], consumer);
  writeFileSync(join(consumer, 'consumer.ts'), "import type { ComponentProps } from 'svelte';\nimport { Probe } from 'svelix';\nconst valid: ComponentProps<typeof Probe> = { message: 'ok' };\n// @ts-expect-error message must be a string\nconst invalid: ComponentProps<typeof Probe> = { message: 1 };\nvoid [valid, invalid];\n");
  writeFileSync(join(consumer, 'tsconfig.json'), JSON.stringify({ compilerOptions: { module: 'esnext', moduleResolution: 'bundler', strict: true, noEmit: true, skipLibCheck: true }, include: ['consumer.ts'] }));
  execFileSync(process.execPath, [join(library, 'node_modules/typescript/bin/tsc'), '-p', consumer], { stdio: 'inherit' });
  writeFileSync(join(consumer, 'index.html'), '<div id="app"></div><script type="module" src="/main.js"></script>');
  writeFileSync(join(consumer, 'main.js'), "import 'svelix/styles.css';\nimport App from './App.svelte';\nimport { mount } from 'svelte';\nmount(App, { target: document.getElementById('app') });\n");
  writeFileSync(join(consumer, 'App.svelte'), '<script>\n  import { Probe } from "svelix";\n</script>\n<Probe message="hello" />\n');
  await build({ root: consumer, configFile: false, plugins: [svelte()], build: { outDir: join(consumer, 'output') } });
  console.log('Clean install, reproducible build, component types, and consumer build passed.');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
