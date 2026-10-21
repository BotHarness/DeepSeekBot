import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import {
  DEFAULT_HOST_LOOK,
  HOST_COLOR_IDS,
  HOST_COLORS,
  HOST_EMOJI,
  HOST_NAME_MAX,
  HOST_SYMBOL_IDS,
  hostColorInk,
  hostLookName,
  hostTileFill,
  shownHostName,
  withHostColor,
  withHostIcon,
  withHostName,
  type HostColorId,
  type HostIcon,
  type HostLook,
} from '../design/host-look';
import { contrast } from '../design/resolve-theme';
import { useDesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
import type { LayerName } from '../design/layers';
import { confirmDestructive } from '../primitives/app-dialog';
import { DrawerHeader } from '../primitives/drawer-header';
import { KeyboardFormScroll } from '../primitives/keyboard-form';
import { Segmented } from '../primitives/segmented';
import { SettingsHeading, SettingsRow, SettingsSection } from '../primitives/settings-row';
import { Text } from '../primitives/text';
import { TextField } from '../primitives/text-field';
import { t } from '../strings';
import { HostGlyph } from './host-tile';
import { CheckIcon } from './icons';

export interface HostLookActions {
  onChange(look: HostLook): void;
  onClose(): void;
}

type IconSet = HostIcon['kind'];

const SHEET_GROUP: LayerName = 'raised';

function Preview({ hostName, look }: { hostName: string; look: HostLook }) {
  const theme = useDesignTheme();
  const ink = hostColorInk(theme.scheme, theme.color, look.color);
  const tab = (label: string, selected: boolean, leading?: ReactNode) => (
    <View style={{ flexShrink: selected ? 1 : 0, minWidth: 0 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.x2,
          paddingHorizontal: space.x5,
          paddingVertical: space.x4,
          minHeight: theme.touch,
        }}
      >
        {leading}
        <Text
          strong
          tone={selected ? 'fg' : 'muted'}
          numberOfLines={1}
          ellipsizeMode="tail"
          style={{ flexShrink: 1 }}
        >
          {label}
        </Text>
      </View>
      <View
        style={{
          height: edge.focus,
          backgroundColor: selected ? ink : 'transparent',
        }}
      />
    </View>
  );
  return (
    <View
      accessible
      accessibilityLabel={`${t.hostLookPreview}: ${hostName}`}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        overflow: 'hidden',
        borderRadius: radius.md,
        backgroundColor: theme.color.base,
        borderWidth: edge.hairline,
        borderColor: theme.layer[SHEET_GROUP].divider,
      }}
    >
      {tab(t.allEnvironments, false)}
      {tab(
        hostName,
        true,
        <HostGlyph
          icon={look.icon}
          size={theme.type.meta.line}
          color={look.color === undefined ? theme.color.fg : ink}
        />,
      )}
    </View>
  );
}

function Swatch({
  label,
  selected,
  ring,
  fill,
  testID,
  onPress,
  children,
}: {
  label: string;
  selected: boolean;
  ring: string;
  fill: string;
  testID?: string;
  onPress(): void;
  children?: ReactNode;
}) {
  const theme = useDesignTheme();
  const size = theme.touch;
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={({ pressed }) => ({
        width: size + space.x2,
        height: size + space.x2,
        padding: space.x1 / 2,
        borderRadius: radius.round,
        borderWidth: edge.focus,
        borderColor: selected ? ring : 'transparent',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View
        style={{
          flex: 1,
          borderRadius: radius.round,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: fill,
        }}
      >
        {children}
      </View>
    </Pressable>
  );
}

function Card({ children }: { children: ReactNode }) {
  const theme = useDesignTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: space.x2,
        padding: space.x3,
        borderRadius: radius.md,
        backgroundColor: theme.layer[SHEET_GROUP].fill,
      }}
    >
      {children}
    </View>
  );
}

const sameIcon = (a: HostIcon, b: HostIcon) =>
  a.kind === 'symbol'
    ? b.kind === 'symbol' && a.id === b.id
    : b.kind === 'emoji' && a.emoji === b.emoji;

