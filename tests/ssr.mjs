// Verifies server-side rendering (svelte/server) and client hydration (svelte)
// across all six v0.1.0 Svelix component areas in real headless Chrome without
// hydration warnings, runtime errors, or DOM node replacement.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const workDir = mkdtempSync(join(tmpdir(), 'svelix-ssr-work-'));
const serverOut = join(workDir, 'server');
const clientOut = join(workDir, 'client');
const profile = mkdtempSync(join(tmpdir(), 'svelix-ssr-chrome-'));
const SOCKET_OPEN_MS = 10000;
const CDP_TIMEOUT_MS = 10000;

const mime = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8'
};

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  for (const command of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    try {
      return execFileSync('which', [command], { encoding: 'utf8' }).trim();
    } catch {
      // Try the next common binary name.
    }
  }
  throw new Error('Chrome or Chromium was not found. Set CHROME_PATH to a browser binary.');
}

function killBrowser(proc) {
  if (!proc?.pid) return;
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
      return;
    }
    try {
      process.kill(-proc.pid, 'SIGKILL');
    } catch {
      process.kill(proc.pid, 'SIGKILL');
    }
  } catch {
    // already exited
  }
}

if (!existsSync(join(root, 'dist/index.js'))) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  execFileSync(npm, ['run', 'build'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
}

let server;
let chrome;
let socket;
let messageId = 0;
const pending = new Map();

function rejectPending(error) {
  for (const entry of pending.values()) {
    clearTimeout(entry.timer);
    entry.reject(error);
  }
  pending.clear();
}

try {
  symlinkSync(join(root, 'node_modules'), join(workDir, 'node_modules'), 'dir');
  const entryDir = join(workDir, 'entries');
  mkdirSync(entryDir, { recursive: true });
  const appPath = JSON.stringify(join(root, 'tests/ssr/App.svelte'));

  const serverEntry = join(entryDir, 'entry-server.js');
  writeFileSync(
    serverEntry,
    `import { render } from 'svelte/server';\nimport App from ${appPath};\nexport function renderApp(props) { return render(App, { props }); }\n`
  );

  const clientEntry = join(entryDir, 'entry-client.js');
  writeFileSync(
    clientEntry,
    `import { hydrate } from 'svelte';\nimport App from ${appPath};\nhydrate(App, { target: document.getElementById('app'), props: { initialEmail: 'ada@example.com' } });\n`
  );

  await build({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [svelte()],
    ssr: { noExternal: true },
    build: {
      ssr: serverEntry,
      outDir: serverOut,
      emptyOutDir: true
    }
  });

  const { renderApp } = await import(pathToFileURL(join(serverOut, 'entry-server.js')).href);
  const firstRender = renderApp({ initialEmail: 'ada@example.com' });
  const secondRender = renderApp({ initialEmail: 'ada@example.com' });

  // Deterministic SSR output check, including $props.id() fallback names on unnamed RadioGroup.
  assert.equal(firstRender.body, secondRender.body, 'SSR body output must be deterministic across renders');
  assert.match(firstRender.body, /<button[^>]*id="ssr-count-btn"[^>]*data-svelix-variant="primary"/);
  assert.match(firstRender.body, /<label[^>]*id="ssr-label"[^>]*for="ssr-email"/);
  assert.match(firstRender.body, /<input[^>]*id="ssr-email"[^>]*type="email"[^>]*value="ada@example\.com"/);
  assert.match(firstRender.body, /<input[^>]*id="ssr-checkbox"[^>]*type="checkbox"/);
  assert.match(firstRender.body, /<fieldset[^>]*id="ssr-plan-group"[\s\S]*?<legend[^>]*>Billing plan<\/legend>/);
  assert.match(firstRender.body, /<hr[^>]*id="ssr-sep-dynamic"[^>]*data-svelix-orientation="vertical"[^>]*aria-orientation="vertical"/);
  assert.match(firstRender.body, /<hr[^>]*id="ssr-sep-decorative"[^>]*aria-hidden="true"/);

  const unnamedMatches = [
    ...firstRender.body.matchAll(/<input[^>]*id="ssr-unnamed-(?:light|dark)"[^>]*name="([^"]+)"/g)
  ];
  assert.equal(unnamedMatches.length, 2, 'unnamed RadioGroup must render name attributes on both radios during SSR');
  assert.ok(unnamedMatches[0][1].startsWith('svelix-radio-group-'), 'SSR fallback radio name must use svelix prefix');
  assert.equal(unnamedMatches[0][1], unnamedMatches[1][1], 'both SSR radios must share the generated name');
  const ssrGeneratedRadioName = unnamedMatches[0][1];

  // Build client hydration bundle around an index.html containing the exact SSR markup.
  const htmlTemplate = join(entryDir, 'index.html');
  writeFileSync(
    htmlTemplate,
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Svelix SSR Hydration</title>
  ${firstRender.head ?? ''}
</head>
<body>
  <div id="app">${firstRender.body}</div>
  <script>
    // Snapshot SSR DOM node references before the module hydration bundle executes.
    window.__ssrSnapshot = {
      button: document.getElementById('ssr-count-btn'),
      input: document.getElementById('ssr-email'),
      checkbox: document.getElementById('ssr-checkbox'),
      fieldset: document.getElementById('ssr-plan-group'),
      unnamedLight: document.getElementById('ssr-unnamed-light'),
      unnamedName: document.getElementById('ssr-unnamed-light')?.name ?? '',
      label: document.getElementById('ssr-label'),
      separator: document.getElementById('ssr-sep-dynamic')
    };
  </script>
  <script type="module" src="./entry-client.js"></script>
</body>
</html>`
  );

  await build({
    root: entryDir,
    configFile: false,
    logLevel: 'silent',
    plugins: [svelte()],
    resolve: {
      alias: [
        { find: /^svelix$/, replacement: join(root, 'dist/index.js') },
        { find: /^svelix\/styles\.css$/, replacement: join(root, 'dist/styles.css') }
      ]
    },
    build: {
      outDir: clientOut,
      emptyOutDir: true
    }
  });

  server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
      const requested = pathname === '/' ? '/index.html' : pathname;
      const file = normalize(join(clientOut, requested));
      if (file !== clientOut && !file.startsWith(clientOut + sep)) {
        response.writeHead(403).end();
        return;
      }
      const body = await readFile(file);
      response.writeHead(200, { 'content-type': mime[extname(file)] ?? 'application/octet-stream' });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });

  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const port = server.address().port;
  const executable = findChrome();
  let chromeLog = '';
  let chromeLaunchError;

  chrome = spawn(executable, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    ...(process.env.CI ? ['--no-sandbox', '--disable-dev-shm-usage'] : []),
    `--user-data-dir=${profile}`,
    '--remote-debugging-port=0',
    'about:blank'
  ], { detached: process.platform !== 'win32', stdio: ['ignore', 'ignore', 'pipe'] });
  chrome.stderr.on('data', (chunk) => { chromeLog += chunk; });
  chrome.on('error', (error) => { chromeLaunchError = error; });

  let debugPort = '';
  const started = Date.now();
  while (!debugPort) {
    if (chromeLaunchError) throw new Error(`Could not start Chrome (${executable}): ${chromeLaunchError.message}`);
    if (chrome.exitCode !== null) throw new Error(`Chrome exited before opening a debugging port.\n${chromeLog}`);
    if (Date.now() - started > 15000) throw new Error(`Chrome did not open a debugging port.\n${chromeLog}`);
    try {
      debugPort = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0];
    } catch {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
    }
  }

  const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
  const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
  if (!page) throw new Error('Chrome did not expose a page target');

  const diagnostics = [];
  socket = new WebSocket(page.webSocketDebuggerUrl);
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') {
      const detail = message.params?.exceptionDetails;
      diagnostics.push(detail?.exception?.description || detail?.text || 'Unhandled page exception');
      return;
    }
    if (
      message.method === 'Runtime.consoleAPICalled' &&
      (message.params?.type === 'error' || message.params?.type === 'warning')
    ) {
      const args = (message.params.args ?? []).map((arg) => arg.description ?? String(arg.value ?? '')).join(' ');
      diagnostics.push(`console.${message.params.type}: ${args}`);
      return;
    }
    if (message.id && pending.has(message.id)) {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(entry.timer);
      entry.resolve(message);
    }
  });
  socket.addEventListener('close', () => rejectPending(new Error('Chrome DevTools socket closed')));
  socket.addEventListener('error', () => rejectPending(new Error('Chrome DevTools socket error')));

  await new Promise((resolveOpen, rejectOpen) => {
    const timer = setTimeout(() => rejectOpen(new Error('DevTools open timeout')), SOCKET_OPEN_MS);
    socket.addEventListener('open', () => { clearTimeout(timer); resolveOpen(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timer); rejectOpen(new Error('DevTools open failed')); }, { once: true });
  });

  const send = (method, params = {}) => new Promise((resolveSend, rejectSend) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      rejectSend(new Error(`Socket is not open for ${method}`));
      return;
    }
    const id = ++messageId;
    const timer = setTimeout(() => {
      pending.delete(id);
      rejectSend(new Error(`${method} timed out after ${CDP_TIMEOUT_MS}ms`));
    }, CDP_TIMEOUT_MS);
    pending.set(id, {
      timer,
      resolve: (message) => {
        if (message.error) rejectSend(new Error(`${method}: ${message.error.message}`));
        else resolveSend(message.result);
      },
      reject: rejectSend
    });
    socket.send(JSON.stringify({ id, method, params }));
  });

  const evaluate = async (expression) => {
    const evaluated = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (evaluated.exceptionDetails) {
      const detail = evaluated.exceptionDetails;
      throw new Error(detail.exception?.description || detail.text || 'Evaluation failed');
    }
    return evaluated.result.value;
  };

  await send('Runtime.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/` });

  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (await evaluate(`document.body?.dataset.hydrated === 'true'`)) break;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  }
  assert.equal(await evaluate(`document.body?.dataset.hydrated`), 'true', 'SSR fixture did not hydrate');
  assert.deepEqual(diagnostics, [], 'hydration produced unexpected warnings or errors');

  // Prove DOM nodes were hydrated in place rather than destroyed and re-created,
  // and that $props.id() radio group names stayed identical across SSR -> client hydration.
  const hydrationState = await evaluate(`(() => {
    const snap = window.__ssrSnapshot;
    return {
      sameButton: document.getElementById('ssr-count-btn') === snap.button,
      sameInput: document.getElementById('ssr-email') === snap.input,
      sameCheckbox: document.getElementById('ssr-checkbox') === snap.checkbox,
      sameFieldset: document.getElementById('ssr-plan-group') === snap.fieldset,
      sameUnnamedRadio: document.getElementById('ssr-unnamed-light') === snap.unnamedLight,
      sameLabel: document.getElementById('ssr-label') === snap.label,
      sameSeparator: document.getElementById('ssr-sep-dynamic') === snap.separator,
      ssrName: snap.unnamedName,
      hydratedName: document.getElementById('ssr-unnamed-light').name,
      indeterminateApplied: document.getElementById('ssr-checkbox').indeterminate,
      buttonBg: getComputedStyle(document.getElementById('ssr-count-btn')).backgroundColor
    };
  })()`);

  assert.deepEqual(hydrationState, {
    sameButton: true,
    sameInput: true,
    sameCheckbox: true,
    sameFieldset: true,
    sameUnnamedRadio: true,
    sameLabel: true,
    sameSeparator: true,
    ssrName: ssrGeneratedRadioName,
    hydratedName: ssrGeneratedRadioName,
    indeterminateApplied: true,
    buttonBg: 'rgb(29, 78, 216)'
  });

  // Verify post-hydration interactivity, bindings, and form reset across all hydrated controls.
  await evaluate(`(() => {
    document.getElementById('ssr-count-btn').click();
    const email = document.getElementById('ssr-email');
    email.value = 'grace@example.com';
    email.dispatchEvent(new InputEvent('input', { bubbles: true }));
    document.getElementById('ssr-checkbox').click();
    document.getElementById('ssr-plan-basic').click();
    document.getElementById('ssr-unnamed-dark').click();
    document.getElementById('ssr-toggle-sep').click();
    return Promise.resolve();
  })()`);

  assert.deepEqual(await evaluate(`({
    clicks: document.getElementById('ssr-clicks-out').value,
    email: document.getElementById('ssr-email-out').value,
    accepted: document.getElementById('ssr-accepted-out').value,
    partial: document.getElementById('ssr-partial-out').value,
    plan: JSON.parse(document.getElementById('ssr-plan-out').value),
    mode: JSON.parse(document.getElementById('ssr-mode-out').value),
    sepOrientation: document.getElementById('ssr-sep-dynamic').dataset.svelixOrientation,
    sepAriaHidden: document.getElementById('ssr-sep-dynamic').getAttribute('aria-hidden')
  })`), {
    clicks: '1',
    email: 'grace@example.com',
    accepted: 'true',
    partial: 'false',
    plan: 'basic',
    mode: 'dark',
    sepOrientation: 'horizontal',
    sepAriaHidden: 'true'
  });

  await evaluate(`
    document.getElementById('ssr-form').reset();
    new Promise((resolve) => setTimeout(resolve, 0));
  `);
  assert.deepEqual(await evaluate(`({
    email: document.getElementById('ssr-email-out').value,
    accepted: document.getElementById('ssr-accepted-out').value,
    plan: JSON.parse(document.getElementById('ssr-plan-out').value),
    mode: JSON.parse(document.getElementById('ssr-mode-out').value)
  })`), {
    email: 'ada@example.com',
    accepted: 'false',
    plan: 'pro',
    mode: 'light'
  });

  assert.deepEqual(diagnostics, [], 'post-hydration interactions produced unexpected warnings or errors');
  console.log(`SSR and hydration fixture passed in ${executable}.`);
} finally {
  rejectPending(new Error('SSR fixture is shutting down'));
  server?.close();
  if (socket) socket.close();
  killBrowser(chrome);
  rmSync(profile, { recursive: true, force: true });
  rmSync(workDir, { recursive: true, force: true });
}
