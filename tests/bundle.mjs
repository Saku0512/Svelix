// Verifies production tree-shaking, CSS side-effect retention, dist freshness
// enforcement, and emitted JS/CSS bundle sizes by packing the actual svelix
// distribution tarball into an isolated consumer and inspecting Vite/Rolldown
// production chunk module graphs and emitted CSS rules across all seven exports.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { build } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { ensureFreshDist, isDistFresh } from './ensure-fresh-dist.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

ensureFreshDist(root);

const workDir = mkdtempSync(join(tmpdir(), 'svelix-bundle-'));

// Every shipped runtime module in dist/ corresponding to the 7 public exports
// plus the internal RadioGroup context module.
const ALL_JS_MODULES = [
  'Button.svelte',
  'Checkbox.svelte',
  'Input.svelte',
  'Label.svelte',
  'Radio.svelte',
  'RadioGroup.svelte',
  'Separator.svelte',
  'radio-group-context.js'
];

// Every component style virtual module emitted by vite-plugin-svelte.
const ALL_STYLE_MODULES = [
  'Button.svelte',
  'Checkbox.svelte',
  'Input.svelte',
  'Label.svelte',
  'Radio.svelte',
  'RadioGroup.svelte',
  'Separator.svelte'
];

// Component-specific CSS patterns in the emitted stylesheet so CSS elimination
// is verified from the actual output bytes in addition to module metadata.
const COMPONENT_CSS_PATTERNS = {
  'Button.svelte': /:where\(button\[data-svelix-variant/,
  'Checkbox.svelte': /:where\(input\[type=['"]?checkbox['"]?\][^\)]*\)\{[^}]*inline-size:\s*1\.25em/,
  'Input.svelte': /::placeholder/,
  'Label.svelte': /:where\(label[^\)]*\)\{[^}]*font-weight:\s*500/,
  'Radio.svelte': /:where\(input\[type=['"]?radio['"]?\][^\)]*\)\{[^}]*inline-size:\s*1\.25em/,
  'RadioGroup.svelte': /:where\(fieldset/,
  'Separator.svelte': /data-svelix-orientation/
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

function analyzeSvelixModules(buildResult) {
  const outputs = Array.isArray(buildResult) ? buildResult : [buildResult];
  const retainedJs = new Set();
  const retainedStyles = new Set();

  for (const item of outputs) {
    for (const chunk of item.output ?? []) {
      if (chunk.type !== 'chunk' || !chunk.modules) continue;
      for (const [rawId, info] of Object.entries(chunk.modules)) {
        const normalized = rawId.replaceAll('\\', '/');
        const distIdx = normalized.lastIndexOf('/dist/');
        if (distIdx === -1) continue;
        const rel = normalized.slice(distIdx + '/dist/'.length);
        if (rel.includes('?svelte&type=style')) {
          const base = rel.split('?')[0];
          retainedStyles.add(base);
        } else if ((info?.renderedLength ?? 0) > 0) {
          retainedJs.add(rel);
        }
      }
    }
  }

  return { retainedJs, retainedStyles };
}

try {
  // 1. Verify stale-dist rejection and deduplicated rebuilds in an isolated workspace copy.
  const staleCheckDir = join(workDir, 'stale-check');
  mkdirSync(staleCheckDir, { recursive: true });
  for (const file of ['package.json', 'tsconfig.json']) {
    cpSync(join(root, file), join(staleCheckDir, file));
  }
  cpSync(join(root, 'src'), join(staleCheckDir, 'src'), { recursive: true });
  cpSync(join(root, 'dist'), join(staleCheckDir, 'dist'), { recursive: true });
  const stampFile = join(staleCheckDir, 'stamp.json');
  let buildCount = 0;
  const isolatedBuilder = (targetRoot) => {
    buildCount += 1;
    execFileSync(
      process.execPath,
      [join(root, 'node_modules/@sveltejs/package/src/cli.js')],
      { cwd: targetRoot, stdio: 'pipe' }
    );
  };

  assert.equal(isDistFresh(staleCheckDir, stampFile), false, 'unverified dist without stamp must be treated as stale');
  assert.equal(ensureFreshDist(staleCheckDir, { stampFile, buildRunner: isolatedBuilder }).rebuilt, true);
  assert.equal(buildCount, 1);
  assert.equal(isDistFresh(staleCheckDir, stampFile), true);
  assert.equal(
    ensureFreshDist(staleCheckDir, { stampFile, buildRunner: isolatedBuilder }).rebuilt,
    false,
    'unchanged source and dist must skip redundant rebuilds'
  );
  assert.equal(buildCount, 1);

  // Mutate a source component and prove the earlier dist is immediately flagged stale and rebuilt.
  const isolatedLabelPath = join(staleCheckDir, 'src/lib/Label.svelte');
  writeFileSync(
    isolatedLabelPath,
    readFileSync(isolatedLabelPath, 'utf8').replace('<label {...rest}>', '<label data-stale-probe="fresh" {...rest}>')
  );
  assert.equal(isDistFresh(staleCheckDir, stampFile), false, 'modified source must invalidate earlier dist');
  assert.equal(ensureFreshDist(staleCheckDir, { stampFile, buildRunner: isolatedBuilder }).rebuilt, true);
  assert.equal(buildCount, 2);
  assert.match(
    readFileSync(join(staleCheckDir, 'dist/Label.svelte'), 'utf8'),
    /data-stale-probe="fresh"/,
    'rebuilt dist must contain the updated component source'
  );

  // 2. Pack the real build output and unpack it into an isolated consumer's node_modules/svelix
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
      expectedJs: [],
      expectedStyles: []
    },
    {
      name: 'button-only',
      app: `<script>\n  import { Button } from 'svelix';\n  import 'svelix/styles.css';\n</script>\n<Button>Save</Button>\n`,
      expectedJs: ['Button.svelte'],
      expectedStyles: ['Button.svelte']
    },
    {
      name: 'label-and-separator',
      app: `<script>\n  import { Label, Separator } from 'svelix';\n  import 'svelix/styles.css';\n</script>\n<Label for="x">Name</Label><input id="x" /><Separator />\n`,
      expectedJs: ['Label.svelte', 'Separator.svelte'],
      expectedStyles: ['Label.svelte', 'Separator.svelte']
    },
    {
      name: 'radio-group-only',
      app: `<script>\n  import { Radio, RadioGroup } from 'svelix';\n  import 'svelix/styles.css';\n  let plan = $state('pro');\n</script>\n<RadioGroup legend="Plan" name="plan" bind:value={plan}><Radio value="pro" /></RadioGroup>\n`,
      expectedJs: ['Radio.svelte', 'RadioGroup.svelte', 'radio-group-context.js'],
      expectedStyles: ['Radio.svelte', 'RadioGroup.svelte']
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
      expectedJs: ALL_JS_MODULES,
      expectedStyles: ALL_STYLE_MODULES
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

    const buildOutput = await build({
      root: scenarioDir,
      configFile: false,
      logLevel: 'silent',
      plugins: [svelte()],
      build: { outDir, emptyOutDir: true }
    });

    const { retainedJs, retainedStyles } = analyzeSvelixModules(buildOutput);
    const { js, css } = collectAssets(join(outDir, 'assets'));

    // Shared CSS tokens must always survive via package.json sideEffects: ["**/*.css"].
    assert.match(css, /--svelix-primary:/, `[${scenario.name}] shared token stylesheet was unexpectedly tree-shaken`);
    assert.doesNotMatch(css, /(^|\})\s*body\s*\{/, `[${scenario.name}] CSS must not emit global body resets`);

    // Verify exact JS module inclusion/elimination across all 7 exports + context helper.
    const expectedJsSet = new Set(scenario.expectedJs);
    for (const mod of ALL_JS_MODULES) {
      if (expectedJsSet.has(mod)) {
        assert.ok(
          retainedJs.has(mod),
          `[${scenario.name}] expected production chunk to retain ${mod} with renderedLength > 0 (got: ${[...retainedJs].join(', ')})`
        );
      } else {
        assert.ok(
          !retainedJs.has(mod),
          `[${scenario.name}] unused module ${mod} was NOT eliminated from production JS (got: ${[...retainedJs].join(', ')})`
        );
      }
    }

    // Verify exact CSS module inclusion/elimination AND emitted CSS rules across all 7 components.
    const expectedStyleSet = new Set(scenario.expectedStyles);
    for (const comp of ALL_STYLE_MODULES) {
      const pattern = COMPONENT_CSS_PATTERNS[comp];
      if (expectedStyleSet.has(comp)) {
        assert.ok(
          retainedStyles.has(comp),
          `[${scenario.name}] expected style module for ${comp} to be included`
        );
        assert.match(css, pattern, `[${scenario.name}] expected emitted CSS to contain ${comp} rules`);
      } else {
        assert.ok(
          !retainedStyles.has(comp),
          `[${scenario.name}] unused style module for ${comp} was NOT eliminated`
        );
        assert.doesNotMatch(
          css,
          pattern,
          `[${scenario.name}] unused ${comp} CSS rules leaked into emitted stylesheet`
        );
      }
    }

    results.set(scenario.name, {
      jsSize: measureBytes(js),
      cssSize: measureBytes(css)
    });
  }

  // Verify partial barrel imports emit strictly smaller JS and CSS than importing all components.
  const full = results.get('all-components');
  for (const partialName of ['styles-only', 'button-only', 'label-and-separator', 'radio-group-only']) {
    const partial = results.get(partialName);
    assert.ok(
      partial.jsSize.raw < full.jsSize.raw && partial.cssSize.raw < full.cssSize.raw,
      `${partialName} bundle must be smaller than all-components in both JS and CSS`
    );
  }

  console.log('Production bundle & tree-shaking summary (bytes: raw / gzip / brotli):');
  for (const [name, entry] of results) {
    const j = entry.jsSize;
    const c = entry.cssSize;
    console.log(
      `  ${name.padEnd(20)} JS: ${j.raw} / ${j.gzip} / ${j.brotli} | CSS: ${c.raw} / ${c.gzip} / ${c.brotli}`
    );
  }
  console.log('Production tree-shaking, CSS elimination, and stale-dist checks passed.');
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
