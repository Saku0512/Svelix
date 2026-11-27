import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const root = process.cwd();
const fixture = mkdtempSync(join(tmpdir(), 'svelix-consumer-'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const packResult = (output, name) => {
  const parsed = JSON.parse(output);
  const pack = Array.isArray(parsed) ? parsed[0] : parsed[name] ?? Object.values(parsed)[0];
  if (!pack?.filename) throw new Error(`npm pack did not report a filename for ${name}`);
  return pack;
};

try {
  const pack = packResult(execFileSync(npm, ['pack', '--json', '--pack-destination', fixture], {
    cwd: root, encoding: 'utf8', shell: process.platform === 'win32'
  }), 'svelix');
  const sveltePack = packResult(execFileSync(npm, [
    'pack', join(root, 'node_modules/svelte'), '--json', '--pack-destination', fixture
  ], { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' }), 'svelte');
  writeFileSync(join(fixture, 'package.json'), JSON.stringify({
    name: 'svelix-consumer-fixture', version: '0.0.0', private: true, type: 'module',
    dependencies: {
      svelix: `file:${pack.filename}`,
      svelte: `file:${sveltePack.filename}`
    }
  }));
  execFileSync(npm, ['install', '--ignore-scripts', '--offline', '--no-audit', '--no-fund'], {
    cwd: fixture, stdio: 'inherit', shell: process.platform === 'win32'
  });
  writeFileSync(join(fixture, 'consumer.ts'), `import type { ComponentProps } from 'svelte';
import { Button, Input } from 'svelix';

const button: ComponentProps<typeof Button> = {
  variant: 'outline',
  type: 'submit',
  formaction: '/save',
  onclick: (event) => event.currentTarget.form?.checkValidity()
};
const input: ComponentProps<typeof Input> = {
  type: 'email',
  autocomplete: 'email',
  readonly: true,
  'aria-invalid': true,
  oninput: (event) => event.currentTarget.checkValidity()
};
// @ts-expect-error variants are intentionally limited
const invalidButton: ComponentProps<typeof Button> = { variant: 'danger' };
// @ts-expect-error native input elements cannot have children
const invalidInput: ComponentProps<typeof Input> = { children: () => {} };
void [button, input, invalidButton, invalidInput];
`);
  writeFileSync(join(fixture, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { module: 'esnext', moduleResolution: 'bundler', strict: true, noEmit: true, skipLibCheck: true },
    include: ['consumer.ts']
  }));
  execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', fixture], { stdio: 'inherit' });
  writeFileSync(join(fixture, 'index.html'), '<div id="app"></div><script type="module" src="/main.js"></script>');
  writeFileSync(join(fixture, 'main.js'), "import 'svelix';\nimport 'svelix/styles.css';\nimport App from './App.svelte';\nimport { mount } from 'svelte';\nmount(App, { target: document.getElementById('app') });\n");
  writeFileSync(join(fixture, 'App.svelte'), `<script>
  import { Button, Input } from 'svelix';
  let email = $state('');
</script>

<form>
  <label for="email">Email</label>
  <Input id="email" name="email" type="email" autocomplete="email" bind:value={email} required />
  <Button variant="outline">Submit</Button>
</form>
`);
  await build({ root: fixture, configFile: false, plugins: [svelte()], build: { outDir: resolve(fixture, 'output') } });
  console.log('External Svelte consumer build passed.');
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
