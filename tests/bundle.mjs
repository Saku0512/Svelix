// Verifies production tree-shaking, CSS side-effect retention, and emitted
// JS/CSS bundle sizes by packing the actual svelix distribution tarball into
// an isolated consumer and inspecting Vite production build outputs.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { build } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

if (!existsSync(join(root, 'dist/index.js'))) {
  execFileSync(npm, ['run', 'build'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
}

const workDir = mkdtempSync(join(tmpdir(), 'svelix-bundle-'));

// Distinct runtime literals owned by each stateful/attributed component in dist/.
const COMPONENT_MARKERS = {
  Button: 'data-svelix-variant',
  Input: 'svelix.input.group',
  Checkbox: 'svelix.checkbox.checked',
  RadioGroup: 'svelix.radio-group.value',
  Separator: 'data-svelix-orientation'
};

function measureBytes(text) {
  const raw = Buffer.byteLength(text, 'utf8');
  const gzip = gzipSync(Buffer.from(text, 'utf8')).byteLength;
  const brotli = brotliCompressSync(Buffer.from(text, 'utf8')).byteLength;
  return { raw, gzip, brotli };
}

function collectAssets(assetsDir) {
  if (!existsSync(assetsDir)) return { js: '', css: '' };
  const files = readdirSync(assetsDir).sort();
  const js = files
    .filter((file) => file.endsWith('.js'))
    .map((file) => readFileSync(join(assetsDir, file), 'utf8'))
    .join('\n');
  const css = files
    .filter((file) => file.endsWith('.css'))
    .map((file) => readFileSync(join(assetsDir, file), 'utf8'))
    .join('\n');
  return { js, css };
}

try {
  // Pack the real build output and unpack it into an isolated consumer's node_modules/svelix
  // so package.json exports and sideEffects metadata are exercised exactly as published.
  const packOut = execFileSync(npm, ['pack', '--json', '--pack-destination', workDir], {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32'
  });
  const parsed = JSON.parse(packOut);
  const packInfo = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0];
  assert.ok(packInfo?.filename, 'npm pack must produce a tarball');

  const unpacked = join(workDir, 'unpacked');
  mkdirSync(unpacked, { recursive: true });
  execFileSync('tar', ['-xzf', join(workDir, packInfo.filename), '-C', unpacked]);

  const consumerBase = join(workDir, 'consumer');
  mkdirSync(join(consumerBase, 'node_modules'), { recursive: true });
  symlinkSync(join(unpacked, 'package'), join(consumerBase, 'node_modules/svelix'), 'dir');
  symlinkSync(join(root, 'node_modules/svelte'), join(consumerBase, 'node_modules/svelte'), 'dir');
  writeFileSync(
    join(consumerBase, 'package.json'),
    JSON.stringify({ name: 'svelix-bundle-consumer', private: true, type: 'module' })
  );

  const scenarios = [
    {
      name: 'styles-only',
      app: `<script>\n  import 'svelix/styles.css';\n</script>\n<p>Plain content</p>\n`,
      presentMarkers: [],
      absentMarkers: ['Button', 'Input', 'Checkbox', 'RadioGroup', 'Separator']
    },
    {
      name: 'button-only',
      app: `<script>\n  import { Button } from 'svelix';\n  import 'svelix/styles.css';\n</script>\n<Button>Save</Button>\n`,
      presentMarkers: ['Button'],
      absentMarkers: ['Input', 'Checkbox', 'RadioGroup', 'Separator']
    },
    {
      name: 'label-and-separator',
      app: `<script>\n  import { Label, Separator } from 'svelix';\n  import 'svelix/styles.css';\n</script>\n<Label for="x">Name</Label><input id="x" /><Separator />\n`,
      presentMarkers: ['Separator'],
      absentMarkers: ['Button', 'Input', 'Checkbox', 'RadioGroup']
    },
    {
      name: 'all-components',
      app: `<script>
  import { Button, Checkbox, Input, Label, Radio, RadioGroup, Separator } from 'svelix';
  import 'svelix/styles.css';
  let val = $state('');
  let checked = $state(false);
  let plan = $state('pro');
</script>
<Label for="f">Email</Label>
<Input id="f" bind:value={val} />
<Checkbox bind:checked />
<RadioGroup legend="Plan" name="plan" bind:value={plan}>
  <Radio value="pro" />
</RadioGroup>
<Separator />
<Button>Submit</Button>
`,
      presentMarkers: ['Button', 'Input', 'Checkbox', 'RadioGroup', 'Separator'],
      absentMarkers: []
    }
  ];

  const results = new Map();

  for (const scenario of scenarios) {
    const scenarioDir = join(consumerBase, scenario.name);
    const outDir = join(workDir, 'out', scenario.name);
    mkdirSync(scenarioDir, { recursive: true });
    writeFileSync(
      join(scenarioDir, 'index.html'),
      `<div id="app"></div><script type="module" src="./main.js"></script>`
    );
    writeFileSync(
      join(scenarioDir, 'main.js'),
      `import { mount } from 'svelte';\nimport App from './App.svelte';\nmount(App, { target: document.getElementById('app') });\n`
    );
    writeFileSync(join(scenarioDir, 'App.svelte'), scenario.app);

    await build({
      root: scenarioDir,
      configFile: false,
      logLevel: 'silent',
      plugins: [svelte()],
      build: { outDir, emptyOutDir: true }
    });

    const { js, css } = collectAssets(join(outDir, 'assets'));

    // Shared CSS tokens must always survive via package.json sideEffects: ["**/*.css"].
    assert.match(css, /--svelix-primary:/, `[${scenario.name}] shared token stylesheet was unexpectedly tree-shaken`);
    assert.doesNotMatch(css, /(^|\})\s*body\s*\{/, `[${scenario.name}] CSS must not emit global body resets`);

    for (const key of scenario.presentMarkers) {
      const marker = COMPONENT_MARKERS[key];
      assert.ok(
        js.includes(marker),
        `[${scenario.name}] expected production JS to retain ${key} marker (${marker})`
      );
    }

    for (const key of scenario.absentMarkers) {
      const marker = COMPONENT_MARKERS[key];
      assert.ok(
        !js.includes(marker),
        `[${scenario.name}] unused component ${key} (${marker}) was NOT tree-shaken from production JS`
      );
    }

    results.set(scenario.name, {
      js,
      css,
      jsSize: measureBytes(js),
      cssSize: measureBytes(css)
    });
  }

  // Verify unused component CSS is also omitted from focused barrel imports.
  const buttonCss = results.get('button-only').css;
  assert.match(buttonCss, /data-svelix-variant/, '[button-only] expected Button CSS rules');
  assert.doesNotMatch(buttonCss, /data-svelix-orientation/, '[button-only] unused Separator CSS leaked into bundle');
  assert.doesNotMatch(buttonCss, /fieldset/, '[button-only] unused RadioGroup CSS leaked into bundle');

  const labelSepCss = results.get('label-and-separator').css;
  assert.match(labelSepCss, /data-svelix-orientation/, '[label-and-separator] expected Separator CSS rules');
  assert.match(labelSepCss, /font-weight:\s*500/, '[label-and-separator] expected Label CSS rules');
  assert.doesNotMatch(labelSepCss, /data-svelix-variant/, '[label-and-separator] unused Button CSS leaked into bundle');

  // Verify partial barrel imports emit strictly smaller JS and CSS than importing all components.
  const full = results.get('all-components');
  const btnOnly = results.get('button-only');
  const labelSep = results.get('label-and-separator');
  assert.ok(
    btnOnly.jsSize.raw < full.jsSize.raw && btnOnly.cssSize.raw < full.cssSize.raw,
    'button-only bundle must be smaller than all-components in both JS and CSS'
  );
  assert.ok(
    labelSep.jsSize.raw < full.jsSize.raw && labelSep.cssSize.raw < full.cssSize.raw,
    'label-and-separator bundle must be smaller than all-components in both JS and CSS'
  );

  console.log('Production bundle & tree-shaking summary (bytes: raw / gzip / brotli):');
  for (const [name, entry] of results) {
    const j = entry.jsSize;
    const c = entry.cssSize;
    console.log(
      `  ${name.padEnd(20)} JS: ${j.raw} / ${j.gzip} / ${j.brotli} | CSS: ${c.raw} / ${c.gzip} / ${c.brotli}`
    );
  }
  console.log('Production tree-shaking and bundle verification passed.');
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
