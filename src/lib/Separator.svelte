<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';

  type SeparatorOrientation = 'horizontal' | 'vertical';

  // `Separator` is a static structural divider (<hr>), not an interactive widget.
  // Component-owned ARIA semantics (`role`, `aria-orientation`, `aria-hidden`) and
  // focusability attributes (`tabindex`, `autofocus`, `contenteditable`) are reserved
  // so callers cannot create focusable `aria-hidden` elements or pass silently discarded ARIA.
  type ReservedSeparatorAttribute =
    | 'children'
    | 'role'
    | 'aria-orientation'
    | 'aria-hidden'
    | 'tabindex'
    | 'autofocus'
    | 'contenteditable';

  type SeparatorProps = Omit<HTMLAttributes<HTMLHRElement>, ReservedSeparatorAttribute> & {
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

  const RESERVED_KEYS = new Set([
    'role',
    'aria-orientation',
    'aria-hidden',
    'tabindex',
    'autofocus',
    'contenteditable'
  ]);

  let {
    orientation = 'horizontal',
    decorative = false,
    ...rest
  }: SeparatorProps = $props();

  const forwardedAttrs = $derived.by(() => {
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rest)) {
      if (!RESERVED_KEYS.has(key.toLowerCase())) {
        clean[key] = value;
      }
    }
    return clean;
  });

  function enforceDecorativeHidden(node: HTMLHRElement) {
    if (decorative) {
      node.removeAttribute('tabindex');
      if (typeof document !== 'undefined' && document.activeElement === node) {
        node.blur();
      }
    }
  }
</script>

<hr
  {...forwardedAttrs}
  data-svelix-orientation={orientation}
  aria-orientation={!decorative && orientation === 'vertical' ? 'vertical' : undefined}
  aria-hidden={decorative ? 'true' : undefined}
  {@attach enforceDecorativeHidden}
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
