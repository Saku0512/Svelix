<script lang="ts">
  import { untrack, type Snippet } from 'svelte';
  import type { HTMLFieldsetAttributes } from 'svelte/elements';
  import { setRadioGroupContext } from './radio-group-context.js';

  type RadioGroupProps = HTMLFieldsetAttributes & {
    /**
     * グループのアクセシブルなラベルとして `<legend>` 要素に描画する文字列または Snippet。
     * 省略した場合は、子要素の先頭に独自に `<legend>` を配置できる。
     */
    legend?: string | Snippet;
    /**
     * グループ内の `<Radio>` に共有するネイティブ `name` 属性。
     */
    name?: string;
    /**
     * 制御・双方向バインド時の選択値。省略時はネイティブの非制御ラジオグループとして動作する。
     */
    value?: string;
  };

  // value が未指定（非制御）か、明示指定・バインド済みかを判別する番兵値。
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

  // この RadioGroup インスタンス自身の保留中リセットのみを追跡する。
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
    // document の capture フェーズで購読し、form 属性による所有者変更にも追従する。
    const onReset = (event: Event) => {
      if (!isControlled) return;
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || fieldset.form !== form) return;
      // ネイティブのユーザー操作および form.reset() のみ対象とし、合成イベントは無視する。
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
        // ネイティブリセット後の DOM checked 状態を現在の value と一致させる。
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
