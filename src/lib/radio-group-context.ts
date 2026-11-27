import { createContext } from 'svelte';

export interface RegisteredRadio {
  node: HTMLInputElement;
  getValue: () => string;
  getDefaultChecked: () => boolean;
}

export interface RadioGroupContext {
  getName: () => string;
  isControlled: () => boolean;
  getValue: () => string | null | undefined;
  getInitialValue: () => string | null | undefined;
  setValue: (next: string) => void;
  registerRadio: (entry: RegisteredRadio) => () => void;
}

export const [getRadioGroupContext, setRadioGroupContext] = createContext<RadioGroupContext>();
