import { useState } from 'react';
import { ActivityIndicator, Image, ScrollView, type ImageSourcePropType } from 'react-native';

import { useDesignTheme } from './design/theme';
import { radius, space } from './design/tokens';
import { SettingsRow, SettingsSection } from './primitives/settings-row';
import { Notice, errorText } from './request-parts';
import { CheckIcon } from './shell/icons';
import { t } from './strings';

export const APP_ICONS = ['default', 'DeepSeekBotSimple'] as const;
export type AppIconName = (typeof APP_ICONS)[number];

export interface AppIconPort {
  supported: boolean;
  current(): AppIconName;
  set(name: AppIconName): Promise<void>;
}

export type AppIconPreviews = Record<AppIconName, Record<'light' | 'dark', ImageSourcePropType>>;

const ICON_SIZE = 48;

const LABEL: Record<AppIconName, { title: string; detail: string }> = {
  default: { title: t.appIconDeepSeekBot, detail: t.appIconDefaultHint },
  DeepSeekBotSimple: {
    title: t.appIconDeepSeekBotSimple,
    detail: t.appIconDeepSeekBotSimpleHint,
  },
};

function IconPreview({ name, previews }: { name: AppIconName; previews: AppIconPreviews }) {
  const theme = useDesignTheme();
  const frame = {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: radius.md,
  } as const;
  return (
    <Image source={previews[name][theme.scheme]} style={frame} accessibilityIgnoresInvertColors />
  );
}

export function AppIconSettings({
  port,
  previews,
}: {
  port: AppIconPort;
  previews: AppIconPreviews;
}) {
  const theme = useDesignTheme();
  const [current, setCurrent] = useState<AppIconName>(() =>
    port.supported ? port.current() : 'default',
  );
  const [busy, setBusy] = useState<AppIconName>();
  const [error, setError] = useState<string>();

  const choose = (name: AppIconName) => {
    if (busy !== undefined || name === current) return;
    setBusy(name);
    setError(undefined);
    port.set(name).then(
      () => {
        setCurrent(name);
        setBusy(undefined);
      },
      (reason: unknown) => {
        setError(`${t.appIconFailed} ${errorText(reason)}`);
        setBusy(undefined);
      },
    );
  };

  return (
    <ScrollView
      nestedScrollEnabled
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ gap: space.x6, padding: space.x5 }}
    >
      {port.supported ? null : <Notice tone="warning">{t.appIconUnsupported}</Notice>}
      <SettingsSection on="raised" footer={t.appIconFooter}>
        {APP_ICONS.map((name) => (
          <SettingsRow
            on="raised"
            key={name}
            title={LABEL[name].title}
            detail={LABEL[name].detail}
            selected={current === name}
            leading={<IconPreview name={name} previews={previews} />}
            trailing={
              busy === name ? (
                <ActivityIndicator />
              ) : current === name ? (
                <CheckIcon color={theme.color.fg} size={theme.type.title.line} />
              ) : undefined
            }
            onPress={port.supported ? () => choose(name) : undefined}
          />
        ))}
      </SettingsSection>
      {error === undefined ? null : <Notice tone="danger">{error}</Notice>}
    </ScrollView>
  );
}
