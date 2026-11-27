// Drives tests/theme.html through the system Chrome DevTools Protocol.
// Node's WebSocket client and a local Chrome or Chromium binary are enough,
// so the theme check does not add Playwright or another browser package.
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const screenshotDir = process.env.THEME_SCREENSHOT_DIR;
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8' };

const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://127.0.0.1').pathname);
    const file = normalize(join(root, pathname));
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': mime[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});

await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
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

const port = server.address().port;
const profile = mkdtempSync(join(tmpdir(), 'svelix-theme-'));
const executable = findChrome();
const chrome = spawn(executable, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  ...(process.env.CI ? ['--no-sandbox', '--disable-dev-shm-usage'] : []),
  `--user-data-dir=${profile}`,
  '--remote-debugging-port=0',
  'about:blank'
], { detached: true, stdio: ['ignore', 'ignore', 'pipe'] });

let chromeLog = '';
chrome.stderr.on('data', (chunk) => { chromeLog += chunk; });
chrome.on('error', (error) => {
  console.error(`Could not start Chrome (${executable}): ${error.message}`);
  server.close();
  rmSync(profile, { recursive: true, force: true });
  process.exit(1);
});

const pending = new Map();
let socket;
let messageId = 0;

function stop(code) {
  server.close();
  try { process.kill(-chrome.pid, 'SIGKILL'); } catch { /* already exited */ }
  rmSync(profile, { recursive: true, force: true });
  process.exit(code);
}

try {
  let debugPort = '';
  const started = Date.now();
  while (!debugPort) {
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
  socket = new WebSocket(page.webSocketDebuggerUrl);
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  });
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener('open', resolveOpen);
    socket.addEventListener('error', () => rejectOpen(new Error('Chrome DevTools connection failed')));
  });

  const send = (method, params = {}) => new Promise((resolveSend, rejectSend) => {
    const id = ++messageId;
    pending.set(id, (message) => {
      if (message.error) rejectSend(new Error(`${method}: ${message.error.message}`));
      else resolveSend(message.result);
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const evaluated = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (evaluated.exceptionDetails) throw new Error(evaluated.exceptionDetails.text || 'Page evaluation failed');
    return evaluated.result.value;
  };
  const version = await send('Browser.getVersion');
  console.log(`browser: ${version.product}`);

  async function tab() {
    const event = { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 };
    await send('Input.dispatchKeyEvent', { type: 'keyDown', ...event });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', ...event });
  }

  async function runPass({ scheme, reduced, screenshots }) {
    await send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 820, deviceScaleFactor: 1, mobile: false });
    await send('Emulation.setEmulatedMedia', {
      features: [
        { name: 'prefers-color-scheme', value: scheme },
        { name: 'prefers-reduced-motion', value: reduced }
      ]
    });
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/tests/theme.html` });
    let status = '';
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      try {
        status = await evaluate(`document.body && document.body.dataset.result || ''`);
      } catch {
        status = '';
      }
      if (status === 'awaiting-focus' || status === 'fail' || status === 'pass') break;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
    }
    const text = await evaluate(`document.getElementById('result').textContent`);
    if (status === 'fail') throw new Error(text);
    if (status !== 'awaiting-focus') throw new Error(`Fixture did not reach keyboard focus checks: ${text || status}`);
    const meta = await evaluate(`({ scheme: window.__scheme, reduced: window.__reduced })`);
    if (meta.scheme !== scheme) throw new Error(`prefers-color-scheme: expected ${scheme}, got ${meta.scheme}`);
    if (meta.reduced !== (reduced === 'reduce')) throw new Error(`prefers-reduced-motion was ${meta.reduced}, expected ${reduced}`);

    await evaluate(`document.getElementById('light').focus(); document.getElementById('light').focus({ focusVisible: true });`);
    const programmatic = await evaluate(`({ visible: document.getElementById('light').matches(':focus-visible'), outline: getComputedStyle(document.getElementById('light')).outlineStyle, result: document.body.dataset.result })`);
    if (programmatic.result !== 'awaiting-focus') throw new Error('Programmatic focus completed the fixture without keyboard input');
    await evaluate(`
      const start = document.createElement('span');
      start.tabIndex = -1;
      document.body.prepend(start);
      start.focus();
    `);

    for (let step = 0; step < 40 && status === 'awaiting-focus'; step += 1) {
      await tab();
      status = await evaluate(`window.__checkFocus()`);
    }
    const outcome = await evaluate(`({ result: document.body.dataset.result, text: document.getElementById('result').textContent, focused: window.__focused })`);
    if (outcome.result !== 'pass') throw new Error(outcome.text || 'Keyboard focus checks did not pass');
    for (const id of ['light', 'field', 'dark-button']) {
      if (!outcome.focused.includes(id)) throw new Error(`Keyboard focus did not reach #${id}`);
    }
    console.log(`PASS scheme=${scheme} reduced-motion=${reduced} programmatic-focus-visible=${programmatic.visible} programmatic-outline=${programmatic.outline} keyboard=${outcome.focused.join(',')}`);

    if (screenshots) {
      mkdirSync(screenshotDir, { recursive: true });
      await evaluate(`document.activeElement && document.activeElement.blur()`);
      const lightShot = await send('Page.captureScreenshot', { format: 'png' });
      const lightPath = join(screenshotDir, 'theme-light.png');
      writeFileSync(lightPath, Buffer.from(lightShot.data, 'base64'));
      await evaluate(`document.documentElement.dataset.svelixTheme = 'dark'`);
      const darkShot = await send('Page.captureScreenshot', { format: 'png' });
      const darkPath = join(screenshotDir, 'theme-dark.png');
      writeFileSync(darkPath, Buffer.from(darkShot.data, 'base64'));
      console.log(`screenshots: ${lightPath} ${darkPath}`);
    }
  }

  await runPass({ scheme: 'light', reduced: 'no-preference', screenshots: Boolean(screenshotDir) });
  await runPass({ scheme: 'dark', reduced: 'no-preference', screenshots: false });
  await runPass({ scheme: 'light', reduced: 'reduce', screenshots: false });
  console.log('Theme fixture passed.');
  stop(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  stop(1);
}
