import { Stack } from 'expo-router';

export type SectionHeaderAction = {
  label: string;
  icon: 'close' | 'back' | 'add' | 'check';
  disabled: boolean;
  onPress(): void;
};

export type ConversationSectionHeaderProps = {
  title: string;
  leading: SectionHeaderAction;
  trailing: SectionHeaderAction;
};

export function ConversationSectionHeader({ leading, trailing }: ConversationSectionHeaderProps) {
  return (
    <>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button
          accessibilityLabel={leading.label}
          icon={leading.icon === 'back' ? 'chevron.left' : 'xmark'}
          disabled={leading.disabled}
          onPress={leading.onPress}
        >
          {leading.label}
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          accessibilityLabel={trailing.label}
          icon={trailing.icon === 'add' ? 'plus' : undefined}
          disabled={trailing.disabled}
          variant={trailing.icon === 'check' ? 'done' : 'plain'}
          onPress={trailing.onPress}
        >
          {trailing.icon === 'check' ? trailing.label : undefined}
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
    </>
  );
}
