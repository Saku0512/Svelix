import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  // Verify the advertised peer floor, not only the locked development release.
  const sveltePack = packResult(execFileSync(npm, [
    'pack', 'svelte@5.59.0', '--json', '--pack-destination', fixture
  ], { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' }), 'svelte');
  writeFileSync(join(fixture, 'package.json'), JSON.stringify({
    name: 'svelix-consumer-fixture', version: '0.0.0', private: true, type: 'module',
    dependencies: {
      svelix: `file:${pack.filename}`,
      svelte: `file:${sveltePack.filename}`
    }
  }));
  execFileSync(npm, ['install', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: fixture, stdio: 'inherit', shell: process.platform === 'win32'
  });
  const installedSvelte = JSON.parse(readFileSync(join(fixture, 'node_modules/svelte/package.json'), 'utf8'));
  if (installedSvelte.version !== '5.59.0') {
    throw new Error(`Expected consumer Svelte 5.59.0, got ${installedSvelte.version}`);
  }
  writeFileSync(join(fixture, 'consumer.ts'), `import type { ComponentProps } from 'svelte';
import { Button, Checkbox, Input, Radio, RadioGroup } from 'svelix';

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
const checkbox: ComponentProps<typeof Input> = {
  type: 'checkbox',
  checked: true,
  value: 'yes'
};
const radio: ComponentProps<typeof Input> = {
  type: 'radio',
  value: 'm',
  group: 'm'
};
const unboundRadio: ComponentProps<typeof Input> = {
  type: 'radio',
  name: 'plain',
  value: 'b',
  checked: true
};
const checkboxGroup: ComponentProps<typeof Input> = {
  type: 'checkbox',
  value: 'rice',
  group: ['rice']
};
const file: ComponentProps<typeof Input> = {
  type: 'file',
  files: undefined
};
const svelixCheckbox: ComponentProps<typeof Checkbox> = {
  name: 'terms',
  value: 'yes',
  checked: false,
  indeterminate: true,
  defaultChecked: false,
  onchange: (event) => event.currentTarget.checked
};
const svelixRadioGroup: ComponentProps<typeof RadioGroup> = {
  legend: 'Billing plan',
  name: 'plan',
  value: 'pro',
  disabled: false
};
const svelixEmptyRadioGroup: ComponentProps<typeof RadioGroup> = {
  legend: 'Optional plan',
  name: 'optional-plan',
  value: null
};
const svelixRadio: ComponentProps<typeof Radio> = {
  value: 'pro',
  disabled: false,
  onchange: (event) => event.currentTarget.value
};
// @ts-expect-error variants are intentionally limited
const invalidButton: ComponentProps<typeof Button> = { variant: 'danger' };
// @ts-expect-error native input elements cannot have children
const invalidInput: ComponentProps<typeof Input> = { children: () => {} };
// @ts-expect-error Checkbox fixes input type to checkbox
const invalidCheckboxType: ComponentProps<typeof Checkbox> = { type: 'text' };
// @ts-expect-error Checkbox cannot accept children
const invalidCheckboxChildren: ComponentProps<typeof Checkbox> = { children: () => {} };
// @ts-expect-error Radio fixes input type to radio
const invalidRadioType: ComponentProps<typeof Radio> = { type: 'checkbox' };
// @ts-expect-error Radio cannot accept children
const invalidRadioChildren: ComponentProps<typeof Radio> = { children: () => {} };
// @ts-expect-error RadioGroup value must be string | null | undefined
const invalidRadioGroupValue: ComponentProps<typeof RadioGroup> = { value: 123 };
void [
  button,
  input,
  checkbox,
  radio,
  unboundRadio,
  checkboxGroup,
  file,
  svelixCheckbox,
  svelixRadioGroup,
  svelixEmptyRadioGroup,
  svelixRadio,
  invalidButton,
  invalidInput,
  invalidCheckboxType,
  invalidCheckboxChildren,
  invalidRadioType,
  invalidRadioChildren,
  invalidRadioGroupValue
];
`);
  writeFileSync(join(fixture, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { module: 'esnext', moduleResolution: 'bundler', strict: true, noEmit: true, skipLibCheck: true },
    include: ['consumer.ts']
  }));
  execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', fixture], { stdio: 'inherit' });
  writeFileSync(join(fixture, 'index.html'), '<div id="app"></div><script type="module" src="/main.js"></script>');
  writeFileSync(join(fixture, 'main.js'), "import 'svelix';\nimport 'svelix/styles.css';\nimport App from './App.svelte';\nimport { mount } from 'svelte';\nmount(App, { target: document.getElementById('app') });\n");
  writeFileSync(join(fixture, 'App.svelte'), `<script lang="ts">
  import { Button, Checkbox, Input, Radio, RadioGroup } from 'svelix';
  let email = $state('');
  let size = $state('m');
  let toppings = $state<string[]>([]);
  let terms = $state(false);
  let mixed = $state(true);
  let plan = $state<string | null>(null);
</script>

<form>
  <label for="email">Email</label>
  <Input id="email" name="email" type="email" autocomplete="email" bind:value={email} required />
  <Input type="radio" name="size" value="s" bind:group={size} />
  <Input type="radio" name="size" value="m" bind:group={size} />
  <Input type="checkbox" value="rice" bind:group={toppings} />
  <Input type="radio" name="plain" value="b" checked />
  <label><Checkbox name="terms" value="yes" bind:checked={terms} bind:indeterminate={mixed} /> Terms</label>
  <label><Checkbox name="updates" defaultChecked /> Updates</label>
  <RadioGroup legend="Plan" name="plan" bind:value={plan}>
    <label><Radio value="basic" /> Basic</label>
    <label><Radio value="pro" disabled /> Pro</label>
  </RadioGroup>
  <RadioGroup name="delivery">
    {#snippet legend()}Delivery{/snippet}
    <label><Radio value="standard" defaultChecked /> Standard</label>
  </RadioGroup>
  <Button variant="outline">Submit</Button>
</form>
`);
  await build({ root: fixture, configFile: false, plugins: [svelte()], build: { outDir: resolve(fixture, 'output') } });
  console.log(`External Svelte ${installedSvelte.version} consumer build passed.`);
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
