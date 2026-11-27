import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const root = process.cwd();
const fixture = mkdtempSync(join(tmpdir(), 'svelix-consumer-'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

try {
  const pack = JSON.parse(execFileSync(npm, ['pack', '--json', '--pack-destination', fixture], {
    cwd: root, encoding: 'utf8', shell: process.platform === 'win32'
  }));
  writeFileSync(join(fixture, 'package.json'), JSON.stringify({
    name: 'svelix-consumer-fixture', private: true, type: 'module',
    dependencies: { svelix: `file:${pack[0].filename}`, svelte: JSON.parse(readFileSync(join(root, 'node_modules/svelte/package.json'))).version }
  }));
  execFileSync(npm, ['install', '--ignore-scripts', '--offline', '--no-audit', '--no-fund'], {
    cwd: fixture, stdio: 'inherit', shell: process.platform === 'win32'
  });
  writeFileSync(join(fixture, 'index.html'), '<div id="app"></div><script type="module" src="/main.js"></script>');
  writeFileSync(join(fixture, 'main.js'), "import 'svelix';\nimport 'svelix/styles.css';\nimport App from './App.svelte';\nimport { mount } from 'svelte';\nmount(App, { target: document.getElementById('app') });\n");
  writeFileSync(join(fixture, 'App.svelte'), '<h1>Svelix consumer</h1>\n');
  await build({ root: fixture, configFile: false, plugins: [svelte()], build: { outDir: resolve(fixture, 'output') } });
  console.log('External Svelte consumer build passed.');
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
