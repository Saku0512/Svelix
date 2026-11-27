<script lang="ts">
  import type { HTMLButtonAttributes } from 'svelte/elements';

  type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';

  interface ButtonProps extends HTMLButtonAttributes {
    variant?: ButtonVariant;
  }

  let { variant = 'primary', children, ...rest }: ButtonProps = $props();
</script>

<button {...rest} data-svelix-variant={variant}>
  {@render children?.()}
</button>

<style>
  :where(button) {
    box-sizing: border-box;
    display: inline-flex;
    min-inline-size: 3rem;
    min-block-size: 3rem;
    align-items: center;
    justify-content: center;
    padding-block: var(--svelix-spacing-sm);
    padding-inline: var(--svelix-spacing-md);
    border: var(--svelix-border-width) solid transparent;
    border-radius: var(--svelix-radius-md);
    font: inherit;
    font-weight: 600;
    line-height: 1.25;
    text-align: center;
    cursor: pointer;
  }

  :where(button[data-svelix-variant='primary']) {
    background-color: var(--svelix-primary);
    color: var(--svelix-primary-foreground);
  }

  :where(button[data-svelix-variant='secondary']) {
    background-color: var(--svelix-secondary);
    color: var(--svelix-secondary-foreground);
  }

  :where(button[data-svelix-variant='outline']) {
    border-color: var(--svelix-border);
    background-color: var(--svelix-background);
    color: var(--svelix-foreground);
  }

  :where(button[data-svelix-variant='ghost']) {
    background-color: transparent;
    color: var(--svelix-foreground);
  }

  :where(button:focus-visible) {
    outline: var(--svelix-focus-ring-width) solid var(--svelix-focus-ring);
    outline-offset: var(--svelix-focus-ring-offset);
  }

  :where(button:disabled) {
    background-color: var(--svelix-muted);
    color: var(--svelix-muted-foreground);
    cursor: not-allowed;
  }
</style>
