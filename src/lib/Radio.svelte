<script lang="ts">
  import { untrack } from 'svelte';
  import type { HTMLInputAttributes } from 'svelte/elements';
  import { getRadioGroupContext, type RadioGroupContext } from './radio-group-context.js';

  type RadioProps = Omit<HTMLInputAttributes, 'children' | 'type'>;

  let {
    name,
    value,
    checked,
    defaultChecked,
    onchange,
    ...rest
  }: RadioProps = $props();

  let groupContext: RadioGroupContext | undefined;
  try {
    groupContext = getRadioGroupContext();
  } catch {
    // When used outside a RadioGroup, fall back to standard native radio behavior.
    groupContext = undefined;
  }

  const resolvedName = $derived(name ?? groupContext?.getName());
  const usesGroupValue = $derived(Boolean(groupContext?.isControlled()));
  const stringValue = $derived(value === undefined || value === null ? '' : String(value));
  const isChecked = $derived(usesGroupValue ? groupContext?.getValue() === stringValue : checked);

  const snapshotDefaultChecked = untrack(() => {
    if (defaultChecked !== undefined) return Boolean(defaultChecked);
    if (groupContext?.isControlled()) {
      return groupContext.getInitialValue() === stringValue;
    }
    return checked !== undefined ? Boolean(checked) : undefined;
  });

  function handleChange(event: Event & { currentTarget: HTMLInputElement }) {
    if (usesGroupValue && event.currentTarget.checked) {
      groupContext?.setValue(stringValue);
    }
    onchange?.(event);
  }
</script>

{#if usesGroupValue}
  <input
    {...rest}
    type="radio"
    name={resolvedName}
    {value}
    checked={isChecked}
    defaultChecked={snapshotDefaultChecked}
    onchange={handleChange}
  />
{:else if checked !== undefined}
  <input
    {...rest}
    type="radio"
    name={resolvedName}
    {value}
    {checked}
    defaultChecked={snapshotDefaultChecked}
    {onchange}
  />
{:else}
  <input
    {...rest}
    type="radio"
    name={resolvedName}
    {value}
    {defaultChecked}
    {onchange}
  />
{/if}

<style>
  :where(input[type='radio']) {
    box-sizing: border-box;
    inline-size: 1.25em;
    aspect-ratio: 1;
    margin: 0;
    accent-color: var(--svelix-primary);
    border-color: var(--svelix-border);
    color: var(--svelix-foreground);
    cursor: pointer;
    vertical-align: middle;
  }

  :where(input[type='radio']:focus-visible) {
    outline: var(--svelix-focus-ring-width) solid var(--svelix-focus-ring);
    outline-offset: var(--svelix-focus-ring-offset);
  }

  :where(input[type='radio']:user-invalid, input[type='radio'][aria-invalid='true']) {
    accent-color: var(--svelix-danger);
  }

  :where(input[type='radio']:disabled) {
    accent-color: var(--svelix-muted-foreground);
    cursor: not-allowed;
  }
</style>
