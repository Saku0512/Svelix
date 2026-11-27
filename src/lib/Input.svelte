<script lang="ts">
  import { untrack } from 'svelte';
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
    onchange,
    ...rest
  }: InputProps = $props();

  const kind = $derived(String(type ?? 'text').toLowerCase());
  const usesGroup = $derived(group !== (GROUP_UNSET as unknown as InputGroup));
  const groupValues = $derived(Array.isArray(group) ? group : []);
  const checkedInGroup = $derived(groupValues.some((item) => item === value));

  // Capture the reset baseline once. Do not derive it from the live checked/group
  // state, or user interaction would rewrite the native default.
  const snapshotDefaultChecked = untrack(() => {
    if (defaultChecked !== undefined) return Boolean(defaultChecked);
    if (group !== (GROUP_UNSET as unknown as InputGroup)) {
      return Array.isArray(group) && group.some((item) => item === value);
    }
    return Boolean(checked);
  });

  function syncCheckboxGroup(event: Event & { currentTarget: HTMLInputElement }) {
    syncGroupMembershipFromDom(event.currentTarget);
  }

  function syncGroupMembershipFromDom(node: HTMLInputElement) {
    const option = value as string | number | boolean;
    const selected = Array.isArray(group) ? [...group] : [];
    const has = selected.some((item) => item === option);
    if (node.checked === has) return;
    group = node.checked
      ? [...selected, option]
      : selected.filter((item) => item !== option);
  }

  function handleGroupedCheckboxChange(event: Event & { currentTarget: HTMLInputElement }) {
    syncCheckboxGroup(event);
    onchange?.(event);
  }

  function attachGroupedCheckboxReset(node: HTMLInputElement) {
    const form = node.form;
    if (!form) return;

    const onReset = () => {
      queueMicrotask(() => syncGroupMembershipFromDom(node));
    };
    form.addEventListener('reset', onReset);
    return () => form.removeEventListener('reset', onReset);
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
      defaultChecked={snapshotDefaultChecked}
      onchange={handleGroupedCheckboxChange}
      {@attach attachGroupedCheckboxReset}
    />
  {:else}
    <input
      {...rest}
      type="checkbox"
      bind:checked
      {value}
      defaultChecked={snapshotDefaultChecked}
      {onchange}
    />
  {/if}
{:else if kind === 'radio'}
  {#if usesGroup}
    <input {...rest} type="radio" bind:group={group} {value} {onchange} />
  {:else}
    <input
      {...rest}
      type="radio"
      {value}
      checked={checked}
      defaultChecked={snapshotDefaultChecked}
      {onchange}
    />
  {/if}
{:else if kind === 'file'}
  <input {...rest} type="file" bind:files {onchange} />
{:else}
  <input {...rest} {type} bind:value {onchange} />
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
