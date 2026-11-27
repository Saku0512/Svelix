<script lang="ts">
  import { untrack, type Snippet } from 'svelte';
  import type { HTMLFieldsetAttributes } from 'svelte/elements';
  import { setRadioGroupContext, type RegisteredRadio } from './radio-group-context.js';

  type RadioGroupProps = HTMLFieldsetAttributes & {
    /**
     * Accessible group label rendered inside `<legend>` as a string or Snippet.
     * Omit to provide your own `<legend>` as the first child.
     */
    legend?: string | Snippet;
    /**
     * Native `name` attribute shared with all descendant `<Radio>` controls.
     * When omitted or blank, an SSR-safe unique name is generated so native
     * radio mutual exclusion still works.
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

  const fallbackId = $props.id();
  const fallbackName = `svelix-radio-group-${fallbackId}`;
  const resolvedName = $derived(name?.trim() || fallbackName);
  const isControlled = $derived(value !== (VALUE_UNSET as unknown as string));
  const initialValue = untrack(() =>
    value !== (VALUE_UNSET as unknown as string) ? value : undefined
  );

  const registeredRadios = new Set<RegisteredRadio>();

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
    getName: () => resolvedName,
    isControlled: () => isControlled,
    getValue: () => (isControlled ? value : undefined),
    getInitialValue: () => initialValue,
    setValue: (next: string) => {
      if (isControlled) value = next;
    },
    registerRadio: (entry: RegisteredRadio) => {
      registeredRadios.add(entry);
      return () => {
        registeredRadios.delete(entry);
      };
    }
  });

  function attachRadioGroupReset(_fieldset: HTMLFieldSetElement) {
    // Listen on document in capture and match each owned Radio's actual `node.form`
    // rather than querying descendant inputs or assuming `fieldset.form` ownership.
    const onReset = (event: Event) => {
      if (!isControlled) return;
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      // Handle native user activation and form.reset(); ignore synthetic reset events.
      if (!event.isTrusted) return;

      const hasMatchingRadio = [...registeredRadios].some(
        (radio) => radio.node.isConnected && radio.node.form === form
      );
      if (!hasMatchingRadio) return;

      const entry: PendingReset = {
        canceled: false,
        valueAtReset: value
      };
      pendingResets.add(entry);

      setTimeout(() => {
        pendingResets.delete(entry);
        if (event.defaultPrevented) return;

        const matchingRadios = [...registeredRadios].filter(
          (radio) => radio.node.isConnected && radio.node.form === form
        );
        if (matchingRadios.length === 0) return;

        if (!entry.canceled) {
          const activeOwnedByOtherForm =
            value !== undefined &&
            [...registeredRadios].some(
              (radio) =>
                radio.node.isConnected && radio.node.form !== form && radio.getValue() === value
            );
          if (!activeOwnedByOtherForm) {
            const defaultRadio = matchingRadios.find((radio) => radio.getDefaultChecked());
            const nextValue = defaultRadio ? defaultRadio.getValue() : initialValue;
            if (value !== nextValue) {
              applyingReset = true;
              value = nextValue as string;
              queueMicrotask(() => {
                applyingReset = false;
              });
            }
          }
        }

        // Re-sync DOM checked state only for owned radios belonging to the reset form.
        const current = value;
        for (const radio of matchingRadios) {
          radio.node.checked = current !== undefined && radio.getValue() === current;
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
