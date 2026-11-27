import { createContext } from 'svelte';

export interface RadioGroupContext {
  getName: () => string | undefined;
  isControlled: () => boolean;
  getValue: () => string | undefined;
  getInitialValue: () => string | undefined;
  setValue: (next: string) => void;
}

export const [getRadioGroupContext, setRadioGroupContext] = createContext<RadioGroupContext>();
