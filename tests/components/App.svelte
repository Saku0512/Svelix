<script lang="ts">
  import { Button, Checkbox, Input, Radio, RadioGroup } from '../../src/lib/index.js';

  let keyboardActivations = $state(0);
  let disabledActivations = $state(0);
  let submissions = $state(0);
  let lastSubmitter = $state('');
  let boundValue = $state<string>();
  let accepted = $state(false);
  let size = $state('m');
  let toppings = $state<string[]>([]);
  let toppingChanges = $state(0);
  let moveableGroup = $state<string[]>(['x']);
  let moveableFormId = $state('form-a');
  let isolatedGroupA = $state<string[]>([]);
  let isolatedGroupB = $state<string[]>([]);
  let sameFormGroupOne = $state<string[]>([]);
  let sameFormGroupTwo = $state<string[]>([]);
  let crossFormSharedGroup = $state<string[]>([]);
  let showMountableGroup = $state(true);
  let mountableGroup = $state<string[]>([]);
  let uploads = $state<FileList | undefined>();
  let dynamicType = $state<'text' | 'checkbox'>('text');
  let dynamicText = $state('switchable');
  let dynamicChecked = $state(false);
  let cbControlled = $state(false);
  let cbIndeterminate = $state(true);
  let cbChanges = $state(0);
  let rgPlan = $state('pro');
  let rgChanges = $state(0);
  let rgSubmissions = $state(0);
  let rgUnnamed = $state('first');
  let rgCrossOwner = $state<string | null>('a');
  let rgDefaultVal = $state('custom');
  let rgExplicitUnchecked = $state<string | null>('a');
  let rgNullable = $state<string | null>(null);
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
    <!-- Avoid id/name "reset": that shadows HTMLFormElement.prototype.reset on the form. -->
    <Button id="form-reset" type="reset" variant="ghost">Reset</Button>
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

  <form id="form-a">
    <Button id="reset-form-a" type="reset" variant="ghost">Reset A</Button>
  </form>
  <form id="form-b">
    <Button id="reset-form-b" type="reset" variant="ghost">Reset B</Button>
  </form>
  <Input
    id="moveable-topping"
    type="checkbox"
    name="moveable"
    value="x"
    form={moveableFormId}
    bind:group={moveableGroup}
    defaultChecked={true}
    aria-label="Moveable topping"
  />
  <Button
    id="reassign-form"
    type="button"
    variant="secondary"
    onclick={() => {
      moveableFormId = moveableFormId === 'form-a' ? 'form-b' : 'form-a';
    }}
  >Reassign form</Button>
  <Button
    id="reset-then-select"
    type="button"
    variant="secondary"
    onclick={() => {
      const form = document.getElementById('native-form');
      if (form instanceof HTMLFormElement) form.reset();
      toppings = ['beans'];
    }}
  >Reset then select beans</Button>
  <Button
    id="synthetic-reset"
    type="button"
    variant="secondary"
    onclick={() => {
      document.getElementById('native-form')?.dispatchEvent(
        new Event('reset', { bubbles: true, cancelable: true })
      );
    }}
  >Synthetic reset</Button>
  <Button
    id="canceled-reset"
    type="button"
    variant="secondary"
    onclick={() => {
      const form = document.getElementById('native-form');
      if (!(form instanceof HTMLFormElement)) return;
      const cancel = (event: Event) => {
        event.preventDefault();
        form.removeEventListener('reset', cancel);
      };
      form.addEventListener('reset', cancel);
      form.reset();
    }}
  >Canceled reset</Button>
  <Button
    id="canceled-then-valid-reset"
    type="button"
    variant="secondary"
    onclick={() => {
      const form = document.getElementById('native-form');
      if (!(form instanceof HTMLFormElement)) return;
      const cancel = (event: Event) => {
        event.preventDefault();
        form.removeEventListener('reset', cancel);
      };
      form.addEventListener('reset', cancel);
      form.reset();
      form.reset();
    }}
  >Canceled then valid reset</Button>
  <Button
    id="double-valid-reset"
    type="button"
    variant="secondary"
    onclick={() => {
      const form = document.getElementById('native-form');
      if (!(form instanceof HTMLFormElement)) return;
      form.reset();
      form.reset();
    }}
  >Double valid reset</Button>

  <form id="isolated-form-a">
    <Input
      id="isolated-a-checkbox"
      type="checkbox"
      name="isolated-a"
      value="x"
      bind:group={isolatedGroupA}
      aria-label="Isolated form A checkbox"
    />
  </form>
  <form id="isolated-form-b">
    <Input
      id="isolated-b-checkbox"
      type="checkbox"
      name="isolated-b"
      value="y"
      bind:group={isolatedGroupB}
      aria-label="Isolated form B checkbox"
    />
  </form>
  <Button
    id="reset-a-then-update-b"
    type="button"
    variant="secondary"
    onclick={() => {
      const form = document.getElementById('isolated-form-a');
      if (form instanceof HTMLFormElement) form.reset();
      isolatedGroupB = ['y'];
    }}
  >Reset A then update B</Button>

  <form id="shared-groups-form">
    <Input
      id="shared-group-one"
      type="checkbox"
      name="shared-one"
      value="x"
      bind:group={sameFormGroupOne}
      aria-label="Shared form group one"
    />
    <Input
      id="shared-group-two"
      type="checkbox"
      name="shared-two"
      value="y"
      bind:group={sameFormGroupTwo}
      aria-label="Shared form group two"
    />
  </form>
  <Button
    id="reset-shared-then-update-two"
    type="button"
    variant="secondary"
    onclick={() => {
      const form = document.getElementById('shared-groups-form');
      if (form instanceof HTMLFormElement) form.reset();
      sameFormGroupTwo = ['y'];
    }}
  >Reset shared then update two</Button>

  <form id="cross-shared-form-a">
    <Input
      id="cross-shared-a"
      type="checkbox"
      name="cross-shared-a"
      value="x"
      bind:group={crossFormSharedGroup}
      aria-label="Cross-form shared group A"
    />
  </form>
  <form id="cross-shared-form-b">
    <Input
      id="cross-shared-b"
      type="checkbox"
      name="cross-shared-b"
      value="y"
      bind:group={crossFormSharedGroup}
      aria-label="Cross-form shared group B"
    />
  </form>
  <Button
    id="reset-cross-shared-both"
    type="button"
    variant="secondary"
    onclick={() => {
      const formA = document.getElementById('cross-shared-form-a');
      const formB = document.getElementById('cross-shared-form-b');
      if (formA instanceof HTMLFormElement) formA.reset();
      if (formB instanceof HTMLFormElement) formB.reset();
    }}
  >Reset both cross-shared forms</Button>

  <form id="mountable-group-form">
    {#if showMountableGroup}
      <Input
        id="mountable-group-checkbox"
        type="checkbox"
        name="mountable"
        value="m"
        bind:group={mountableGroup}
        aria-label="Mountable group checkbox"
      />
    {/if}
  </form>
  <Button
    id="toggle-mountable-group"
    type="button"
    variant="secondary"
    onclick={() => {
      showMountableGroup = !showMountableGroup;
    }}
  >Toggle mountable group</Button>

  <button id="plain-button">Plain button</button>
  <input id="plain-input" aria-label="Plain input" />
  <input id="plain-checkbox" type="checkbox" aria-label="Plain checkbox" />
  <fieldset id="plain-fieldset"><legend>Plain group</legend></fieldset>

  <form
    id="selection-form"
    onsubmit={(event) => {
      event.preventDefault();
      rgSubmissions += 1;
    }}
  >
    <span id="selection-tab-start" tabindex="-1"></span>
    <label for="cb-controlled">Controlled checkbox</label>
    <Checkbox
      id="cb-controlled"
      name="cb-controlled"
      value="yes"
      bind:checked={cbControlled}
      bind:indeterminate={cbIndeterminate}
      onchange={() => (cbChanges += 1)}
    />
    <label for="cb-disabled">Disabled checkbox</label>
    <Checkbox id="cb-disabled" name="cb-disabled" value="no" disabled checked />
    <label>
      <Checkbox id="cb-uncontrolled" name="cb-uncontrolled" value="on" defaultChecked />
      Uncontrolled checkbox
    </label>

    <RadioGroup id="rg-plan" legend="Billing plan" name="plan" bind:value={rgPlan}>
      <label>
        <Radio id="rg-plan-basic" value="basic" onchange={() => (rgChanges += 1)} />
        Basic
      </label>
      <label>
        <Radio id="rg-plan-disabled" value="legacy" disabled />
        Legacy
      </label>
      <label>
        <Radio id="rg-plan-pro" value="pro" onchange={() => (rgChanges += 1)} />
        Pro
      </label>
    </RadioGroup>

    <RadioGroup id="rg-uncontrolled" name="delivery">
      {#snippet legend()}Delivery method{/snippet}
      <label>
        <Radio id="rg-delivery-standard" value="standard" defaultChecked />
        Standard
      </label>
      <label>
        <Radio id="rg-delivery-express" value="express" />
        Express
      </label>
    </RadioGroup>

    <RadioGroup id="rg-disabled-group" legend="Disabled group" name="locked" disabled>
      <label>
        <Radio id="rg-locked-a" value="a" defaultChecked />
        Locked A
      </label>
      <label>
        <Radio id="rg-locked-b" value="b" />
        Locked B
      </label>
    </RadioGroup>

    <Button id="selection-submit">Submit selection</Button>
    <Button id="selection-reset" type="reset" variant="ghost">Reset selection</Button>
    <Button
      id="selection-reset-then-set"
      type="button"
      variant="secondary"
      onclick={() => {
        const form = document.getElementById('selection-form');
        if (form instanceof HTMLFormElement) form.reset();
        rgPlan = 'basic';
      }}
    >Reset then set basic</Button>

    <RadioGroup id="rg-unnamed" legend="Unnamed group" bind:value={rgUnnamed}>
      <label><Radio id="rg-unnamed-first" value="first" /> First</label>
      <label><Radio id="rg-unnamed-second" name="overridden" value="second" /> Second</label>
    </RadioGroup>

    <RadioGroup id="rg-default-value" legend="Omitted value group" name="default-val" bind:value={rgDefaultVal}>
      <label><Radio id="rg-omitted-value" /> Omitted value</label>
      <label><Radio id="rg-explicit-value" value="custom" /> Custom value</label>
    </RadioGroup>
  </form>

  <form id="rg-owner-form-a">
    <RadioGroup id="rg-cross-owner" legend="Cross-form owner group" name="cross-owner" bind:value={rgCrossOwner}>
      <label><Radio id="rg-owner-a" value="a" /> Owner A</label>
      <label><Radio id="rg-owner-b" value="b" form="rg-owner-form-b" /> Owner B</label>
      <label><input id="rg-unrelated-native" type="radio" name="unrelated-native" value="u" checked /> Unrelated native</label>
    </RadioGroup>
  </form>
  <form id="rg-owner-form-b"></form>

  <form id="rg-explicit-unchecked-form">
    <RadioGroup
      id="rg-explicit-unchecked"
      legend="Explicit unchecked defaults"
      name="explicit-unchecked"
      bind:value={rgExplicitUnchecked}
    >
      <label><Radio id="rg-eu-a" value="a" defaultChecked={false} /> Option A</label>
      <label><Radio id="rg-eu-b" value="b" defaultChecked={false} /> Option B</label>
    </RadioGroup>
  </form>

  <form id="rg-nullable-form">
    <RadioGroup
      id="rg-nullable"
      legend="Initially empty controlled group"
      name="nullable-choice"
      bind:value={rgNullable}
    >
      <label><Radio id="rg-null-a" value="a" /> Choice A</label>
      <label><Radio id="rg-null-b" value="b" /> Choice B</label>
    </RadioGroup>
    <Button
      id="rg-nullable-clear"
      type="button"
      variant="secondary"
      onclick={() => {
        rgNullable = null;
      }}
    >Clear selection</Button>
  </form>

  <output id="keyboard-count">{keyboardActivations}</output>
  <output id="disabled-count">{disabledActivations}</output>
  <output id="submission-count">{submissions}</output>
  <output id="last-submitter">{lastSubmitter}</output>
  <output id="bound-value">{boundValue}</output>
  <output id="accepted-value">{String(accepted)}</output>
  <output id="size-value">{size}</output>
  <output id="toppings-value">{toppings.join(',')}</output>
  <output id="topping-changes">{toppingChanges}</output>
  <output id="moveable-group">{moveableGroup.join(',')}</output>
  <output id="moveable-form">{moveableFormId}</output>
  <output id="isolated-a-group">{isolatedGroupA.join(',')}</output>
  <output id="isolated-b-group">{isolatedGroupB.join(',')}</output>
  <output id="shared-one-group">{sameFormGroupOne.join(',')}</output>
  <output id="shared-two-group">{sameFormGroupTwo.join(',')}</output>
  <output id="cross-shared-group">{crossFormSharedGroup.join(',')}</output>
  <output id="upload-count">{uploads?.length ?? 0}</output>
  <output id="upload-name">{uploads?.[0]?.name ?? ''}</output>
  <output id="dynamic-type">{dynamicType}</output>
  <output id="dynamic-text">{dynamicText}</output>
  <output id="dynamic-checked">{String(dynamicChecked)}</output>
  <output id="cb-controlled-value">{String(cbControlled)}</output>
  <output id="cb-indeterminate-value">{String(cbIndeterminate)}</output>
  <output id="cb-changes-value">{cbChanges}</output>
  <output id="rg-plan-value">{rgPlan}</output>
  <output id="rg-changes-value">{rgChanges}</output>
  <output id="rg-submissions-value">{rgSubmissions}</output>
  <output id="rg-unnamed-value">{rgUnnamed}</output>
  <output id="rg-cross-owner-value">{rgCrossOwner === null ? 'null' : rgCrossOwner}</output>
  <output id="rg-default-val-value">{rgDefaultVal}</output>
  <output id="rg-explicit-unchecked-value">{rgExplicitUnchecked === null ? 'null' : rgExplicitUnchecked}</output>
  <output id="rg-nullable-value">{rgNullable === null ? 'null' : rgNullable}</output>
</section>

<section data-svelix-theme="dark" id="dark-theme">
  <Button id="dark-primary">Dark primary</Button>
  <Input id="dark-email" type="email" aria-label="Dark email" value="dark@example.com" />
  <Input id="dark-checkbox" type="checkbox" aria-label="Dark checkbox" checked />
  <Checkbox id="dark-svelix-checkbox" aria-label="Dark Svelix checkbox" defaultChecked />
  <RadioGroup id="dark-radio-group" legend="Dark options" name="dark-opt">
    <label><Radio id="dark-radio-a" value="a" defaultChecked /> Option A</label>
  </RadioGroup>
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
