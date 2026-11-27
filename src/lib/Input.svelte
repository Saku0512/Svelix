<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';

  type InputProps = Omit<HTMLInputAttributes, 'children'>;

  let { value = $bindable(), ...rest }: InputProps = $props();
</script>

<input {...rest} bind:value />

<style>
  :where(input) {
    box-sizing: border-box;
    max-inline-size: 100%;
    font: inherit;
    font-size: max(1rem, 1em);
    color: var(--svelix-foreground);
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
