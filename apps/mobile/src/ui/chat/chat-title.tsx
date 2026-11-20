import { EngineBrandIcon } from './engine-brand-icon';
import { useHeaderStatus } from './use-header-status';
import { HeaderTitleButton } from './header-title-button';
import { ConnectionProgress } from '../primitives/connection-progress';
import type { RefCallback } from 'react';
import { View, type ViewInstance } from 'react-native';

import type { RosterBot } from '@botharness/host-client/client';
import { BotAvatar } from '../bot-avatar';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { titleChipFill } from './header-chrome';
import type { HeaderModel } from './composer-labels';
import { ModelBrandIcon } from './model-brand-icon';
import {
  barLabelStyle,
  barLabelProps,
  headerContentScale,
  headerControlHeight,
  glassHeader,
} from './native-header';

const AVATAR = 28;
const MODEL_LABEL_EMS = 7;

export function ChatTitle({
  bot,
  fallback,
  connectionLabel,
  model,
  modelMount,
  onPress,
}: {
  bot: RosterBot | undefined;
  fallback: string;
  connectionLabel?: string | undefined;
  model?: HeaderModel | undefined;
  modelMount?: RefCallback<ViewInstance> | undefined;
  onPress(): void;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const contentScale = glassHeader ? headerContentScale(theme) : 1;
  const avatarSize = AVATAR * contentScale;
  const headerStatus = useHeaderStatus(bot, undefined);
  const name = bot?.displayName ?? fallback;
  const shownModel = connectionLabel === undefined ? model : undefined;
  const modelIcon = Math.round(theme.type.meta.size * contentScale);
  const chip = (press: () => void) => (
    <HeaderTitleButton
      testID="bot-details-chip"
      accessibilityRole="button"
      accessibilityLabel={[
        name,
        shownModel?.name,
        shownModel?.external ? t.routingGroup.externalEngine : undefined,
        headerStatus.label,
        connectionLabel,
      ]
        .filter(Boolean)
        .join(', ')}
      accessibilityState={{ busy: connectionLabel !== undefined }}
      accessibilityHint={t.openProfile}
      disabled={bot === undefined}
      onPress={press}
      style={({ pressed }) => ({
        flexShrink: 1,
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x3,
        minHeight: headerControlHeight(theme),
        paddingLeft: ((glassHeader ? headerControlHeight(theme) : theme.touch) - avatarSize) / 2,
        paddingRight: theme.touch / 2,
        borderRadius: radius.round,
        ...titleChipFill(theme, pressed),
      })}
    >
      {bot ? (
        <BotAvatar bot={bot} size={avatarSize} ring={false} />
      ) : (
        <View style={{ width: avatarSize, height: avatarSize }} />
      )}
      <View ref={modelMount} style={{ flex: 1, minWidth: 0 }}>
        <Text
          {...barLabelProps}
          strong
          numberOfLines={1}
          ellipsizeMode="tail"
          style={barLabelStyle}
        >
          {name}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x2 }}>
          {shownModel === undefined ? null : (
            <View
              testID="chat-header-model"
              style={{ flexDirection: 'row', alignItems: 'center', gap: space.x1, flexShrink: 0 }}
            >
              {shownModel.external ? (
                <EngineBrandIcon
                  brand={shownModel.brand}
                  size={modelIcon}
                  color={theme.color.muted}
                />
              ) : (
                <ModelBrandIcon
                  brand={shownModel.brand}
                  size={modelIcon}
                  color={theme.color.muted}
                />
              )}
              <Text
                {...barLabelProps}
                variant="meta"
                tone="muted"
                numberOfLines={1}
                style={{ maxWidth: modelIcon * MODEL_LABEL_EMS }}
              >
                {`${shownModel.short} ·`}
              </Text>
            </View>
          )}
          <Text
            {...barLabelProps}
            variant="meta"
            tone="muted"
            numberOfLines={1}
            ellipsizeMode="tail"
            style={{ flex: 1, minWidth: 0 }}
          >
            {connectionLabel ?? headerStatus.label}
          </Text>
        </View>
      </View>
      <ConnectionProgress active={connectionLabel !== undefined} />
    </HeaderTitleButton>
  );
  return chip(onPress);
}
