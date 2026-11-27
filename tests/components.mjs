// Builds the Svelte fixture and drives it through system Chrome using the
// DevTools Protocol. This keeps component behavior tests in a real browser
// without adding a browser automation dependency.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const fixtureRoot = join(root, 'tests/components');
const output = mkdtempSync(join(tmpdir(), 'svelix-components-output-'));
const profile = mkdtempSync(join(tmpdir(), 'svelix-components-chrome-'));
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


let chromeLog = '';
const pending = new Map();
let server;
let chrome;
let socket;
let messageId = 0;


try {
  await build({
    root: fixtureRoot,
    configFile: false,
    logLevel: 'silent',
    plugins: [svelte()],
    build: { outDir: output, emptyOutDir: true }
  });

  server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
      const requested = pathname === '/' ? '/index.html' : pathname;
      const file = normalize(join(output, requested));
      if (file !== output && !file.startsWith(output + sep)) {
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
  chrome = spawn(executable, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    `--user-data-dir=${profile}`,
    '--remote-debugging-port=0',
    'about:blank'
  ], { detached: true, stdio: ['ignore', 'ignore', 'pipe'] });
  chrome.stderr.on('data', (chunk) => { chromeLog += chunk; });

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
    const evaluated = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (evaluated.exceptionDetails) throw new Error(evaluated.exceptionDetails.text || 'Page evaluation failed');
    return evaluated.result.value;
  };
  const key = async (value, code, virtualKeyCode) => {
    const event = {
      key: value,
      code,
      windowsVirtualKeyCode: virtualKeyCode,
      nativeVirtualKeyCode: virtualKeyCode
    };
    const character = value === 'Enter' ? '\r' : value === ' ' ? value : '';
    const text = character ? { text: character, unmodifiedText: character } : {};
    await send('Input.dispatchKeyEvent', { type: 'keyDown', ...event, ...text });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', ...event });
  };

  await send('Page.navigate', { url: `http://127.0.0.1:${port}/` });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (await evaluate(`document.body?.dataset.ready === 'true'`)) break;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  }
  assert.equal(await evaluate(`document.body?.dataset.ready`), 'true', 'fixture did not mount');

  const details = await evaluate(`(() => {
    const style = (id) => getComputedStyle(document.getElementById(id));
    const email = document.getElementById('email');
    const invalid = document.getElementById('invalid');
    const nativeInvalid = document.getElementById('native-invalid');
    const accepted = document.getElementById('accepted');
    const upload = document.getElementById('upload');
    return {
      buttonTag: document.getElementById('keyboard').tagName,
      inputTag: email.tagName,
      submitType: document.getElementById('submit').type,
      noSubmitType: document.getElementById('no-submit').type,
      disabledInput: document.getElementById('disabled-input').disabled,
      variants: ['keyboard', 'secondary', 'outline', 'ghost'].map((id) =>
        document.getElementById(id).dataset.svelixVariant
      ),
      formData: Object.fromEntries(
        [...new FormData(
          document.getElementById('native-form'),
          document.getElementById('submit')
        )].filter(([name]) => name !== 'upload')
      ),
      email: {
        type: email.type,
        name: email.name,
        autocomplete: email.autocomplete,
        required: email.required,
        label: email.labels[0].textContent
      },
      invalid: {
        ariaInvalid: invalid.getAttribute('aria-invalid'),
        describedBy: invalid.getAttribute('aria-describedby'),
        nativeConstraint: nativeInvalid.validity.patternMismatch
      },
      specialTypes: {
        checkboxType: accepted.type,
        checkboxValue: accepted.value,
        checkboxChecked: accepted.checked,
        radioS: document.getElementById('size-s').checked,
        radioM: document.getElementById('size-m').checked,
        fileType: upload.type,
        fileValue: upload.value
      },
      styles: {
        primary: style('keyboard').backgroundColor,
        secondary: style('secondary').backgroundColor,
        outlineBorder: style('outline').borderColor,
        ghost: style('ghost').backgroundColor,
        disabled: style('disabled').backgroundColor,
        disabledInput: style('disabled-input').backgroundColor,
        customButton: style('custom-button').backgroundColor,
        invalidBorder: style('invalid').borderColor,
        readonly: style('readonly').backgroundColor,
        customInputBorder: style('custom-input').borderColor,
        buttonMinBlockSize: style('keyboard').minBlockSize,
        inputMinBlockSize: style('email').minBlockSize,
        plainButtonMinBlockSize: style('plain-button').minBlockSize,
        plainInputMinBlockSize: style('plain-input').minBlockSize,
        checkboxAccent: style('accepted').accentColor,
        radioAccent: style('size-m').accentColor,
        darkPrimary: style('dark-primary').backgroundColor,
        darkEmailBg: style('dark-email').backgroundColor,
        darkEmailFg: style('dark-email').color,
        darkCheckboxAccent: style('dark-checkbox').accentColor
      },
      bound: {
        input: document.getElementById('bound').value,
        output: document.getElementById('bound-value').value
      }
    };
  })()`);

  assert.equal(details.buttonTag, 'BUTTON');
  assert.equal(details.inputTag, 'INPUT');
  assert.equal(details.submitType, 'submit');
  assert.equal(details.noSubmitType, 'button');
  assert.equal(details.disabledInput, true);
  assert.deepEqual(details.variants, ['primary', 'secondary', 'outline', 'ghost']);
  assert.deepEqual(details.formData, {
    email: 'person@example.com',
    bound: 'initial',
    size: 'm',
    intent: 'save'
  });
  assert.deepEqual(details.email, {
    type: 'email',
    name: 'email',
    autocomplete: 'email',
    required: true,
    label: 'Email address'
  });
  assert.deepEqual(details.invalid, {
    ariaInvalid: 'true',
    describedBy: 'invalid-error',
    nativeConstraint: true
  });
  assert.deepEqual(details.specialTypes, {
    checkboxType: 'checkbox',
    checkboxValue: 'yes',
    checkboxChecked: false,
    radioS: false,
    radioM: true,
    fileType: 'file',
    fileValue: ''
  });
  assert.equal(details.styles.primary, 'rgb(29, 78, 216)');
  assert.equal(details.styles.secondary, 'rgb(226, 232, 240)');
  assert.equal(details.styles.outlineBorder, 'rgb(100, 116, 139)');
  assert.equal(details.styles.ghost, 'rgba(0, 0, 0, 0)');
  assert.equal(details.styles.disabled, 'rgb(241, 245, 249)');
  assert.equal(details.styles.disabledInput, 'rgb(241, 245, 249)');
  assert.equal(details.styles.customButton, 'rgb(4, 120, 87)');
  assert.equal(details.styles.invalidBorder, 'rgb(185, 28, 28)');
  assert.equal(details.styles.readonly, 'rgb(241, 245, 249)');
  assert.equal(details.styles.customInputBorder, 'rgb(124, 58, 237)');
  assert.equal(details.styles.buttonMinBlockSize, '48px');
  assert.equal(details.styles.inputMinBlockSize, '48px');
  assert.notEqual(details.styles.plainButtonMinBlockSize, '48px');
  assert.notEqual(details.styles.plainInputMinBlockSize, '48px');
  assert.equal(details.styles.checkboxAccent, 'rgb(29, 78, 216)');
  assert.equal(details.styles.radioAccent, 'rgb(29, 78, 216)');
  assert.equal(details.styles.darkPrimary, 'rgb(147, 197, 253)');
  assert.equal(details.styles.darkEmailBg, 'rgb(15, 23, 42)');
  assert.equal(details.styles.darkEmailFg, 'rgb(248, 250, 252)');
  assert.equal(details.styles.darkCheckboxAccent, 'rgb(147, 197, 253)');
  assert.deepEqual(details.bound, { input: 'initial', output: 'initial' });

  await evaluate(`(() => {
    const nativeInvalid = document.getElementById('native-invalid');
    nativeInvalid.focus();
    nativeInvalid.setSelectionRange(nativeInvalid.value.length, nativeInvalid.value.length);
  })()`);
  await key('Backspace', 'Backspace', 8);
  await key('Tab', 'Tab', 9);
  const nativeInvalidPresentation = await evaluate(`(() => {
    const input = document.getElementById('native-invalid');
    return {
      userInvalid: input.matches(':user-invalid'),
      borderColor: getComputedStyle(input).borderColor
    };
  })()`);
  assert.deepEqual(nativeInvalidPresentation, {
    userInvalid: true,
    borderColor: 'rgb(185, 28, 28)'
  });

  await evaluate(`document.getElementById('tab-start').focus()`);
  await key('Tab', 'Tab', 9);
  assert.equal(await evaluate(`document.activeElement.id`), 'keyboard');
  assert.equal(await evaluate(`getComputedStyle(document.activeElement).outlineStyle`), 'solid');

  await key('Enter', 'Enter', 13);
  assert.equal(await evaluate(`document.getElementById('keyboard-count').value`), '1');
  await key(' ', 'Space', 32);
  assert.equal(await evaluate(`document.getElementById('keyboard-count').value`), '2');

  await key('Tab', 'Tab', 9);
  assert.equal(await evaluate(`document.activeElement.id`), 'tab-input', 'disabled button must be skipped');
  assert.equal(await evaluate(`getComputedStyle(document.activeElement).outlineStyle`), 'solid');

  await evaluate(`document.getElementById('disabled').click()`);
  assert.equal(await evaluate(`document.getElementById('disabled-count').value`), '0');
  assert.equal(await evaluate(`
    document.getElementById('disabled').focus();
    document.activeElement.id;
  `), 'tab-input');
  assert.equal(await evaluate(`
    document.getElementById('disabled-input').focus();
    document.activeElement.id;
  `), 'tab-input');

  await evaluate(`document.getElementById('no-submit').click()`);
  assert.equal(await evaluate(`document.getElementById('submission-count').value`), '0');
  await evaluate(`document.getElementById('submit').click()`);
  assert.equal(await evaluate(`document.getElementById('submission-count').value`), '1');
  assert.equal(await evaluate(`document.getElementById('last-submitter').value`), 'submit');

  await evaluate(`
    const input = document.getElementById('bound');
    input.value = 'changed';
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'changed' }));
    Promise.resolve();
  `);
  assert.equal(await evaluate(`document.getElementById('bound-value').value`), 'changed');
  await evaluate(`document.getElementById('reset').click(); new Promise(requestAnimationFrame)`);
  assert.deepEqual(await evaluate(`({
    input: document.getElementById('bound').value,
    output: document.getElementById('bound-value').value
  })`), { input: 'initial', output: 'initial' });

  await evaluate(`
    const checkbox = document.getElementById('accepted');
    checkbox.click();
    Promise.resolve();
  `);
  assert.deepEqual(await evaluate(`({
    checked: document.getElementById('accepted').checked,
    output: document.getElementById('accepted-value').value
  })`), { checked: true, output: 'true' });

  await evaluate(`
    document.getElementById('size-s').click();
    Promise.resolve();
  `);
  assert.deepEqual(await evaluate(`({
    s: document.getElementById('size-s').checked,
    m: document.getElementById('size-m').checked,
    output: document.getElementById('size-value').value
  })`), { s: true, m: false, output: 's' });

  assert.equal(await evaluate(`document.getElementById('upload').value`), '');
  assert.equal(await evaluate(`document.getElementById('upload-count').value`), '0');
  assert.equal(
    await evaluate(`{
      const input = document.getElementById('upload');
      try {
        input.value = 'C:\\\\fake\\\\path.txt';
        'assigned';
      } catch (error) {
        error.name;
      }
    }`),
    'InvalidStateError',
    'non-empty file values must remain unsettable'
  );
  assert.equal(await evaluate(`document.getElementById('upload').value`), '');

  assert.equal(await evaluate(`document.getElementById('dynamic').type`), 'text');
  await evaluate(`document.getElementById('toggle-dynamic-type').click(); Promise.resolve()`);
  assert.deepEqual(await evaluate(`({
    type: document.getElementById('dynamic').type,
    mode: document.getElementById('dynamic-type').value,
    checked: document.getElementById('dynamic').checked
  })`), { type: 'checkbox', mode: 'checkbox', checked: false });
  await evaluate(`document.getElementById('dynamic').click(); Promise.resolve()`);
  assert.equal(await evaluate(`document.getElementById('dynamic').checked`), true);

  console.log(`Component fixture passed in ${executable}.`);
} finally {
  server?.close();
  if (socket) socket.close();
  if (chrome?.pid) {
    try { process.kill(-chrome.pid, 'SIGKILL'); } catch { /* already exited */ }
  }
  rmSync(profile, { recursive: true, force: true });
  rmSync(output, { recursive: true, force: true });
}
