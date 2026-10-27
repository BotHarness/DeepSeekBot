import { useState } from 'react';
import { Image, type ImageSourcePropType } from 'react-native';

import { useDesignTheme } from './design/theme';
import { radius, space } from './design/tokens';
import { SettingsForm, SettingsFormItem } from './primitives/settings-form';
import { SettingsRow, SettingsSection } from './primitives/settings-row';
import { Notice, errorText } from './request-parts';
import { useStrings, t } from './strings';

export const APP_ICONS = ['default', 'DeepSeekBotSimple'] as const;
export type AppIconName = (typeof APP_ICONS)[number];

export interface AppIconPort {
  supported: boolean;
  current(): AppIconName;
  set(name: AppIconName): Promise<void>;
}

export type AppIconPreviews = Record<AppIconName, Record<'light' | 'dark', ImageSourcePropType>>;

const ICON_SIZE = 48;

const iconLabels = (): Record<AppIconName, { title: string; detail: string }> => ({
  default: { title: t.appIconDeepSeekBot, detail: t.appIconDefaultHint },
  DeepSeekBotSimple: {
    title: t.appIconDeepSeekBotSimple,
    detail: t.appIconDeepSeekBotSimpleHint,
  },
});

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
  const t = useStrings();
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
    <SettingsForm>
      {port.supported ? null : (
        <SettingsFormItem>
          <Notice tone="warning">{t.appIconUnsupported}</Notice>
        </SettingsFormItem>
      )}
      <SettingsSection on="raised" footer={t.appIconFooter}>
        {APP_ICONS.map((name) => (
          <SettingsRow
            on="raised"
            key={name}
            title={iconLabels()[name].title}
            detail={iconLabels()[name].detail}
            selected={current === name}
            leading={<IconPreview name={name} previews={previews} />}
            control={
              busy === name ? { kind: 'busy' } : current === name ? { kind: 'check' } : undefined
            }
            onPress={port.supported ? () => choose(name) : undefined}
          />
        ))}
      </SettingsSection>
      {error === undefined ? null : (
        <SettingsFormItem>
          <Notice tone="danger">{error}</Notice>
        </SettingsFormItem>
      )}
    </SettingsForm>
  );
}
