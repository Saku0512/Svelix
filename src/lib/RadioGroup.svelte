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
     * Selected value in controlled/bound mode. Use `null` for controlled no selection;
     * omit (`undefined`) to keep native uncontrolled behavior.
     */
    value?: string | null;
  };

  // Sentinel distinguishing an omitted (uncontrolled) `value` prop from a bound/controlled one.
  const VALUE_UNSET = Symbol('svelix.radio-group.value');

  let {
    legend,
    name,
    value = $bindable<string | null>(VALUE_UNSET as unknown as string | null),
    children,
    ...rest
  }: RadioGroupProps = $props();

  const fallbackId = $props.id();
  const fallbackName = `svelix-radio-group-${fallbackId}`;
  const resolvedName = $derived(name?.trim() || fallbackName);
  const isControlled = $derived(value !== (VALUE_UNSET as unknown as string | null));
  const initialValue = untrack(() =>
    value !== (VALUE_UNSET as unknown as string | null) ? value : null
  );

  const registeredRadios = new Set<RegisteredRadio>();

  type PendingReset = {
    canceled: boolean;
    valueAtReset: string | null;
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
            value !== null &&
            value !== undefined &&
            [...registeredRadios].some(
              (radio) =>
                radio.node.isConnected && radio.node.form !== form && radio.getValue() === value
            );
          if (!activeOwnedByOtherForm) {
            let defaultRadio: RegisteredRadio | undefined;
            for (const radio of matchingRadios) {
              if (radio.getDefaultChecked()) defaultRadio = radio;
            }
            // When no radio in the reset form has a checked default, native reset
            // leaves the form with no selection (`null`) while keeping controlled mode active.
            const nextValue: string | null = defaultRadio ? defaultRadio.getValue() : null;
            if (value !== nextValue) {
              applyingReset = true;
              value = nextValue;
              queueMicrotask(() => {
                applyingReset = false;
              });
            }
          }
        }

        // Re-sync DOM checked state only for owned radios belonging to the reset form.
        const current = value;
        for (const radio of matchingRadios) {
          radio.node.checked = current !== null && current !== undefined && radio.getValue() === current;
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
