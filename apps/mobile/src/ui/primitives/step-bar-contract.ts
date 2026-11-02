import type { useStrings } from '../strings';

export interface StepBarAction {
  label: string;
  testID: string;
  onPress(): void;
}

export interface StepBarProps {
  primary: StepBarAction & { disabled?: boolean; busy?: boolean };
  back?: StepBarAction | undefined;
  step?: { index: number; total: number } | undefined;
  note?: string | undefined;
  error?: string | undefined;
}

export function stepBarLabel(label: string, step: StepBarProps['step']) {
  return step ? `${label} · ${step.index}/${step.total}` : label;
}

export function stepBarAccessibilityLabel(
  t: ReturnType<typeof useStrings>,
  label: string,
  step: StepBarProps['step'],
) {
  return step ? `${label}, ${t.stepBar.step(step.index, step.total)}` : label;
}
