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

let chromeLog = '';
const pending = new Map();
let server;
let chrome;
let socket;
let messageId = 0;

function rejectPending(error) {
  for (const entry of pending.values()) {
    clearTimeout(entry.timer);
    entry.reject(error);
  }
  pending.clear();
}

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
  ], { detached: process.platform !== 'win32', stdio: ['ignore', 'ignore', 'pipe'] });
  chrome.stderr.on('data', (chunk) => { chromeLog += chunk; });
  let chromeLaunchError;
  chrome.on('error', (error) => {
    chromeLaunchError = error;
  });

  let debugPort = '';
  const started = Date.now();
  while (!debugPort) {
    if (chromeLaunchError) {
      throw new Error(`Could not start Chrome (${executable}): ${chromeLaunchError.message}`);
    }
    if (chrome.exitCode !== null) {
      throw new Error(`Chrome exited before opening a debugging port.\n${chromeLog}`);
    }
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
      const entry = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(entry.timer);
      entry.resolve(message);
    }
  });
  socket.addEventListener('close', () => {
    rejectPending(new Error('Chrome DevTools socket closed'));
  });
  socket.addEventListener('error', () => {
    rejectPending(new Error('Chrome DevTools socket error'));
  });
  await new Promise((resolveOpen, rejectOpen) => {
    const timer = setTimeout(() => {
      rejectOpen(new Error(`Chrome DevTools connection timed out after ${SOCKET_OPEN_MS}ms`));
    }, SOCKET_OPEN_MS);
    socket.addEventListener('open', () => {
      clearTimeout(timer);
      resolveOpen();
    }, { once: true });
    socket.addEventListener('error', () => {
      clearTimeout(timer);
      rejectOpen(new Error('Chrome DevTools connection failed'));
    }, { once: true });
  });

  const send = (method, params = {}) => new Promise((resolveSend, rejectSend) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      rejectSend(new Error(`Chrome DevTools socket is not open for ${method}`));
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
      const description = detail.exception?.description || detail.text || 'Page evaluation failed';
      throw new Error(description);
    }
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
  const mouseClick = async (id) => {
    const box = await evaluate(`(() => {
      const element = document.getElementById(${JSON.stringify(id)});
      element.scrollIntoView({ block: 'center', inline: 'center' });
      const rect = element.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, id: element.id };
    })()`);
    await send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: box.x,
      y: box.y,
      button: 'left',
      buttons: 1,
      clickCount: 1
    });
    await send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: box.x,
      y: box.y,
      button: 'left',
      buttons: 0,
      clickCount: 1
    });
    // Wait for native reset default action and Input's macrotask group sync.
    await evaluate(`new Promise((resolve) => setTimeout(resolve, 0))`);
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
        plainRadioA: document.getElementById('plain-radio-a').checked,
        plainRadioB: document.getElementById('plain-radio-b').checked,
        mixedCaseType: document.getElementById('mixed-case-checkbox').type,
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
    plain: 'b',
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
    plainRadioA: false,
    plainRadioB: true,
    mixedCaseType: 'checkbox',
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
  await evaluate(`document.getElementById('form-reset').click(); new Promise(requestAnimationFrame)`);
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

  await evaluate(`
    document.getElementById('plain-radio-a').click();
    Promise.resolve();
  `);
  assert.deepEqual(await evaluate(`({
    a: document.getElementById('plain-radio-a').checked,
    b: document.getElementById('plain-radio-b').checked,
    form: Object.fromEntries(
      [...new FormData(document.getElementById('native-form'))].filter(([name]) => name === 'plain')
    )
  })`), { a: true, b: false, form: { plain: 'a' } });
  await mouseClick('form-reset');
  assert.deepEqual(await evaluate(`({
    a: document.getElementById('plain-radio-a').checked,
    b: document.getElementById('plain-radio-b').checked,
    size: document.getElementById('size-value').value,
    sizeS: document.getElementById('size-s').checked,
    sizeM: document.getElementById('size-m').checked,
    form: Object.fromEntries(
      [...new FormData(document.getElementById('native-form'))].filter(([name]) =>
        name === 'plain' || name === 'size'
      )
    )
  })`), {
    a: false,
    b: true,
    // Unbound radios restore native checked defaults; bind:group reset clears to null.
    size: '',
    sizeS: false,
    sizeM: false,
    form: { plain: 'b' }
  });

  // The earlier form reset restores rice via defaultChecked and syncs bind:group.
  assert.deepEqual(await evaluate(`({
    rice: document.getElementById('topping-rice').checked,
    beans: document.getElementById('topping-beans').checked,
    riceDefault: document.getElementById('topping-rice').defaultChecked,
    beansDefault: document.getElementById('topping-beans').defaultChecked,
    output: document.getElementById('toppings-value').value
  })`), {
    rice: true,
    beans: false,
    riceDefault: true,
    beansDefault: false,
    output: 'rice'
  });

  await evaluate(`
    document.getElementById('topping-beans').click();
    Promise.resolve();
  `);
  assert.deepEqual(await evaluate(`({
    rice: document.getElementById('topping-rice').checked,
    beans: document.getElementById('topping-beans').checked,
    output: document.getElementById('toppings-value').value,
    changes: document.getElementById('topping-changes').value,
    riceDefault: document.getElementById('topping-rice').defaultChecked,
    beansDefault: document.getElementById('topping-beans').defaultChecked
  })`), {
    rice: true,
    beans: true,
    output: 'rice,beans',
    changes: '1',
    riceDefault: true,
    beansDefault: false
  });
  await evaluate(`
    document.getElementById('topping-rice').click();
    Promise.resolve();
  `);
  assert.deepEqual(await evaluate(`({
    rice: document.getElementById('topping-rice').checked,
    beans: document.getElementById('topping-beans').checked,
    output: document.getElementById('toppings-value').value,
    changes: document.getElementById('topping-changes').value
  })`), {
    rice: false,
    beans: true,
    output: 'beans',
    changes: '2'
  });

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
  await evaluate(`(() => {
    const upload = document.getElementById('upload');
    const transfer = new DataTransfer();
    transfer.items.add(new File(['hello'], 'hello.txt', { type: 'text/plain' }));
    upload.files = transfer.files;
    upload.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  assert.deepEqual(await evaluate(`({
    count: document.getElementById('upload-count').value,
    name: document.getElementById('upload-name').value,
    files: document.getElementById('upload').files.length
  })`), { count: '1', name: 'hello.txt', files: 1 });
  await mouseClick('form-reset');
  assert.deepEqual(await evaluate(`({
    count: document.getElementById('upload-count').value,
    name: document.getElementById('upload-name').value,
    files: document.getElementById('upload').files.length,
    value: document.getElementById('upload').value,
    accepted: document.getElementById('accepted').checked,
    acceptedOutput: document.getElementById('accepted-value').value,
    rice: document.getElementById('topping-rice').checked,
    beans: document.getElementById('topping-beans').checked,
    riceDefault: document.getElementById('topping-rice').defaultChecked,
    beansDefault: document.getElementById('topping-beans').defaultChecked,
    toppings: document.getElementById('toppings-value').value,
    form: Object.fromEntries(
      [...new FormData(document.getElementById('native-form'))].filter(([name]) =>
        name === 'topping' || name === 'accepted'
      )
    )
  })`), {
    count: '0',
    name: '',
    files: 0,
    value: '',
    accepted: false,
    acceptedOutput: 'false',
    rice: true,
    beans: false,
    riceDefault: true,
    beansDefault: false,
    toppings: 'rice',
    form: { topping: 'rice' }
  });

  // Trusted keyboard activation of reset must also resync group after native defaults.
  await evaluate(`
    document.getElementById('topping-beans').click();
    Promise.resolve();
  `);
  assert.equal(await evaluate(`document.getElementById('toppings-value').value`), 'rice,beans');
  await evaluate(`document.getElementById('form-reset').focus()`);
  await key('Enter', 'Enter', 13);
  await evaluate(`new Promise((resolve) => setTimeout(resolve, 0))`);
  assert.deepEqual(await evaluate(`({
    rice: document.getElementById('topping-rice').checked,
    beans: document.getElementById('topping-beans').checked,
    toppings: document.getElementById('toppings-value').value,
    form: Object.fromEntries(
      [...new FormData(document.getElementById('native-form'))].filter(([name]) => name === 'topping')
    )
  })`), {
    rice: true,
    beans: false,
    toppings: 'rice',
    form: { topping: 'rice' }
  });

  // Moving form ownership must listen to the new owner, not the mount-time form.
  assert.deepEqual(await evaluate(`({
    formAttr: document.getElementById('moveable-topping').getAttribute('form'),
    formId: document.getElementById('moveable-form').value,
    checked: document.getElementById('moveable-topping').checked,
    group: document.getElementById('moveable-group').value
  })`), {
    formAttr: 'form-a',
    formId: 'form-a',
    checked: true,
    group: 'x'
  });
  await evaluate(`
    document.getElementById('moveable-topping').click();
    Promise.resolve();
  `);
  assert.deepEqual(await evaluate(`({
    checked: document.getElementById('moveable-topping').checked,
    group: document.getElementById('moveable-group').value
  })`), { checked: false, group: '' });
  await evaluate(`
    document.getElementById('reassign-form').click();
    Promise.resolve();
  `);
  assert.equal(await evaluate(`document.getElementById('moveable-form').value`), 'form-b');
  assert.equal(await evaluate(`document.getElementById('moveable-topping').getAttribute('form')`), 'form-b');
  await mouseClick('reset-form-a');
  assert.deepEqual(await evaluate(`({
    checked: document.getElementById('moveable-topping').checked,
    group: document.getElementById('moveable-group').value
  })`), {
    checked: false,
    group: ''
  }, 'resetting the previous form owner must not affect the reassigned control');
  await mouseClick('reset-form-b');
  assert.deepEqual(await evaluate(`({
    checked: document.getElementById('moveable-topping').checked,
    group: document.getElementById('moveable-group').value,
    form: Object.fromEntries(
      [...new FormData(document.getElementById('form-b'))].filter(([name]) => name === 'moveable')
    )
  })`), {
    checked: true,
    group: 'x',
    form: { moveable: 'x' }
  });

  // Programmatic reset followed immediately by a new selection must keep the selection.
  await evaluate(`
    document.getElementById('topping-beans').click();
    Promise.resolve();
  `);
  assert.equal(await evaluate(`document.getElementById('toppings-value').value`), 'rice,beans');
  await evaluate(`
    document.getElementById('reset-then-select').click();
    new Promise((resolve) => setTimeout(resolve, 0));
  `);
  assert.deepEqual(await evaluate(`({
    rice: document.getElementById('topping-rice').checked,
    beans: document.getElementById('topping-beans').checked,
    toppings: document.getElementById('toppings-value').value
  })`), {
    rice: false,
    beans: true,
    toppings: 'beans'
  });

  // Synthetic reset events must not rewrite the group model.
  await evaluate(`
    document.getElementById('synthetic-reset').click();
    new Promise((resolve) => setTimeout(resolve, 0));
  `);
  assert.deepEqual(await evaluate(`({
    rice: document.getElementById('topping-rice').checked,
    beans: document.getElementById('topping-beans').checked,
    toppings: document.getElementById('toppings-value').value
  })`), {
    rice: false,
    beans: true,
    toppings: 'beans'
  });

  // Canceled native reset must leave the model alone.
  await evaluate(`
    document.getElementById('canceled-reset').click();
    new Promise((resolve) => setTimeout(resolve, 0));
  `);
  assert.deepEqual(await evaluate(`({
    rice: document.getElementById('topping-rice').checked,
    beans: document.getElementById('topping-beans').checked,
    toppings: document.getElementById('toppings-value').value
  })`), {
    rice: false,
    beans: true,
    toppings: 'beans'
  });

  // A real programmatic form.reset() still restores the frozen default afterward.
  await evaluate(`
    document.getElementById('native-form').reset();
    new Promise((resolve) => setTimeout(resolve, 0));
  `);
  assert.deepEqual(await evaluate(`({
    rice: document.getElementById('topping-rice').checked,
    beans: document.getElementById('topping-beans').checked,
    toppings: document.getElementById('toppings-value').value,
    form: Object.fromEntries(
      [...new FormData(document.getElementById('native-form'))].filter(([name]) => name === 'topping')
    )
  })`), {
    rice: true,
    beans: false,
    toppings: 'rice',
    form: { topping: 'rice' }
  });

  // HTMLFormElement.prototype.reset がマウント・アンマウントを通じて改変されないことを検証する。
  assert.deepEqual(await evaluate(`(() => {
    const before = HTMLFormElement.prototype.reset;
    const isNativeBefore = Function.prototype.toString.call(before).includes('[native code]');
    document.getElementById('toggle-mountable-group').click();
    return Promise.resolve().then(() => {
      const afterUnmount = HTMLFormElement.prototype.reset;
      document.getElementById('toggle-mountable-group').click();
      return Promise.resolve().then(() => ({
        isNativeBefore,
        sameAfterUnmount: before === afterUnmount,
        sameAfterRemount: before === HTMLFormElement.prototype.reset
      }));
    });
  })()`), {
    isNativeBefore: true,
    sameAfterUnmount: true,
    sameAfterRemount: true
  });

  // 同一タスク内でキャンセルされた reset の直後に有効な reset が続いた場合、モデルが同期されることを検証する。
  await evaluate(`
    document.getElementById('topping-beans').click();
    Promise.resolve();
  `);
  assert.equal(await evaluate(`document.getElementById('toppings-value').value`), 'rice,beans');
  await evaluate(`
    document.getElementById('canceled-then-valid-reset').click();
    new Promise((resolve) => setTimeout(resolve, 0));
  `);
  assert.deepEqual(await evaluate(`({
    rice: document.getElementById('topping-rice').checked,
    beans: document.getElementById('topping-beans').checked,
    toppings: document.getElementById('toppings-value').value,
    form: Object.fromEntries(
      [...new FormData(document.getElementById('native-form'))].filter(([name]) => name === 'topping')
    )
  })`), {
    rice: true,
    beans: false,
    toppings: 'rice',
    form: { topping: 'rice' }
  });

  // 同一タスク内で有効な reset が 2 回連続した場合もデフォルトへ正しく同期されることを検証する。
  await evaluate(`
    document.getElementById('topping-beans').click();
    Promise.resolve();
  `);
  assert.equal(await evaluate(`document.getElementById('toppings-value').value`), 'rice,beans');
  await evaluate(`
    document.getElementById('double-valid-reset').click();
    new Promise((resolve) => setTimeout(resolve, 0));
  `);
  assert.deepEqual(await evaluate(`({
    rice: document.getElementById('topping-rice').checked,
    beans: document.getElementById('topping-beans').checked,
    toppings: document.getElementById('toppings-value').value,
    form: Object.fromEntries(
      [...new FormData(document.getElementById('native-form'))].filter(([name]) => name === 'topping')
    )
  })`), {
    rice: true,
    beans: false,
    toppings: 'rice',
    form: { topping: 'rice' }
  });

  // 別フォームのグループ更新がフォーム A の保留中リセットをキャンセルしないことを検証する。
  await evaluate(`
    document.getElementById('isolated-a-checkbox').click();
    Promise.resolve();
  `);
  assert.deepEqual(await evaluate(`({
    aChecked: document.getElementById('isolated-a-checkbox').checked,
    aGroup: document.getElementById('isolated-a-group').value
  })`), { aChecked: true, aGroup: 'x' });
  await evaluate(`
    document.getElementById('reset-a-then-update-b').click();
    new Promise((resolve) => setTimeout(resolve, 0));
  `);
  assert.deepEqual(await evaluate(`({
    aChecked: document.getElementById('isolated-a-checkbox').checked,
    aGroup: document.getElementById('isolated-a-group').value,
    bChecked: document.getElementById('isolated-b-checkbox').checked,
    bGroup: document.getElementById('isolated-b-group').value
  })`), {
    aChecked: false,
    aGroup: '',
    bChecked: true,
    bGroup: 'y'
  });

  // 同一フォーム内の別グループ更新が他方のグループの保留中リセットをキャンセルしないことを検証する。
  await evaluate(`
    document.getElementById('shared-group-one').click();
    Promise.resolve();
  `);
  assert.deepEqual(await evaluate(`({
    oneChecked: document.getElementById('shared-group-one').checked,
    oneGroup: document.getElementById('shared-one-group').value
  })`), { oneChecked: true, oneGroup: 'x' });
  await evaluate(`
    document.getElementById('reset-shared-then-update-two').click();
    new Promise((resolve) => setTimeout(resolve, 0));
  `);
  assert.deepEqual(await evaluate(`({
    oneChecked: document.getElementById('shared-group-one').checked,
    oneGroup: document.getElementById('shared-one-group').value,
    twoChecked: document.getElementById('shared-group-two').checked,
    twoGroup: document.getElementById('shared-two-group').value
  })`), {
    oneChecked: false,
    oneGroup: '',
    twoChecked: true,
    twoGroup: 'y'
  });

  assert.equal(await evaluate(`document.getElementById('dynamic').type`), 'text');
  assert.equal(await evaluate(`document.getElementById('dynamic').value`), 'switchable');
  await evaluate(`document.getElementById('toggle-dynamic-type').click(); Promise.resolve()`);
  assert.deepEqual(await evaluate(`({
    type: document.getElementById('dynamic').type,
    mode: document.getElementById('dynamic-type').value,
    checked: document.getElementById('dynamic').checked,
    checkedOutput: document.getElementById('dynamic-checked').value
  })`), { type: 'checkbox', mode: 'checkbox', checked: false, checkedOutput: 'false' });
  await evaluate(`document.getElementById('dynamic').click(); Promise.resolve()`);
  assert.deepEqual(await evaluate(`({
    checked: document.getElementById('dynamic').checked,
    checkedOutput: document.getElementById('dynamic-checked').value
  })`), { checked: true, checkedOutput: 'true' });
  await evaluate(`document.getElementById('toggle-dynamic-type').click(); Promise.resolve()`);
  assert.deepEqual(await evaluate(`({
    type: document.getElementById('dynamic').type,
    mode: document.getElementById('dynamic-type').value,
    value: document.getElementById('dynamic').value,
    textOutput: document.getElementById('dynamic-text').value
  })`), {
    type: 'text',
    mode: 'text',
    value: 'switchable',
    textOutput: 'switchable'
  });

  console.log(`Component fixture passed in ${executable}.`);
} finally {
  rejectPending(new Error('Component fixture is shutting down'));
  server?.close();
  if (socket) socket.close();
  killBrowser(chrome);
  rmSync(profile, { recursive: true, force: true });
  rmSync(output, { recursive: true, force: true });
}
