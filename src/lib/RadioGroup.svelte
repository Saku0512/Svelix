<script lang="ts">
  import { untrack, type Snippet } from 'svelte';
  import type { HTMLFieldsetAttributes } from 'svelte/elements';
  import { setRadioGroupContext } from './radio-group-context.js';

  type RadioGroupProps = HTMLFieldsetAttributes & {
    /**
     * Accessible group label rendered inside `<legend>` as a string or Snippet.
     * Omit to provide your own `<legend>` as the first child.
     */
    legend?: string | Snippet;
    /**
     * Native `name` attribute shared with descendant `<Radio>` controls.
     */
    name?: string;
    /**
     * Selected value in controlled/bound mode. Omit to keep native uncontrolled behavior.
     */
    value?: string;
  };

  // Sentinel distinguishing an omitted (uncontrolled) `value` prop from a bound/controlled one.
  const VALUE_UNSET = Symbol('svelix.radio-group.value');

  let {
    legend,
    name,
    value = $bindable(VALUE_UNSET as unknown as string),
    children,
    ...rest
  }: RadioGroupProps = $props();

  const isControlled = $derived(value !== (VALUE_UNSET as unknown as string));
  const initialValue = untrack(() =>
    value !== (VALUE_UNSET as unknown as string) ? value : undefined
  );

  type PendingReset = {
    canceled: boolean;
    valueAtReset: string | undefined;
  };

  // Track only pending resets belonging to this RadioGroup instance.
  const pendingResets = new Set<PendingReset>();
  let applyingReset = false;

  $effect(() => {
    if (!isControlled) return;
    const current = value;
    if (applyingReset) return;
    for (const entry of pendingResets) {
      if (current !== entry.valueAtReset) {
        entry.canceled = true;
      }
    }
  });

  setRadioGroupContext({
    getName: () => name,
    isControlled: () => isControlled,
    getValue: () => (isControlled ? value : undefined),
    getInitialValue: () => initialValue,
    setValue: (next: string) => {
      if (isControlled) value = next;
    }
  });

  function attachRadioGroupReset(fieldset: HTMLFieldSetElement) {
    // Listen on document in capture so ownership can change via the `form` attribute.
    const onReset = (event: Event) => {
      if (!isControlled) return;
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || fieldset.form !== form) return;
      // Handle native user activation and form.reset(); ignore synthetic reset events.
      if (!event.isTrusted) return;

      const entry: PendingReset = {
        canceled: false,
        valueAtReset: value
      };
      pendingResets.add(entry);

      setTimeout(() => {
        pendingResets.delete(entry);
        if (event.defaultPrevented || !fieldset.isConnected || fieldset.form !== form) return;
        if (!entry.canceled && value !== initialValue) {
          applyingReset = true;
          value = initialValue as string;
          queueMicrotask(() => {
            applyingReset = false;
          });
        }
        // Re-sync DOM checked state with the live value after native reset.
        const current = value;
        for (const input of fieldset.querySelectorAll<HTMLInputElement>('input[type="radio"]')) {
          if (name && input.name !== name) continue;
          input.checked = current !== undefined && input.value === current;
        }
      }, 0);
    };

    document.addEventListener('reset', onReset, true);
    return () => {
      document.removeEventListener('reset', onReset, true);
      pendingResets.clear();
    };
  }
</script>

<fieldset {...rest} {@attach attachRadioGroupReset}>
  {#if typeof legend === 'string'}
    <legend>{legend}</legend>
  {:else if legend}
    <legend>{@render legend()}</legend>
  {/if}
  {@render children?.()}
</fieldset>

<style>
  :where(fieldset) {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: var(--svelix-spacing-sm);
    margin: 0;
    padding: var(--svelix-spacing-sm);
    border: var(--svelix-border-width) solid var(--svelix-border);
    border-radius: var(--svelix-radius-sm);
    color: var(--svelix-foreground);
  }

  :where(legend) {
    padding-inline: var(--svelix-spacing-xs);
    color: var(--svelix-foreground);
    font-weight: 600;
  }

  :where(fieldset:disabled),
  :where(fieldset:disabled legend) {
    color: var(--svelix-muted-foreground);
  }
</style>
