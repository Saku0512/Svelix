<script lang="ts" module>
  type ResetEntry = {
    canceled: boolean;
    groupRef: unknown;
    snapshot: unknown[] | null;
    cleanup: () => void;
    restore: () => void;
    syncDom: () => void;
  };

  type ResetBatch = {
    entries: ResetEntry[];
  };

  // 同じネイティブ reset イベントに反応した兄弟の grouped checkbox を
  // 1 つの macrotask 内でまとめて復元し、イベント単位で分離して扱う。
  const pendingResetEvents = new WeakMap<Event, ResetBatch>();

  // 内部リセット復元が生成した group オブジェクトとそのスナップショットを記録し、
  // 別フォームの連続リセットによる更新をアプリ書き込みと誤認しないようにする。
  const resetDrivenSnapshots = new WeakMap<object, unknown[]>();
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

  // この Input インスタンス自身の保留中リセットエントリーのみを追跡する。
  const pendingEntries = new Set<ResetEntry>();

  function isSameValues(a: unknown[] | null, b: unknown[] | null): boolean {
    if (a === null || b === null) return a === b;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  function hasGroupChanged(
    entry: ResetEntry,
    currentGroup: InputGroup,
    currentValues: unknown[] | null
  ): boolean {
    if (currentGroup !== entry.groupRef) return true;
    return !isSameValues(currentValues, entry.snapshot);
  }

  function isResetDrivenGroup(
    currentGroup: InputGroup,
    currentValues: unknown[] | null
  ): boolean {
    if (!currentGroup || typeof currentGroup !== 'object') return false;
    const expected = resetDrivenSnapshots.get(currentGroup);
    return expected !== undefined && isSameValues(currentValues, expected);
  }

  // このインスタンスの group がリセット後にアプリ側で更新された場合のみ、
  // 該当する保留中リセットの復元をキャンセルする。
  $effect(() => {
    if (kind !== 'checkbox' || !usesGroup) return;
    const currentGroup = group;
    const currentValues = Array.isArray(currentGroup) ? [...currentGroup] : null;
    if (isResetDrivenGroup(currentGroup, currentValues)) return;
    for (const entry of pendingEntries) {
      if (hasGroupChanged(entry, currentGroup, currentValues)) {
        entry.canceled = true;
      }
    }
  });

  function syncGroupMembership(include: boolean, markResetDriven = false) {
    const option = value as string | number | boolean;
    const selected = Array.isArray(group) ? [...group] : [];
    const has = selected.some((item) => item === option);
    if (include === has) return;
    group = include
      ? [...selected, option]
      : selected.filter((item) => item !== option);
    if (markResetDriven && group && typeof group === 'object') {
      resetDrivenSnapshots.set(group, Array.isArray(group) ? [...group] : []);
    }
  }

  function handleGroupedCheckboxChange(event: Event & { currentTarget: HTMLInputElement }) {
    syncGroupMembership(event.currentTarget.checked);
    onchange?.(event);
  }

  function attachGroupedCheckboxReset(node: HTMLInputElement) {
    // document の capture フェーズで購読し、form 属性による所有者変更にも追従する。
    // Chromium ではユーザー操作によるリセット直後の microtask でリセット前の
    // checked 状態が観測されるため、macrotask でネイティブリセット後に同期する。
    const onReset = (event: Event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || node.form !== form) return;
      // ユーザー操作の reset ボタンおよびネイティブ form.reset() は isTrusted === true。
      // 合成 dispatchEvent(new Event('reset')) は isTrusted === false なので無視する。
      if (!event.isTrusted) return;

      const entry: ResetEntry = {
        canceled: false,
        groupRef: group,
        snapshot: Array.isArray(group) ? [...group] : null,
        cleanup: () => {
          pendingEntries.delete(entry);
        },
        restore: () => {
          if (!node.isConnected || node.form !== form) return;
          syncGroupMembership(snapshotDefaultChecked, true);
        },
        syncDom: () => {
          if (!node.isConnected || node.form !== form) return;
          node.checked = Array.isArray(group) && group.some((item) => item === value);
        }
      };

      pendingEntries.add(entry);

      let batch = pendingResetEvents.get(event);
      if (!batch) {
        const scheduled: ResetBatch = { entries: [] };
        batch = scheduled;
        pendingResetEvents.set(event, scheduled);
        setTimeout(() => {
          pendingResetEvents.delete(event);
          for (const item of scheduled.entries) item.cleanup();
          if (event.defaultPrevented) return;
          for (const item of scheduled.entries) {
            if (!item.canceled) item.restore();
          }
          // メンバーシップが不変でもネイティブリセットで DOM の checked が
          // 書き換わることがあるため、現在の group を DOM へ再適用する。
          for (const item of scheduled.entries) item.syncDom();
        }, 0);
      }

      batch.entries.push(entry);
    };

    document.addEventListener('reset', onReset, true);
    return () => {
      document.removeEventListener('reset', onReset, true);
      pendingEntries.clear();
    };
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
