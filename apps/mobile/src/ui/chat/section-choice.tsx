import { SettingsRow } from '../primitives/settings-row';

export type SectionChoiceProps = {
  title: string;
  testID: string;
  onPress?: (() => void) | undefined;
};

export function SectionChoice(props: SectionChoiceProps) {
  return <SettingsRow {...props} />;
}
