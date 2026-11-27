<script lang="ts">
  import { Button, Input } from '../../src/lib/index.js';

  let keyboardActivations = $state(0);
  let disabledActivations = $state(0);
  let submissions = $state(0);
  let lastSubmitter = $state('');
  let boundValue = $state<string>();
  let accepted = $state(false);
  let size = $state('m');
  let toppings = $state<string[]>([]);
  let toppingChanges = $state(0);
  let uploads = $state<FileList | undefined>();
  let dynamicType = $state<'text' | 'checkbox'>('text');
  let dynamicText = $state('switchable');
  let dynamicChecked = $state(false);
</script>

<section data-svelix-theme="light">
  <span id="tab-start" tabindex="-1"></span>
  <Button id="keyboard" onclick={() => (keyboardActivations += 1)}>Keyboard action</Button>
  <Button id="disabled" disabled onclick={() => (disabledActivations += 1)}>Disabled</Button>
  <Input id="disabled-input" aria-label="Disabled input" disabled />
  <Input id="tab-input" aria-label="Tab destination" />

  <Button id="secondary" variant="secondary">Secondary</Button>
  <Button id="outline" variant="outline">Outline</Button>
  <Button id="ghost" variant="ghost">Ghost</Button>
  <Button id="custom-button" class="consumer-button">Custom</Button>

  <form id="native-form" onsubmit={(event) => {
    event.preventDefault();
    submissions += 1;
    lastSubmitter = event.submitter?.id ?? '';
  }}>
    <label for="email">Email address</label>
    <Input
      id="email"
      name="email"
      type="email"
      autocomplete="email"
      required
      value="person@example.com"
    />

    <label for="bound">Bound value</label>
    <Input id="bound" name="bound" bind:value={boundValue} defaultValue="initial" />

    <label>
      <Input id="accepted" name="accepted" type="checkbox" bind:checked={accepted} value="yes" />
      Accept terms
    </label>

    <fieldset>
      <legend>Size</legend>
      <label>
        <Input id="size-s" type="radio" name="size" value="s" bind:group={size} />
        S
      </label>
      <label>
        <Input id="size-m" type="radio" name="size" value="m" bind:group={size} />
        M
      </label>
    </fieldset>

    <fieldset>
      <legend>Toppings</legend>
      <label>
        <Input
          id="topping-rice"
          type="checkbox"
          name="topping"
          value="rice"
          bind:group={toppings}
          defaultChecked={true}
          onchange={() => (toppingChanges += 1)}
        />
        Rice
      </label>
      <label>
        <Input
          id="topping-beans"
          type="checkbox"
          name="topping"
          value="beans"
          bind:group={toppings}
          onchange={() => (toppingChanges += 1)}
        />
        Beans
      </label>
    </fieldset>

    <fieldset>
      <legend>Plain size</legend>
      <label>
        <Input id="plain-radio-a" type="radio" name="plain" value="a" />
        A
      </label>
      <label>
        <Input id="plain-radio-b" type="radio" name="plain" value="b" checked />
        B
      </label>
    </fieldset>

    <label for="upload">Upload</label>
    <Input id="upload" name="upload" type="file" bind:files={uploads} />

    <Input id="mixed-case-checkbox" type="CHECKBOX" aria-label="Mixed case checkbox" />

    <Button id="submit" name="intent" value="save">Save</Button>
    <Button id="no-submit" type="button" variant="secondary">No submit</Button>
    <Button id="reset" type="reset" variant="ghost">Reset</Button>
  </form>

  <label for="readonly">Readonly value</label>
  <Input id="readonly" value="Read only" readonly />

  <label for="invalid">Invalid value</label>
  <Input id="invalid" aria-invalid={true} aria-describedby="invalid-error" />
  <span id="invalid-error">Enter a valid value.</span>

  <label for="native-invalid">Native constraint</label>
  <Input id="native-invalid" pattern="[0-9]{4}" required value="abc" />

  <Input id="custom-input" class="consumer-input" aria-label="Custom input" />

  <Input
    id="dynamic"
    aria-label="Dynamic input"
    type={dynamicType}
    bind:value={dynamicText}
    bind:checked={dynamicChecked}
  />
  <Button id="toggle-dynamic-type" type="button" onclick={() => {
    dynamicType = dynamicType === 'text' ? 'checkbox' : 'text';
  }}>Toggle dynamic type</Button>

  <button id="plain-button">Plain button</button>
  <input id="plain-input" aria-label="Plain input" />

  <output id="keyboard-count">{keyboardActivations}</output>
  <output id="disabled-count">{disabledActivations}</output>
  <output id="submission-count">{submissions}</output>
  <output id="last-submitter">{lastSubmitter}</output>
  <output id="bound-value">{boundValue}</output>
  <output id="accepted-value">{String(accepted)}</output>
  <output id="size-value">{size}</output>
  <output id="toppings-value">{toppings.join(',')}</output>
  <output id="topping-changes">{toppingChanges}</output>
  <output id="upload-count">{uploads?.length ?? 0}</output>
  <output id="upload-name">{uploads?.[0]?.name ?? ''}</output>
  <output id="dynamic-type">{dynamicType}</output>
  <output id="dynamic-text">{dynamicText}</output>
  <output id="dynamic-checked">{String(dynamicChecked)}</output>
</section>

<section data-svelix-theme="dark" id="dark-theme">
  <Button id="dark-primary">Dark primary</Button>
  <Input id="dark-email" type="email" aria-label="Dark email" value="dark@example.com" />
  <Input id="dark-checkbox" type="checkbox" aria-label="Dark checkbox" checked />
</section>

<style>
  :global(.consumer-button) {
    background-color: rgb(4 120 87);
    color: white;
  }

  :global(.consumer-input) {
    --svelix-border: rgb(124 58 237);
  }
</style>
