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

  // Inside a RadioGroup, always use the group's name so native mutual exclusion
  // cannot diverge from the shared controlled model.
  const resolvedName = $derived(groupContext ? groupContext.getName() : name);
  const usesGroupValue = $derived(Boolean(groupContext?.isControlled()));
  // Native radio inputs default their DOM value and FormData payload to "on" when omitted.
  const resolvedValue = $derived(value === undefined || value === null ? 'on' : String(value));
  const isChecked = $derived(usesGroupValue ? groupContext?.getValue() === resolvedValue : checked);

  const snapshotDefaultChecked = untrack(() => {
    if (defaultChecked !== undefined) return Boolean(defaultChecked);
    if (groupContext?.isControlled()) {
      return groupContext.getInitialValue() === resolvedValue;
    }
    return checked !== undefined ? Boolean(checked) : undefined;
  });

  function attachGroupRegistration(node: HTMLInputElement) {
    if (!groupContext) return;
    return groupContext.registerRadio({
      node,
      getValue: () => resolvedValue,
      getDefaultChecked: () => Boolean(snapshotDefaultChecked)
    });
  }

  function handleChange(event: Event & { currentTarget: HTMLInputElement }) {
    if (usesGroupValue && event.currentTarget.checked) {
      groupContext?.setValue(resolvedValue);
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
    {@attach attachGroupRegistration}
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
    {@attach attachGroupRegistration}
  />
{:else}
  <input
    {...rest}
    type="radio"
    name={resolvedName}
    {value}
    {defaultChecked}
    {onchange}
    {@attach attachGroupRegistration}
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
