import { useStrings } from '../strings';
import { SettingsRow, SettingsSection } from './settings-row';

export interface EnvironmentOption {
  value: string;
  label: string;
  detail: string;
  disabled: boolean;
}

export function EnvironmentList(props: {
  title: string;
  value: string;
  options: readonly EnvironmentOption[];
  disabled?: boolean;
  onChange(value: string): void;
}) {
  const t = useStrings();
  return (
    <SettingsSection title={props.title} on="raised">
      {props.options.map((option) => {
        const selected = option.value === props.value;
        return (
          <SettingsRow
            key={option.value}
            on="raised"
            testID={`create-bot-host-${option.value}`}
            title={option.label}
            detail={option.detail}
            tone={option.disabled ? 'muted' : 'fg'}
            selected={selected}
            accessibilityLabel={`${option.label}, ${option.detail}${selected ? `, ${t.pairAccount.selected}` : ''}`}
            control={selected ? { kind: 'check' } : undefined}
            onPress={
              option.disabled || props.disabled ? undefined : () => props.onChange(option.value)
            }
          />
        );
      })}
    </SettingsSection>
  );
}
