<script lang="ts">
  import type { HTMLLabelAttributes } from 'svelte/elements';

  type LabelProps = HTMLLabelAttributes;

  let { children, ...rest }: LabelProps = $props();
</script>

<label {...rest}>
  {@render children?.()}
</label>

<style>
  :where(label) {
    color: var(--svelix-foreground);
    font: inherit;
    font-weight: 500;
    line-height: 1.5;
  }
</style>
