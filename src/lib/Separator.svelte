<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';

  type SeparatorOrientation = 'horizontal' | 'vertical';

  type SeparatorProps = Omit<HTMLAttributes<HTMLHRElement>, 'children'> & {
    /**
     * Visual and semantic axis of the separator. Defaults to `'horizontal'`.
     */
    orientation?: SeparatorOrientation;
    /**
     * When `true`, marks the separator as purely visual (`aria-hidden="true"`)
     * so assistive technologies ignore it. Defaults to `false`.
     */
    decorative?: boolean;
  };

  let {
    orientation = 'horizontal',
    decorative = false,
    ...rest
  }: SeparatorProps = $props();
</script>

<hr
  {...rest}
  data-svelix-orientation={orientation}
  aria-orientation={!decorative && orientation === 'vertical' ? 'vertical' : undefined}
  aria-hidden={decorative ? 'true' : undefined}
/>

<style>
  :where(hr) {
    box-sizing: border-box;
    border: 0;
    margin: 0;
    flex-shrink: 0;
  }

  :where(hr[data-svelix-orientation='horizontal']) {
    inline-size: 100%;
    block-size: 0;
    margin-block: var(--svelix-spacing-sm);
    border-block-start: var(--svelix-border-width) solid var(--svelix-border);
  }

  :where(hr[data-svelix-orientation='vertical']) {
    display: inline-block;
    inline-size: 0;
    block-size: auto;
    min-block-size: 1em;
    align-self: stretch;
    margin-inline: var(--svelix-spacing-sm);
    border-inline-start: var(--svelix-border-width) solid var(--svelix-border);
  }
</style>