export function HostLookEditor({
  hostName,
  look,
  actions,
}: {
  hostName: string;
  look: HostLook;
  actions: HostLookActions;
}) {
  const theme = useDesignTheme();
  const [set, setSet] = useState<IconSet>(look.icon.kind);
  const [nameDraft, setNameDraft] = useState(look.name ?? '');
  const [stored, setStored] = useState(look);
  if (stored !== look) {
    setStored(look);
    if (look.icon.kind !== stored.icon.kind) setSet(look.icon.kind);
    if (look.name !== stored.name && hostLookName(nameDraft) !== look.name)
      setNameDraft(look.name ?? '');
  }
  const shown = shownHostName(look, hostName);
  const ink = hostColorInk(theme.scheme, theme.color, look.color);
  const tile = hostTileFill(theme.scheme, theme.color, look.color, theme.layer[SHEET_GROUP].inset);
  const glyph = look.color === undefined ? theme.color.fg : ink;
  const ring = look.color === undefined ? theme.color.fg : ink;
  const setIcon = (icon: HostIcon) => actions.onChange(withHostIcon(look, icon));
  const setColor = (color: HostColorId | undefined) => actions.onChange(withHostColor(look, color));
  const iconSize = theme.type.title.line;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: space.x5, paddingTop: space.x3 }}>
        <DrawerHeader title={t.hostLook} onClose={actions.onClose} />
      </View>
      <KeyboardFormScroll
        nestedScrollEnabled
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: space.x6, padding: space.x5 }}
      >
        <Preview hostName={shown} look={look} />

        <View style={{ gap: space.x2 }}>
          <SettingsHeading>{t.hostLookName}</SettingsHeading>
          <TextField
            accessibilityLabel={t.hostLookName}
            value={nameDraft}
            placeholder={hostName}
            maxLength={HOST_NAME_MAX}
            autoCorrect={false}
            returnKeyType="done"
            onChangeText={(text) => {
              setNameDraft(text);
              actions.onChange(withHostName(look, text));
            }}
          />
        </View>

        <View style={{ gap: space.x2 }}>
          <SettingsHeading>{t.hostIcon}</SettingsHeading>
          <Segmented<IconSet>
            label={t.hostIcon}
            on={SHEET_GROUP}
            value={set}
            onChange={setSet}
            options={[
              { value: 'symbol', label: t.hostIconSymbols },
              { value: 'emoji', label: t.hostIconEmoji },
            ]}
          />
          <Card>
            {set === 'symbol'
              ? HOST_SYMBOL_IDS.map((id) => {
                  const icon: HostIcon = { kind: 'symbol', id };
                  const selected = sameIcon(look.icon, icon);
                  return (
                    <Swatch
                      key={id}
                      testID={`host-icon-${id}`}
                      label={t.hostSymbol[id]}
                      selected={selected}
                      ring={ring}
                      fill={selected ? tile : 'transparent'}
                      onPress={() => setIcon(icon)}
                    >
                      <HostGlyph
                        icon={icon}
                        size={iconSize}
                        color={selected ? glyph : theme.color.muted}
                      />
                    </Swatch>
                  );
                })
              : HOST_EMOJI.map((emoji) => {
                  const icon: HostIcon = { kind: 'emoji', emoji };
                  const selected = sameIcon(look.icon, icon);
                  return (
                    <Swatch
                      key={emoji}
                      label={emoji}
                      selected={selected}
                      ring={ring}
                      fill={selected ? tile : 'transparent'}
                      onPress={() => setIcon(icon)}
                    >
                      <HostGlyph icon={icon} size={iconSize} color={glyph} />
                    </Swatch>
                  );
                })}
          </Card>
        </View>

        <View style={{ gap: space.x2 }}>
          <SettingsHeading>{t.hostAccent}</SettingsHeading>
          <Card>
            <Swatch
              testID="host-color-default"
              label={t.hostColorDefault}
              selected={look.color === undefined}
              ring={theme.color.fg}
              fill={theme.color.accent}
              onPress={() => setColor(undefined)}
            >
              {look.color === undefined ? (
                <CheckIcon color={theme.color.onAccent} size={iconSize} />
              ) : null}
            </Swatch>
            {HOST_COLOR_IDS.map((id) => {
              const swatch = HOST_COLORS[id][theme.scheme];
              const selected = look.color === id;
              return (
                <Swatch
                  key={id}
                  testID={`host-color-${id}`}
                  label={t.hostColorName[id]}
                  selected={selected}
                  ring={hostColorInk(theme.scheme, theme.color, id)}
                  fill={swatch}
                  onPress={() => setColor(id)}
                >
                  {selected ? (
                    <CheckIcon
                      color={
                        contrast(swatch, theme.color.base) > contrast(swatch, theme.color.fg)
                          ? theme.color.base
                          : theme.color.fg
                      }
                      size={iconSize}
                    />
                  ) : null}
                </Swatch>
              );
            })}
          </Card>
          <Text variant="meta" tone="muted" style={{ paddingHorizontal: space.x5 }}>
            {t.hostColorHint}
          </Text>
        </View>

        <SettingsSection on={SHEET_GROUP}>
          <SettingsRow
            on={SHEET_GROUP}
            title={t.hostLookReset}
            tone="danger"
            onPress={() =>
              confirmDestructive(
                t.confirmAction(t.hostLookReset),
                undefined,
                t.hostLookReset,
                () => {
                  setSet('symbol');
                  setNameDraft('');
                  actions.onChange(DEFAULT_HOST_LOOK);
                },
              )
            }
          />
        </SettingsSection>
      </KeyboardFormScroll>
    </View>
  );
}
