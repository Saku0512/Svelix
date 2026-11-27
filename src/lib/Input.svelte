<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';

  type InputGroup = string | number | boolean | (string | number | boolean)[] | null;

  type InputProps = Omit<HTMLInputAttributes, 'children'> & {
    /**
     * Svelte `bind:group` target for radio sets and checkbox groups.
     * Omit it to keep native checked/defaultChecked behavior.
     * When binding, provide a non-undefined initial value (use `null` or `[]` if needed).
     */
    group?: InputGroup;
  };

  // Fallback only applies when `group` is neither passed nor bound, so unbound
  // radios/checkboxes can keep native checked/defaultChecked behavior.
  const GROUP_UNSET = Symbol('svelix.input.group');

  let {
    type = 'text',
    value = $bindable(),
    checked = $bindable(),
    files = $bindable(),
    group = $bindable(GROUP_UNSET as unknown as InputGroup),
    defaultChecked,
    ...rest
  }: InputProps = $props();

  const kind = $derived(String(type ?? 'text').toLowerCase());
  const usesGroup = $derived(group !== (GROUP_UNSET as unknown as InputGroup));
  // When only `checked` is provided, mirror it to defaultChecked so form reset
  // restores the native default instead of clearing the control.
  const uncheckedDefault = $derived(defaultChecked ?? checked);
  const groupValues = $derived(Array.isArray(group) ? group : []);
  const checkedInGroup = $derived(groupValues.some((item) => item === value));

  function syncCheckboxGroup(event: Event & { currentTarget: HTMLInputElement }) {
    const option = value as string | number | boolean;
    const selected = Array.isArray(group) ? [...group] : [];
    if (event.currentTarget.checked) {
      group = selected.includes(option) ? selected : [...selected, option];
      return;
    }
    group = selected.filter((item) => item !== option);
  }
</script>

{#if kind === 'checkbox'}
  {#if usesGroup}
    <!--
      Svelte's bind:group for checkboxes only accumulates within one component
      instance, so cross-Input checkbox groups sync the array explicitly.
    -->
    <input
      {...rest}
      type="checkbox"
      {value}
      checked={checkedInGroup}
      defaultChecked={checkedInGroup}
      onchange={syncCheckboxGroup}
    />
  {:else}
    <input {...rest} type="checkbox" bind:checked {value} defaultChecked={uncheckedDefault} />
  {/if}
{:else if kind === 'radio'}
  {#if usesGroup}
    <input {...rest} type="radio" bind:group={group} {value} />
  {:else}
    <input
      {...rest}
      type="radio"
      {value}
      checked={checked}
      defaultChecked={uncheckedDefault}
    />
  {/if}
{:else if kind === 'file'}
  <input {...rest} type="file" bind:files />
{:else}
  <input {...rest} {type} bind:value />
{/if}

<style>
  :where(input) {
    box-sizing: border-box;
    max-inline-size: 100%;
    font: inherit;
    font-size: max(1rem, 1em);
    color: var(--svelix-foreground);
  }

  :where(input:is([type='checkbox'], [type='radio'])) {
    accent-color: var(--svelix-primary);
  }

  :where(
    input:not(
      :is(
        [type='button'],
        [type='checkbox'],
        [type='color'],
        [type='file'],
        [type='hidden'],
        [type='image'],
        [type='radio'],
        [type='range'],
        [type='reset'],
        [type='submit']
      )
    )
  ) {
    min-block-size: 3rem;
    padding-block: var(--svelix-spacing-xs);
    padding-inline: var(--svelix-spacing-sm);
    border: var(--svelix-border-width) solid var(--svelix-border);
    border-radius: var(--svelix-radius-sm);
    background-color: var(--svelix-background);
    line-height: 1.5;
  }

  :where(input::placeholder) {
    color: var(--svelix-muted-foreground);
    opacity: 1;
  }

  :where(input:focus-visible) {
    outline: var(--svelix-focus-ring-width) solid var(--svelix-focus-ring);
    outline-offset: var(--svelix-focus-ring-offset);
  }

  :where(input:user-invalid, input[aria-invalid='true']) {
    border-color: var(--svelix-danger);
  }

  :where(input:disabled, input[readonly]) {
    background-color: var(--svelix-muted);
    color: var(--svelix-muted-foreground);
  }

  :where(input:disabled) {
    cursor: not-allowed;
  }
</style>
