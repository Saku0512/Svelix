<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Button,
    Checkbox,
    Input,
    Label,
    Radio,
    RadioGroup,
    Separator
  } from 'svelix';
  import 'svelix/styles.css';

  let { initialEmail = 'ada@example.com' }: { initialEmail?: string } = $props();

  let clicks = $state(0);
  // Seed from prop once so defaultValue/reset and live binding both work after hydration.
  let email = $state((() => initialEmail)());
  let accepted = $state(false);
  let partial = $state(true);
  let plan = $state<string | null>('pro');
  let mode = $state<string | null>('light');
  let sepOrientation = $state<'horizontal' | 'vertical'>('vertical');
  let sepDecorative = $state(false);

  onMount(() => {
    document.body.dataset.hydrated = 'true';
  });
</script>

<main data-svelix-theme="light">
  <form id="ssr-form" onsubmit={(event) => event.preventDefault()}>
    <Label id="ssr-label" for="ssr-email">Account email</Label>
    <Input
      id="ssr-email"
      name="email"
      type="email"
      autocomplete="email"
      required
      bind:value={email}
      defaultValue={initialEmail}
    />

    <Separator id="ssr-sep-dynamic" orientation={sepOrientation} decorative={sepDecorative} />
    <Separator id="ssr-sep-decorative" decorative />

    <Label id="ssr-checkbox-label">
      <Checkbox
        id="ssr-checkbox"
        name="accepted"
        value="yes"
        bind:checked={accepted}
        bind:indeterminate={partial}
      />
      Accept terms
    </Label>

    <RadioGroup id="ssr-plan-group" legend="Billing plan" name="plan" bind:value={plan}>
      <Label><Radio id="ssr-plan-basic" value="basic" /> Basic</Label>
      <Label><Radio id="ssr-plan-pro" value="pro" /> Pro</Label>
    </RadioGroup>

    <RadioGroup id="ssr-unnamed-group" legend="Display mode" bind:value={mode}>
      <Label><Radio id="ssr-unnamed-light" value="light" /> Light</Label>
      <Label><Radio id="ssr-unnamed-dark" value="dark" /> Dark</Label>
    </RadioGroup>

    <Button id="ssr-count-btn" type="button" onclick={() => (clicks += 1)}>
      Count ({clicks})
    </Button>
    <Button
      id="ssr-toggle-sep"
      type="button"
      variant="secondary"
      onclick={() => {
        sepOrientation = sepOrientation === 'vertical' ? 'horizontal' : 'vertical';
        sepDecorative = !sepDecorative;
      }}
    >Toggle divider</Button>
    <Button id="ssr-reset-btn" type="reset" variant="ghost">Reset</Button>
  </form>

  <output id="ssr-clicks-out">{clicks}</output>
  <output id="ssr-email-out">{email}</output>
  <output id="ssr-accepted-out">{String(accepted)}</output>
  <output id="ssr-partial-out">{String(partial)}</output>
  <output id="ssr-plan-out">{JSON.stringify(plan)}</output>
  <output id="ssr-mode-out">{JSON.stringify(mode)}</output>
</main>
