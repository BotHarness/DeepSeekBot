import { SettingsSection } from './settings-row';
import { TextField, type TextFieldProps } from './text-field';

export function CardField({ accessibilityLabel, ...props }: TextFieldProps) {
  return (
    <SettingsSection
      {...(accessibilityLabel === undefined ? {} : { title: accessibilityLabel })}
      on="raised"
    >
      <TextField accessibilityLabel={accessibilityLabel} {...props} inCard />
    </SettingsSection>
  );
}
