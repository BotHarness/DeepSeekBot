import { router } from 'expo-router';
import { ActionSheetIOS, Platform, Pressable, View } from 'react-native';

import type { FullClientTarget } from '../../host/full-client';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { t } from '../strings';
import { showAppDialog } from '../primitives/app-dialog';
import { PlusIcon } from './icons';

export type CreateTarget = Extract<FullClientTarget, { kind: 'new-bot' | 'new-channel' }>;

export const CREATE_CHOICES: readonly { target: CreateTarget; label: string }[] = [
  { target: { kind: 'new-bot' }, label: t.newPersonaBot },
  { target: { kind: 'new-channel' }, label: t.newChannel },
];

export function openCreateMenu(onPick: (target: CreateTarget) => void): void {
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [...CREATE_CHOICES.map((choice) => choice.label), t.cloudJoin.title, t.cancel],
        cancelButtonIndex: CREATE_CHOICES.length + 1,
      },
      (index) => {
        if (index === CREATE_CHOICES.length) {
          router.push('/cloud-join');
          return;
        }
        const choice = CREATE_CHOICES[index];
        if (choice !== undefined) onPick(choice.target);
      },
    );
    return;
  }
  showAppDialog(t.cloudJoin.newOrJoin, undefined, [
    { text: t.cancel, style: 'cancel' },
    { text: t.cloudJoin.title, onPress: () => router.push('/cloud-join') },
    ...CREATE_CHOICES.map((choice) => ({
      text: choice.label,
      icon: choice.target.kind === 'new-bot' ? ('person' as const) : ('chat' as const),
      onPress: () => onPick(choice.target),
    })),
  ]);
}

export function CreateButton({ onPick }: { onPick: (target: CreateTarget) => void }) {
  const theme = useDesignTheme();
  const size = theme.touch - space.x3;
  return (
    <Pressable
      onPress={() => openCreateMenu(onPick)}
      accessibilityRole="button"
      accessibilityLabel={t.cloudJoin.newOrJoin}
      style={({ pressed }) => ({
        minWidth: theme.touch,
        minHeight: theme.touch,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: radius.round,
          backgroundColor: theme.layer.raised.fill,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <PlusIcon color={theme.color.fg} size={theme.type.title.line} />
      </View>
    </Pressable>
  );
}
