<script lang="ts">
  import { untrack } from 'svelte';
  import type { HTMLInputAttributes } from 'svelte/elements';

  type CheckboxProps = Omit<HTMLInputAttributes, 'children' | 'type'>;

  // Sentinel distinguishing an omitted (uncontrolled) `checked` prop from a bound/controlled one.
  const CHECKED_UNSET = Symbol('svelix.checkbox.checked');

  let {
    checked = $bindable(CHECKED_UNSET as unknown as boolean),
    indeterminate = $bindable(false),
    defaultChecked,
    ...rest
  }: CheckboxProps = $props();

  const isControlled = $derived(checked !== (CHECKED_UNSET as unknown as boolean));

  // Snapshot the mount-time default in controlled/bound mode so native form.reset() restores it.
  const snapshotDefaultChecked = untrack(() => {
    if (defaultChecked !== undefined) return Boolean(defaultChecked);
    if (checked !== (CHECKED_UNSET as unknown as boolean)) return Boolean(checked);
    return undefined;
  });
</script>

{#if isControlled}
  <input
    {...rest}
    type="checkbox"
    bind:checked
    bind:indeterminate
    defaultChecked={snapshotDefaultChecked}
  />
{:else}
  <input
    {...rest}
    type="checkbox"
    bind:indeterminate
    {defaultChecked}
  />
{/if}

<style>
  :where(input[type='checkbox']) {
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

  :where(input[type='checkbox']:focus-visible) {
    outline: var(--svelix-focus-ring-width) solid var(--svelix-focus-ring);
    outline-offset: var(--svelix-focus-ring-offset);
  }

  :where(input[type='checkbox']:user-invalid, input[type='checkbox'][aria-invalid='true']) {
    accent-color: var(--svelix-danger);
  }

  :where(input[type='checkbox']:disabled) {
    accent-color: var(--svelix-muted-foreground);
    cursor: not-allowed;
  }
</style>
