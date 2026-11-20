import { uniqueProviderName } from '../../../core/src/voice/presets.js';

export const CUSTOM_CHOICE = '\u0000custom';

export interface Choice {
  readonly choice: string;
  readonly custom: string;
}

export function choiceValues(options: readonly string[], fallback?: string): string[] {
  const values: string[] = [];
  for (const value of fallback === undefined ? options : [fallback, ...options])
    if (value.trim() !== '' && !values.includes(value)) values.push(value);
  return values;
}

export function initialChoice(options: readonly string[], fallback?: string): Choice {
  const values = choiceValues(options, fallback);
  return { choice: values[0] ?? CUSTOM_CHOICE, custom: '' };
}

export function chosenValue(state: Choice): string | undefined {
  const value = state.choice === CUSTOM_CHOICE ? state.custom.trim() : state.choice;
  return value === '' ? undefined : value;
}

export function defaultProviderName(
  presetName: string,
  providers: readonly { readonly name: string }[],
): string {
  return uniqueProviderName(
    presetName,
    providers.map((provider) => provider.name),
  );
}
