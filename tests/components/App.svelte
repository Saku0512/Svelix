<script lang="ts">
  import { Button, Input } from '../../src/lib/index.js';

  let keyboardActivations = $state(0);
  let disabledActivations = $state(0);
  let submissions = $state(0);
  let lastSubmitter = $state('');
  let boundValue = $state<string>();

  function handleSubmit(event: SubmitEvent & { currentTarget: HTMLFormElement }) {
    event.preventDefault();
    submissions += 1;
    lastSubmitter = event.submitter?.id ?? '';
  }
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

  <form id="native-form" onsubmit={handleSubmit}>
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

  <button id="plain-button">Plain button</button>
  <input id="plain-input" aria-label="Plain input" />

  <output id="keyboard-count">{keyboardActivations}</output>
  <output id="disabled-count">{disabledActivations}</output>
  <output id="submission-count">{submissions}</output>
  <output id="last-submitter">{lastSubmitter}</output>
  <output id="bound-value">{boundValue}</output>
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
