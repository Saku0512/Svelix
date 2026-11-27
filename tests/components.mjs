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

  const pageErrors = [];
  socket = new WebSocket(page.webSocketDebuggerUrl);
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') {
      const detail = message.params?.exceptionDetails;
      pageErrors.push(detail?.exception?.description || detail?.text || 'Unhandled page exception');
      return;
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
      const args = (message.params.args ?? []).map((arg) => arg.description ?? String(arg.value ?? '')).join(' ');
      pageErrors.push(`console.error: ${args}`);
      return;
    }
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

  const runCase = async (name, fn) => {
    try {
      await fn();
    } catch (error) {
      if (error instanceof Error) {
        error.message = `[${name}] ${error.message}`;
      }
      throw error;
    }
  };

  const getAxNode = async (id) => {
    const resolved = await send('Runtime.evaluate', {
      expression: `document.getElementById(${JSON.stringify(id)})`,
      returnByValue: false
    });
    if (!resolved.result?.objectId) throw new Error(`Element #${id} not found for AX inspection`);
    const { nodes } = await send('Accessibility.getPartialAXTree', {
      objectId: resolved.result.objectId,
      fetchRelatives: false
    });
    const node = nodes.find((item) => !item.ignored) ?? nodes[0];
    const props = Object.fromEntries(
      (node?.properties ?? []).map((prop) => [prop.name, prop.value?.value])
    );
    return {
      ignored: Boolean(node?.ignored),
      role: node?.role?.value ?? null,
      name: node?.name?.value ?? null,
      properties: props
    };
  };

  await send('Runtime.enable');
  await send('Accessibility.enable');
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

  // Verify HTMLFormElement.prototype.reset remains native and unchanged across mount/unmount.
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

  // Verify a canceled reset followed by a valid reset in the same task syncs the model.
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

  // Verify two consecutive valid resets in the same task restore the default state.
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

  // Verify updating a group in form B does not cancel form A's pending reset.
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

  // Verify updating another group within the same form does not cancel the first group's reset.
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

  // Verify synchronous resets across two forms sharing one group do not cancel each other.
  await evaluate(`
    document.getElementById('cross-shared-a').click();
    document.getElementById('cross-shared-b').click();
    Promise.resolve();
  `);
  assert.deepEqual(await evaluate(`({
    aChecked: document.getElementById('cross-shared-a').checked,
    bChecked: document.getElementById('cross-shared-b').checked,
    group: document.getElementById('cross-shared-group').value
  })`), { aChecked: true, bChecked: true, group: 'x,y' });
  await evaluate(`
    document.getElementById('reset-cross-shared-both').click();
    new Promise((resolve) => setTimeout(resolve, 0));
  `);
  assert.deepEqual(await evaluate(`({
    aChecked: document.getElementById('cross-shared-a').checked,
    bChecked: document.getElementById('cross-shared-b').checked,
    group: document.getElementById('cross-shared-group').value
  })`), {
    aChecked: false,
    bChecked: false,
    group: ''
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

  // Verify Checkbox and RadioGroup/Radio semantics, initial state, accessible names, and styles.
  const selectionInitial = await evaluate(`(() => {
    const cb = document.getElementById('cb-controlled');
    const cbUncontrolled = document.getElementById('cb-uncontrolled');
    const cbDisabled = document.getElementById('cb-disabled');
    const rgPlan = document.getElementById('rg-plan');
    const rgUncontrolled = document.getElementById('rg-uncontrolled');
    const rgDisabled = document.getElementById('rg-disabled-group');
    const planPro = document.getElementById('rg-plan-pro');
    return {
      cbTag: cb.tagName,
      cbType: cb.type,
      cbChecked: cb.checked,
      cbIndeterminate: cb.indeterminate,
      cbMatchesIndeterminate: cb.matches(':indeterminate'),
      cbLabel: cb.labels[0]?.textContent?.trim(),
      cbUncontrolledChecked: cbUncontrolled.checked,
      cbUncontrolledLabel: cbUncontrolled.labels[0]?.textContent?.trim(),
      cbDisabled: cbDisabled.disabled,
      rgTag: rgPlan.tagName,
      rgRole: rgPlan.getAttribute('role'),
      rgLegendTag: rgPlan.firstElementChild?.tagName,
      rgLegendText: rgPlan.firstElementChild?.textContent?.trim(),
      rgSnippetLegendText: rgUncontrolled.firstElementChild?.textContent?.trim(),
      rgDisabled: rgDisabled.disabled,
      planProName: planPro.name,
      planProRole: planPro.getAttribute('role'),
      planProChecked: planPro.checked,
      deliveryStandardChecked: document.getElementById('rg-delivery-standard').checked,
      formData: Object.fromEntries(new FormData(document.getElementById('selection-form'))),
      styles: {
        cbAccent: getComputedStyle(cb).accentColor,
        plainCbAccent: getComputedStyle(document.getElementById('plain-checkbox')).accentColor,
        rgBorderColor: getComputedStyle(rgPlan).borderColor,
        plainFieldsetBorderColor: getComputedStyle(document.getElementById('plain-fieldset')).borderColor,
        darkCbAccent: getComputedStyle(document.getElementById('dark-svelix-checkbox')).accentColor,
        darkRadioAccent: getComputedStyle(document.getElementById('dark-radio-a')).accentColor,
        darkRgBorder: getComputedStyle(document.getElementById('dark-radio-group')).borderColor
      }
    };
  })()`);
  assert.equal(selectionInitial.cbTag, 'INPUT');
  assert.equal(selectionInitial.cbType, 'checkbox');
  assert.equal(selectionInitial.cbChecked, false);
  assert.equal(selectionInitial.cbIndeterminate, true);
  assert.equal(selectionInitial.cbMatchesIndeterminate, true);
  assert.equal(selectionInitial.cbLabel, 'Controlled checkbox');
  assert.equal(selectionInitial.cbUncontrolledChecked, true);
  assert.equal(selectionInitial.cbUncontrolledLabel, 'Uncontrolled checkbox');
  assert.equal(selectionInitial.cbDisabled, true);
  assert.equal(selectionInitial.rgTag, 'FIELDSET');
  assert.equal(selectionInitial.rgRole, null, 'native fieldset must not add redundant ARIA role');
  assert.equal(selectionInitial.rgLegendTag, 'LEGEND');
  assert.equal(selectionInitial.rgLegendText, 'Billing plan');
  assert.equal(selectionInitial.rgSnippetLegendText, 'Delivery method');
  assert.equal(selectionInitial.rgDisabled, true);
  assert.equal(selectionInitial.planProName, 'plan');
  assert.equal(selectionInitial.planProRole, null, 'native radio must not add redundant ARIA role');
  assert.equal(selectionInitial.planProChecked, true);
  assert.equal(selectionInitial.deliveryStandardChecked, true);
  assert.deepEqual(selectionInitial.formData, {
    'cb-uncontrolled': 'on',
    plan: 'pro',
    delivery: 'standard',
    [await evaluate(`document.getElementById('rg-unnamed-first').name`)]: 'first',
    'default-val': 'custom'
  });
  assert.equal(selectionInitial.styles.cbAccent, 'rgb(29, 78, 216)');
  assert.notEqual(selectionInitial.styles.plainCbAccent, 'rgb(29, 78, 216)');
  assert.equal(selectionInitial.styles.rgBorderColor, 'rgb(100, 116, 139)');
  assert.notEqual(selectionInitial.styles.plainFieldsetBorderColor, 'rgb(100, 116, 139)');
  assert.equal(selectionInitial.styles.darkCbAccent, 'rgb(147, 197, 253)');
  assert.equal(selectionInitial.styles.darkRadioAccent, 'rgb(147, 197, 253)');
  assert.equal(selectionInitial.styles.darkRgBorder, 'rgb(148, 163, 184)');

  // Verify Checkbox keyboard interaction (Tab, Space, clearing indeterminate, skipping disabled).
  await evaluate(`document.getElementById('selection-tab-start').focus()`);
  await key('Tab', 'Tab', 9);
  assert.equal(await evaluate(`document.activeElement.id`), 'cb-controlled');
  assert.equal(await evaluate(`getComputedStyle(document.activeElement).outlineStyle`), 'solid');
  await key(' ', 'Space', 32);
  assert.deepEqual(await evaluate(`({
    checked: document.getElementById('cb-controlled').checked,
    indeterminate: document.getElementById('cb-controlled').indeterminate,
    checkedOutput: document.getElementById('cb-controlled-value').value,
    indeterminateOutput: document.getElementById('cb-indeterminate-value').value,
    changes: document.getElementById('cb-changes-value').value
  })`), {
    checked: true,
    indeterminate: false,
    checkedOutput: 'true',
    indeterminateOutput: 'false',
    changes: '1'
  });

  // Disabled checkbox is skipped in Tab order, moving focus to the uncontrolled checkbox.
  await key('Tab', 'Tab', 9);
  assert.equal(await evaluate(`document.activeElement.id`), 'cb-set-indeterminate');
  await key('Tab', 'Tab', 9);
  assert.equal(await evaluate(`document.activeElement.id`), 'cb-uncontrolled');
  await key(' ', 'Space', 32);
  assert.equal(await evaluate(`document.getElementById('cb-uncontrolled').checked`), false);

  // Skip over invalid checkbox to reach the controlled RadioGroup.
  await key('Tab', 'Tab', 9);
  assert.equal(await evaluate(`document.activeElement.id`), 'cb-invalid');
  assert.equal(
    await evaluate(`getComputedStyle(document.getElementById('cb-invalid')).accentColor`),
    'rgb(185, 28, 28)',
    'aria-invalid checkbox must use danger accent token'
  );
  assert.equal(
    await evaluate(`document.getElementById('cb-invalid').getAttribute('aria-describedby')`),
    'cb-invalid-error'
  );

  // Verify RadioGroup keyboard interaction (Tab into checked radio, ArrowUp skipping disabled option).
  await key('Tab', 'Tab', 9);
  assert.equal(await evaluate(`document.activeElement.id`), 'rg-plan-pro');
  assert.equal(await evaluate(`getComputedStyle(document.activeElement).outlineStyle`), 'solid');
  await key('ArrowUp', 'ArrowUp', 38);
  assert.deepEqual(await evaluate(`({
    activeId: document.activeElement.id,
    basicChecked: document.getElementById('rg-plan-basic').checked,
    proChecked: document.getElementById('rg-plan-pro').checked,
    planOutput: document.getElementById('rg-plan-value').value,
    changes: document.getElementById('rg-changes-value').value
  })`), {
    activeId: 'rg-plan-basic',
    basicChecked: true,
    proChecked: false,
    planOutput: 'basic',
    changes: '1'
  });

  // Tab to the uncontrolled RadioGroup, switch via ArrowDown, and skip the disabled RadioGroup.
  await key('Tab', 'Tab', 9);
  assert.equal(await evaluate(`document.activeElement.id`), 'rg-delivery-standard');
  await key('ArrowDown', 'ArrowDown', 40);
  assert.equal(await evaluate(`document.getElementById('rg-delivery-express').checked`), true);
  await key('Tab', 'Tab', 9);
  assert.equal(
    await evaluate(`document.activeElement.id`),
    'selection-submit',
    'disabled fieldset radio group must be skipped in tab order'
  );

  // Verify FormData on submit, trusted reset, and preserving newer writes after form.reset().
  assert.deepEqual(
    await evaluate(`Object.fromEntries(new FormData(document.getElementById('selection-form')))`),
    {
      'cb-controlled': 'yes',
      plan: 'basic',
      delivery: 'express',
      [await evaluate(`document.getElementById('rg-unnamed-first').name`)]: 'first',
      'default-val': 'custom'
    }
  );
  await evaluate(`document.getElementById('selection-submit').click(); Promise.resolve()`);
  assert.equal(await evaluate(`document.getElementById('rg-submissions-value').value`), '1');

  await mouseClick('selection-reset');
  assert.deepEqual(await evaluate(`({
    cbControlled: document.getElementById('cb-controlled').checked,
    cbControlledOutput: document.getElementById('cb-controlled-value').value,
    cbUncontrolled: document.getElementById('cb-uncontrolled').checked,
    rgPlan: document.getElementById('rg-plan-value').value,
    rgProChecked: document.getElementById('rg-plan-pro').checked,
    rgDeliveryStandard: document.getElementById('rg-delivery-standard').checked,
    formData: Object.fromEntries(new FormData(document.getElementById('selection-form')))
  })`), {
    cbControlled: false,
    cbControlledOutput: 'false',
    cbUncontrolled: true,
    rgPlan: 'pro',
    rgProChecked: true,
    rgDeliveryStandard: true,
    formData: {
      'cb-uncontrolled': 'on',
      plan: 'pro',
      delivery: 'standard',
      [await evaluate(`document.getElementById('rg-unnamed-first').name`)]: 'first',
      'default-val': 'custom'
    }
  });

  await evaluate(`
    document.getElementById('selection-reset-then-set').click();
    new Promise((resolve) => setTimeout(resolve, 0));
  `);
  assert.deepEqual(await evaluate(`({
    rgPlan: document.getElementById('rg-plan-value').value,
    rgBasicChecked: document.getElementById('rg-plan-basic').checked,
    rgProChecked: document.getElementById('rg-plan-pro').checked
  })`), {
    rgPlan: 'basic',
    rgBasicChecked: true,
    rgProChecked: false
  });

  // Verify RadioGroup generates a shared non-empty name when omitted and ignores child name overrides.
  const unnamedNames = await evaluate(`({
    first: document.getElementById('rg-unnamed-first').name,
    second: document.getElementById('rg-unnamed-second').name
  })`);
  assert.ok(unnamedNames.first.length > 0, 'unnamed RadioGroup must generate a non-empty name');
  assert.equal(unnamedNames.second, unnamedNames.first, 'child Radio must keep the group name');
  await evaluate(`document.getElementById('rg-unnamed-second').click(); Promise.resolve()`);
  assert.deepEqual(await evaluate(`({
    firstChecked: document.getElementById('rg-unnamed-first').checked,
    secondChecked: document.getElementById('rg-unnamed-second').checked,
    value: document.getElementById('rg-unnamed-value').value,
    formValue: new FormData(document.getElementById('selection-form')).get(${JSON.stringify(unnamedNames.first)})
  })`), {
    firstChecked: false,
    secondChecked: true,
    value: 'second',
    formValue: 'second'
  });

  // Verify omitted Radio value matches native "on" across DOM, model, FormData, and reset.
  await evaluate(`document.getElementById('rg-omitted-value').click(); Promise.resolve()`);
  assert.deepEqual(await evaluate(`({
    domValue: document.getElementById('rg-omitted-value').value,
    checked: document.getElementById('rg-omitted-value').checked,
    model: document.getElementById('rg-default-val-value').value,
    formValue: new FormData(document.getElementById('selection-form')).get('default-val')
  })`), {
    domValue: 'on',
    checked: true,
    model: 'on',
    formValue: 'on'
  });
  await mouseClick('selection-reset');
  assert.deepEqual(await evaluate(`({
    omittedChecked: document.getElementById('rg-omitted-value').checked,
    explicitChecked: document.getElementById('rg-explicit-value').checked,
    model: document.getElementById('rg-default-val-value').value,
    formValue: new FormData(document.getElementById('selection-form')).get('default-val')
  })`), {
    omittedChecked: false,
    explicitChecked: true,
    model: 'custom',
    formValue: 'custom'
  });

  // Verify resetting form A does not clear a descendant Radio owned by form B or an unrelated native radio.
  await evaluate(`document.getElementById('rg-owner-b').click(); Promise.resolve()`);
  assert.deepEqual(await evaluate(`({
    bChecked: document.getElementById('rg-owner-b').checked,
    formB: Object.fromEntries(new FormData(document.getElementById('rg-owner-form-b'))),
    model: JSON.parse(document.getElementById('rg-cross-owner-value').value)
  })`), {
    bChecked: true,
    formB: { 'cross-owner': 'b' },
    model: 'b'
  });
  await evaluate(`
    document.getElementById('rg-owner-form-a').reset();
    new Promise((resolve) => setTimeout(resolve, 0));
  `);
  assert.deepEqual(await evaluate(`({
    bChecked: document.getElementById('rg-owner-b').checked,
    formB: Object.fromEntries(new FormData(document.getElementById('rg-owner-form-b'))),
    unrelatedChecked: document.getElementById('rg-unrelated-native').checked
  })`), {
    bChecked: true,
    formB: { 'cross-owner': 'b' },
    unrelatedChecked: true
  });

  // Verify resetting form B clears B without re-checking A in form A.
  await runCase('radio-group: inverse cross-form reset preserves form A', async () => {
    await evaluate(`
      document.getElementById('rg-owner-form-b').reset();
      new Promise((resolve) => setTimeout(resolve, 0));
    `);
    assert.deepEqual(await evaluate(`({
      aChecked: document.getElementById('rg-owner-a').checked,
      bChecked: document.getElementById('rg-owner-b').checked,
      model: JSON.parse(document.getElementById('rg-cross-owner-value').value),
      formA: Object.fromEntries(new FormData(document.getElementById('rg-owner-form-a'))),
      formB: Object.fromEntries(new FormData(document.getElementById('rg-owner-form-b')))
    })`), {
      aChecked: false,
      bChecked: false,
      model: null,
      formA: { 'unrelated-native': 'u' },
      formB: {}
    });
  });

  // Verify explicit defaultChecked={false} resets to null and remains controlled for re-selection.
  await runCase('radio-group: explicit defaultChecked=false resets to null and re-selects', async () => {
    assert.deepEqual(await evaluate(`({
      aChecked: document.getElementById('rg-eu-a').checked,
      bChecked: document.getElementById('rg-eu-b').checked,
      model: JSON.parse(document.getElementById('rg-explicit-unchecked-value').value),
      formData: Object.fromEntries(new FormData(document.getElementById('rg-explicit-unchecked-form')))
    })`), {
      aChecked: true,
      bChecked: false,
      model: 'a',
      formData: { 'explicit-unchecked': 'a' }
    });
    await evaluate(`
      document.getElementById('rg-explicit-unchecked-form').reset();
      new Promise((resolve) => setTimeout(resolve, 0));
    `);
    assert.deepEqual(await evaluate(`({
      aChecked: document.getElementById('rg-eu-a').checked,
      bChecked: document.getElementById('rg-eu-b').checked,
      model: JSON.parse(document.getElementById('rg-explicit-unchecked-value').value),
      formData: Object.fromEntries(new FormData(document.getElementById('rg-explicit-unchecked-form')))
    })`), {
      aChecked: false,
      bChecked: false,
      model: null,
      formData: {}
    });
    await evaluate(`document.getElementById('rg-eu-b').click(); Promise.resolve()`);
    assert.deepEqual(await evaluate(`({
      aChecked: document.getElementById('rg-eu-a').checked,
      bChecked: document.getElementById('rg-eu-b').checked,
      model: JSON.parse(document.getElementById('rg-explicit-unchecked-value').value),
      formData: Object.fromEntries(new FormData(document.getElementById('rg-explicit-unchecked-form')))
    })`), {
      aChecked: false,
      bChecked: true,
      model: 'b',
      formData: { 'explicit-unchecked': 'b' }
    });
  });

  // Verify controlled null lifecycle with trusted clicks, keyboard reset, synthetic/canceled resets, and clear/re-select.
  await runCase('radio-group: controlled null lifecycle and reset edge cases', async () => {
    assert.deepEqual(await evaluate(`({
      aChecked: document.getElementById('rg-null-a').checked,
      bChecked: document.getElementById('rg-null-b').checked,
      model: JSON.parse(document.getElementById('rg-nullable-value').value),
      formData: Object.fromEntries(new FormData(document.getElementById('rg-nullable-form')))
    })`), {
      aChecked: false,
      bChecked: false,
      model: null,
      formData: {}
    });
    await mouseClick('rg-null-a-label');
    assert.deepEqual(await evaluate(`({
      aChecked: document.getElementById('rg-null-a').checked,
      bChecked: document.getElementById('rg-null-b').checked,
      model: JSON.parse(document.getElementById('rg-nullable-value').value),
      formData: Object.fromEntries(new FormData(document.getElementById('rg-nullable-form')))
    })`), {
      aChecked: true,
      bChecked: false,
      model: 'a',
      formData: { 'nullable-choice': 'a' }
    });
    // Synthetic and canceled resets must not alter controlled selection.
    await evaluate(`
      document.getElementById('rg-nullable-synthetic-reset').click();
      new Promise((resolve) => setTimeout(resolve, 0));
    `);
    assert.equal(await evaluate(`JSON.parse(document.getElementById('rg-nullable-value').value)`), 'a');
    await evaluate(`
      document.getElementById('rg-nullable-canceled-reset').click();
      new Promise((resolve) => setTimeout(resolve, 0));
    `);
    assert.equal(await evaluate(`JSON.parse(document.getElementById('rg-nullable-value').value)`), 'a');
    // Canceled reset followed by a valid reset in the same task must clear to null.
    await evaluate(`
      document.getElementById('rg-nullable-canceled-then-valid').click();
      new Promise((resolve) => setTimeout(resolve, 0));
    `);
    assert.deepEqual(await evaluate(`({
      aChecked: document.getElementById('rg-null-a').checked,
      bChecked: document.getElementById('rg-null-b').checked,
      model: JSON.parse(document.getElementById('rg-nullable-value').value),
      formData: Object.fromEntries(new FormData(document.getElementById('rg-nullable-form')))
    })`), {
      aChecked: false,
      bChecked: false,
      model: null,
      formData: {}
    });
    // Re-select via trusted label click, then test trusted keyboard reset via Enter.
    await mouseClick('rg-null-b-label');
    assert.deepEqual(await evaluate(`({
      aChecked: document.getElementById('rg-null-a').checked,
      bChecked: document.getElementById('rg-null-b').checked,
      model: JSON.parse(document.getElementById('rg-nullable-value').value),
      formData: Object.fromEntries(new FormData(document.getElementById('rg-nullable-form')))
    })`), {
      aChecked: false,
      bChecked: true,
      model: 'b',
      formData: { 'nullable-choice': 'b' }
    });
    await evaluate(`document.getElementById('rg-nullable-reset-btn').focus()`);
    await key('Enter', 'Enter', 13);
    await evaluate(`new Promise((resolve) => setTimeout(resolve, 0))`);
    assert.deepEqual(await evaluate(`({
      aChecked: document.getElementById('rg-null-a').checked,
      bChecked: document.getElementById('rg-null-b').checked,
      model: JSON.parse(document.getElementById('rg-nullable-value').value),
      formData: Object.fromEntries(new FormData(document.getElementById('rg-nullable-form')))
    })`), {
      aChecked: false,
      bChecked: false,
      model: null,
      formData: {}
    });
    // Re-select, programmatically clear to null, and re-select again.
    await mouseClick('rg-null-b-label');
    await evaluate(`document.getElementById('rg-nullable-clear').click(); Promise.resolve()`);
    assert.deepEqual(await evaluate(`({
      aChecked: document.getElementById('rg-null-a').checked,
      bChecked: document.getElementById('rg-null-b').checked,
      model: JSON.parse(document.getElementById('rg-nullable-value').value),
      formData: Object.fromEntries(new FormData(document.getElementById('rg-nullable-form')))
    })`), {
      aChecked: false,
      bChecked: false,
      model: null,
      formData: {}
    });
    await mouseClick('rg-null-a-label');
    assert.deepEqual(await evaluate(`({
      aChecked: document.getElementById('rg-null-a').checked,
      bChecked: document.getElementById('rg-null-b').checked,
      model: JSON.parse(document.getElementById('rg-nullable-value').value),
      formData: Object.fromEntries(new FormData(document.getElementById('rg-nullable-form')))
    })`), {
      aChecked: true,
      bChecked: false,
      model: 'a',
      formData: { 'nullable-choice': 'a' }
    });
  });

  // Verify Checkbox trusted label click, programmatic indeterminate update, and aria-describedby.
  await runCase('checkbox: trusted label click and programmatic indeterminate update', async () => {
    await mouseClick('cb-controlled-label');
    assert.deepEqual(await evaluate(`({
      checked: document.getElementById('cb-controlled').checked,
      output: document.getElementById('cb-controlled-value').value,
      describedBy: document.getElementById('cb-controlled').getAttribute('aria-describedby')
    })`), {
      checked: true,
      output: 'true',
      describedBy: 'cb-controlled-help'
    });
    await evaluate(`document.getElementById('cb-set-indeterminate').click(); Promise.resolve()`);
    assert.deepEqual(await evaluate(`({
      indeterminate: document.getElementById('cb-controlled').indeterminate,
      matches: document.getElementById('cb-controlled').matches(':indeterminate'),
      output: document.getElementById('cb-indeterminate-value').value
    })`), {
      indeterminate: true,
      matches: true,
      output: 'true'
    });
  });

  // Verify nested RadioGroups, external form-associated RadioGroup, and standalone Radio.
  await runCase('radio-group: nested groups, external form owner, and standalone Radio', async () => {
    await evaluate(`
      document.getElementById('rg-outer-b').click();
      document.getElementById('rg-inner-b').click();
      Promise.resolve();
    `);
    assert.deepEqual(await evaluate(`({
      outer: JSON.parse(document.getElementById('rg-outer-nested-value').value),
      inner: JSON.parse(document.getElementById('rg-inner-nested-value').value)
    })`), { outer: 'outer-b', inner: 'inner-b' });
    await evaluate(`
      document.getElementById('rg-nested-outer-form').reset();
      new Promise((resolve) => setTimeout(resolve, 0));
    `);
    assert.deepEqual(await evaluate(`({
      outer: JSON.parse(document.getElementById('rg-outer-nested-value').value),
      inner: JSON.parse(document.getElementById('rg-inner-nested-value').value),
      outerA: document.getElementById('rg-outer-a').checked,
      innerA: document.getElementById('rg-inner-a').checked
    })`), { outer: 'outer-a', inner: 'inner-a', outerA: true, innerA: true });

    await evaluate(`document.getElementById('rg-ext-b').click(); Promise.resolve()`);
    assert.deepEqual(await evaluate(`({
      model: JSON.parse(document.getElementById('rg-external-value').value),
      formData: Object.fromEntries(new FormData(document.getElementById('rg-external-form')))
    })`), { model: 'ext-b', formData: { 'external-choice': 'ext-b' } });
    await evaluate(`
      document.getElementById('rg-external-form').reset();
      new Promise((resolve) => setTimeout(resolve, 0));
    `);
    assert.deepEqual(await evaluate(`({
      model: JSON.parse(document.getElementById('rg-external-value').value),
      aChecked: document.getElementById('rg-ext-a').checked,
      formData: Object.fromEntries(new FormData(document.getElementById('rg-external-form')))
    })`), { model: 'ext-a', aChecked: true, formData: { 'external-choice': 'ext-a' } });

    await evaluate(`document.getElementById('standalone-b').click(); Promise.resolve()`);
    assert.deepEqual(await evaluate(`({
      aChecked: document.getElementById('standalone-a').checked,
      bChecked: document.getElementById('standalone-b').checked,
      formData: Object.fromEntries(new FormData(document.getElementById('standalone-radio-form')))
    })`), { aChecked: false, bChecked: true, formData: { standalone: 'b' } });
    await evaluate(`document.getElementById('standalone-radio-form').reset(); Promise.resolve()`);
    assert.deepEqual(await evaluate(`({
      aChecked: document.getElementById('standalone-a').checked,
      bChecked: document.getElementById('standalone-b').checked,
      formData: Object.fromEntries(new FormData(document.getElementById('standalone-radio-form')))
    })`), { aChecked: true, bChecked: false, formData: { standalone: 'a' } });
  });

  // Verify Label semantics, native `for` and wrapping associations, absence of hidden IDs, and scoped styles.
  await runCase('label: semantic HTML, native associations, click forwarding, and scoped styles', async () => {
    const labelInfo = await evaluate(`(() => {
      const labelFor = document.getElementById('svelix-label-for');
      const labelWrap = document.getElementById('svelix-label-wrap');
      const labelUnbound = document.getElementById('svelix-label-unbound');
      const input = document.getElementById('labeled-account-input');
      const wrappedCb = document.getElementById('labeled-wrap-checkbox');
      return {
        tag: labelFor.tagName,
        htmlFor: labelFor.htmlFor,
        controlId: labelFor.control?.id,
        testId: labelFor.dataset.testid,
        inputLabelText: input.labels[0]?.textContent?.trim(),
        wrapControlId: labelWrap.control?.id,
        wrappedCbLabelText: wrappedCb.labels[0]?.textContent?.trim(),
        unboundHtmlFor: labelUnbound.htmlFor,
        unboundControl: labelUnbound.control,
        styles: {
          lightColor: getComputedStyle(labelFor).color,
          lightWeight: getComputedStyle(labelFor).fontWeight,
          plainWeight: getComputedStyle(document.getElementById('plain-label')).fontWeight,
          customColor: getComputedStyle(document.getElementById('svelix-label-custom')).color,
          darkColor: getComputedStyle(document.getElementById('dark-label')).color
        }
      };
    })()`);
    assert.equal(labelInfo.tag, 'LABEL');
    assert.equal(labelInfo.htmlFor, 'labeled-account-input');
    assert.equal(labelInfo.controlId, 'labeled-account-input');
    assert.equal(labelInfo.testId, 'account-label');
    assert.equal(labelInfo.inputLabelText, 'Account handle');
    assert.equal(labelInfo.wrapControlId, 'labeled-wrap-checkbox');
    assert.equal(labelInfo.wrappedCbLabelText, 'Enable notifications');
    assert.equal(labelInfo.unboundHtmlFor, '', 'Label must not invent hidden `for` attributes');
    assert.equal(labelInfo.unboundControl, null);
    assert.equal(labelInfo.styles.lightColor, 'rgb(15, 23, 42)');
    assert.equal(labelInfo.styles.lightWeight, '500');
    assert.notEqual(labelInfo.styles.plainWeight, '500', 'Label styles must not leak to plain <label>');
    assert.equal(labelInfo.styles.customColor, 'rgb(4, 120, 87)');
    assert.equal(labelInfo.styles.darkColor, 'rgb(248, 250, 252)');

    const inputAx = await getAxNode('labeled-account-input');
    assert.ok(
      inputAx.name?.includes('Account handle'),
      `expected input accessible name to include Label text, got ${JSON.stringify(inputAx.name)}`
    );

    // Trusted click on `<Label for>` focuses the associated Input and runs `onclick`.
    await mouseClick('svelix-label-for');
    assert.deepEqual(await evaluate(`({
      activeId: document.activeElement?.id,
      clicks: document.getElementById('label-clicks-value').value
    })`), {
      activeId: 'labeled-account-input',
      clicks: '1'
    });

    // Trusted click on wrapping `<Label>` toggles the nested Checkbox.
    await mouseClick('svelix-label-wrap');
    assert.deepEqual(await evaluate(`({
      checked: document.getElementById('labeled-wrap-checkbox').checked,
      bound: document.getElementById('label-wrapped-checked-value').value
    })`), {
      checked: true,
      bound: 'true'
    });
  });

  // Verify Separator semantics, orientation, decorative vs semantic AX exposure, and scoped token styles.
  await runCase('separator: orientation, decorative vs semantic AX tree, dynamic updates, and styles', async () => {
    const sepDom = await evaluate(`(() => {
      const h = document.getElementById('sep-horizontal');
      const dh = document.getElementById('sep-decorative-horizontal');
      const v = document.getElementById('sep-vertical');
      const dv = document.getElementById('sep-decorative-vertical');
      const plain = document.getElementById('plain-hr');
      const custom = document.getElementById('sep-custom');
      const dark = document.getElementById('dark-separator');
      return {
        h: {
          tag: h.tagName,
          roleAttr: h.getAttribute('role'),
          ariaOrientation: h.getAttribute('aria-orientation'),
          ariaHidden: h.getAttribute('aria-hidden'),
          dataSection: h.dataset.section,
          borderTopWidth: getComputedStyle(h).borderTopWidth,
          borderTopColor: getComputedStyle(h).borderTopColor,
          marginTop: getComputedStyle(h).marginTop
        },
        dh: {
          roleAttr: dh.getAttribute('role'),
          ariaOrientation: dh.getAttribute('aria-orientation'),
          ariaHidden: dh.getAttribute('aria-hidden')
        },
        v: {
          tag: v.tagName,
          roleAttr: v.getAttribute('role'),
          ariaOrientation: v.getAttribute('aria-orientation'),
          ariaHidden: v.getAttribute('aria-hidden'),
          ariaLabel: v.getAttribute('aria-label'),
          borderLeftWidth: getComputedStyle(v).borderLeftWidth,
          borderLeftColor: getComputedStyle(v).borderLeftColor,
          marginLeft: getComputedStyle(v).marginLeft,
          height: v.getBoundingClientRect().height
        },
        dv: {
          roleAttr: dv.getAttribute('role'),
          ariaOrientation: dv.getAttribute('aria-orientation'),
          ariaHidden: dv.getAttribute('aria-hidden')
        },
        plainBorderTopColor: getComputedStyle(plain).borderTopColor,
        customBorderTopColor: getComputedStyle(custom).borderTopColor,
        darkBorderTopColor: getComputedStyle(dark).borderTopColor
      };
    })()`);

    assert.deepEqual(sepDom.h, {
      tag: 'HR',
      roleAttr: null,
      ariaOrientation: null,
      ariaHidden: null,
      dataSection: 'account',
      borderTopWidth: '1px',
      borderTopColor: 'rgb(100, 116, 139)',
      marginTop: '8px'
    });
    assert.deepEqual(sepDom.dh, {
      roleAttr: null,
      ariaOrientation: null,
      ariaHidden: 'true'
    });
    assert.equal(sepDom.v.tag, 'HR');
    assert.equal(sepDom.v.roleAttr, null, 'native <hr> must not add redundant role="separator"');
    assert.equal(sepDom.v.ariaOrientation, 'vertical');
    assert.equal(sepDom.v.ariaHidden, null);
    assert.equal(sepDom.v.ariaLabel, 'Toolbar group divider');
    assert.equal(sepDom.v.borderLeftWidth, '1px');
    assert.equal(sepDom.v.borderLeftColor, 'rgb(100, 116, 139)');
    assert.equal(sepDom.v.marginLeft, '8px');
    assert.ok(sepDom.v.height >= 16, `vertical separator must stretch/have visible height, got ${sepDom.v.height}`);
    assert.deepEqual(sepDom.dv, {
      roleAttr: null,
      ariaOrientation: null,
      ariaHidden: 'true'
    });
    assert.notEqual(sepDom.plainBorderTopColor, 'rgb(100, 116, 139)', 'Separator styles must not leak to plain <hr>');
    assert.equal(sepDom.customBorderTopColor, 'rgb(124, 58, 237)');
    assert.equal(sepDom.darkBorderTopColor, 'rgb(148, 163, 184)');

    const axHorizontal = await getAxNode('sep-horizontal');
    const axDecorativeH = await getAxNode('sep-decorative-horizontal');
    const axVertical = await getAxNode('sep-vertical');
    const axDecorativeV = await getAxNode('sep-decorative-vertical');
    assert.equal(axHorizontal.ignored, false);
    assert.equal(axHorizontal.role, 'separator');
    assert.equal(axDecorativeH.ignored, true, 'decorative horizontal separator must be ignored in AX tree');
    assert.equal(axVertical.ignored, false);
    assert.equal(axVertical.role, 'separator');
    assert.equal(axVertical.name, 'Toolbar group divider');
    assert.equal(axVertical.properties.orientation, 'vertical');
    assert.equal(axDecorativeV.ignored, true, 'decorative vertical separator must be ignored in AX tree');

    // Dynamic orientation and decorative transitions update both DOM and AX tree.
    await evaluate(`document.getElementById('toggle-sep-orientation').click(); Promise.resolve()`);
    const axDynamicVertical = await getAxNode('sep-dynamic');
    assert.equal(axDynamicVertical.ignored, false);
    assert.equal(axDynamicVertical.properties.orientation, 'vertical');
    assert.equal(
      await evaluate(`getComputedStyle(document.getElementById('sep-dynamic')).borderLeftWidth`),
      '1px'
    );

    await evaluate(`document.getElementById('toggle-sep-decorative').click(); Promise.resolve()`);
    const axDynamicDecorative = await getAxNode('sep-dynamic');
    assert.equal(axDynamicDecorative.ignored, true);
    assert.equal(
      await evaluate(`document.getElementById('sep-dynamic').getAttribute('aria-orientation')`),
      null
    );
  });

  assert.deepEqual(pageErrors, [], 'unexpected browser runtime or console errors');
  console.log(`Component fixture passed in ${executable}.`);
} finally {
  rejectPending(new Error('Component fixture is shutting down'));
  server?.close();
  if (socket) socket.close();
  killBrowser(chrome);
  rmSync(profile, { recursive: true, force: true });
  rmSync(output, { recursive: true, force: true });
}
