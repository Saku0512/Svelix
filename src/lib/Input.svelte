<script lang="ts" module>
  const formsBeingReset = new WeakSet<HTMLFormElement>();
  let formResetPatchInstalled = false;
  let suppressResetCancel = false;
  const pendingResetCancels = new Set<() => void>();

  type ResetBatch = {
    restores: Array<() => void>;
    syncDoms: Array<() => void>;
    event: Event;
    active: boolean;
  };

  const pendingFormResets = new WeakMap<HTMLFormElement, ResetBatch>();

  function cancelPendingResets() {
    if (suppressResetCancel) return;
    for (const cancel of pendingResetCancels) cancel();
    pendingResetCancels.clear();
  }

  function ensureFormResetPatch() {
    if (formResetPatchInstalled || typeof HTMLFormElement === 'undefined') return;
    formResetPatchInstalled = true;
    const original = HTMLFormElement.prototype.reset;
    if (typeof original !== 'function') return;
    HTMLFormElement.prototype.reset = function patchedReset(this: HTMLFormElement) {
      formsBeingReset.add(this);
      try {
        return original.call(this);
      } finally {
        setTimeout(() => formsBeingReset.delete(this), 0);
      }
    };
  }
</script>

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

  // Capture the reset baseline once at mount. Explicit defaultChecked is also
  // frozen here; later prop updates do not retarget the native reset default.
  const snapshotDefaultChecked = untrack(() => {
    if (defaultChecked !== undefined) return Boolean(defaultChecked);
    if (group !== (GROUP_UNSET as unknown as InputGroup)) {
      return Array.isArray(group) && group.some((item) => item === value);
    }
    return Boolean(checked);
  });

  // A later checkbox-group write cancels deferred reset restores so app code
  // that runs immediately after form.reset() keeps its selection.
  $effect(() => {
    if (kind !== 'checkbox' || !usesGroup) return;
    group;
    cancelPendingResets();
  });

  function syncGroupMembership(include: boolean, fromReset = false) {
    const option = value as string | number | boolean;
    const selected = Array.isArray(group) ? [...group] : [];
    const has = selected.some((item) => item === option);
    if (include === has) return;
    if (fromReset) suppressResetCancel = true;
    group = include
      ? [...selected, option]
      : selected.filter((item) => item !== option);
    if (fromReset) {
      queueMicrotask(() => {
        suppressResetCancel = false;
      });
    }
  }

  function handleGroupedCheckboxChange(event: Event & { currentTarget: HTMLInputElement }) {
    syncGroupMembership(event.currentTarget.checked);
    onchange?.(event);
  }

  function attachGroupedCheckboxReset(node: HTMLInputElement) {
    ensureFormResetPatch();

    // Listen on document in capture so ownership can change via the `form`
    // attribute without rebinding. Defer with a macrotask: in Chromium, a
    // trusted user reset still observes pre-reset checked state inside a
    // microtask scheduled from the reset handler. After native reset, the
    // controlled checked={group} binding can overwrite the DOM again, so
    // restore membership from the frozen default rather than node.checked.
    // Multiple grouped Inputs coalesce into one batch so sibling restores are
    // not mistaken for a newer application write.
    const onReset = (event: Event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || node.form !== form) return;
      // User activation is trusted; form.reset() is marked by the prototype patch.
      // Synthetic dispatchEvent('reset') is neither and must not rewrite group.
      if (!(event.isTrusted || formsBeingReset.has(form))) return;

      let batch = pendingFormResets.get(form);
      if (!batch) {
        const scheduled: ResetBatch = {
          restores: [],
          syncDoms: [],
          event,
          active: true
        };
        batch = scheduled;
        pendingFormResets.set(form, scheduled);
        const cancel = () => {
          scheduled.active = false;
        };
        pendingResetCancels.add(cancel);
        setTimeout(() => {
          pendingFormResets.delete(form);
          pendingResetCancels.delete(cancel);
          if (scheduled.event.defaultPrevented) return;
          if (scheduled.active) {
            suppressResetCancel = true;
            for (const restore of scheduled.restores) restore();
            queueMicrotask(() => {
              suppressResetCancel = false;
            });
          }
          // Native reset can clear checked even when membership is unchanged,
          // so re-apply the live group to the DOM after restore or cancel.
          for (const syncDom of scheduled.syncDoms) syncDom();
        }, 0);
      }

      batch.restores.push(() => {
        if (!node.isConnected || node.form !== form) return;
        syncGroupMembership(snapshotDefaultChecked, true);
      });
      batch.syncDoms.push(() => {
        if (!node.isConnected || node.form !== form) return;
        node.checked = Array.isArray(group) && group.some((item) => item === value);
      });
    };

    document.addEventListener('reset', onReset, true);
    return () => document.removeEventListener('reset', onReset, true);
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
