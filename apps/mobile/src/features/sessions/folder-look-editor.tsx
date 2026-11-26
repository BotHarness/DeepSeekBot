import { useState, type ReactElement } from 'react';
import { View } from 'react-native';
import {
  HOST_COLOR_IDS,
  HOST_COLORS,
  HOST_EMOJI,
  HOST_SYMBOL_IDS,
  hostColorInk,
  type HostColorId,
} from '@botharness/host-client/ui/design/host-look';
import type { WorkspaceLook, WorkspaceLookIcon } from '@botharness/host-protocol/host-sessions';
import { contrast } from '../../ui/design/resolve-theme';
import { useDesignTheme } from '../../ui/design/theme';
import { space } from '../../ui/design/tokens';
import type { LayerName } from '../../ui/design/layers';
import { KeyboardFormScroll } from '../../ui/primitives/keyboard-form';
import { Segmented } from '../../ui/primitives/segmented';
import { SettingsHeading, SettingsRow, SettingsSection } from '../../ui/primitives/settings-row';
import { SheetHeader } from '../../ui/primitives/sheet-header';
import { SheetSaveButton } from '../../ui/primitives/sheet-save-button';
import { Text } from '../../ui/primitives/text';
import { HostGlyph } from '../../ui/shell/host-tile';
import { LookCard, LookSwatch } from '../../ui/shell/host-look-editor';
import { CheckIcon } from '../../ui/shell/icons';
import { useStrings } from '../../ui/strings';
import { SessionFolderAvatar } from './session-folder-avatar';
import { folderColor, folderMonogram } from './session-query-model';

type IconSet = WorkspaceLookIcon['kind'];

const SHEET_GROUP: LayerName = 'raised';

const sameIcon = (a: WorkspaceLookIcon | undefined, b: WorkspaceLookIcon) =>
  a?.kind === b.kind &&
  (a.kind === 'monogram' ||
    (a.kind === 'symbol' && b.kind === 'symbol' && a.id === b.id) ||
    (a.kind === 'emoji' && b.kind === 'emoji' && a.emoji === b.emoji));

export function FolderLookEditor({
  folderName,
  autoColor: assigned,
  look: initial,
  onSave,
  onClose,
}: {
  folderName: string | undefined;
  autoColor?: string | undefined;
  look: WorkspaceLook;
  onSave(look: WorkspaceLook | null): Promise<void>;
  onClose(): void;
}) {
  const strings = useStrings();
  const t = strings.hostSessions;
  const theme = useDesignTheme();
  const [look, setLook] = useState<WorkspaceLook>(initial);
  const [set, setSet] = useState<IconSet>(initial.icon?.kind ?? 'symbol');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const auto: HostColorId = (HOST_COLOR_IDS as readonly string[]).includes(assigned ?? '')
    ? (assigned as HostColorId)
    : folderColor(folderName);
  const color = (look.color as HostColorId | undefined) ?? auto;
  const ink = hostColorInk(theme.scheme, theme.color, color);
  const iconSize = theme.type.title.line;
  const setIcon = (icon: WorkspaceLookIcon) => setLook({ ...look, icon });
  const setColor = (id: HostColorId | undefined) =>
    setLook({
      ...(look.icon === undefined ? {} : { icon: look.icon }),
      ...(id === undefined ? {} : { color: id }),
    });
  const save = async (next: WorkspaceLook | null) => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await onSave(next !== null && Object.keys(next).length === 0 ? null : next);
      onClose();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };
  const iconSwatch = (icon: WorkspaceLookIcon, key: string, label: string, glyph: ReactElement) => {
    const selected = sameIcon(look.icon, icon);
    return (
      <LookSwatch
        key={key}
        testID={`folder-icon-${key}`}
        label={label}
        selected={selected}
        ring={ink}
        fill={selected ? theme.layer[SHEET_GROUP].inset : 'transparent'}
        onPress={() => setIcon(icon)}
      >
        {glyph}
      </LookSwatch>
    );
  };
  return (
    <View style={{ flex: 1 }}>
      <SheetHeader
        title={t.folderLook}
        onBack={onClose}
        trailing={
          <SheetSaveButton
            label={t.folderLookSave}
            testID="folder-look-save"
            busy={busy}
            disabled={false}
            onPress={() => void save(look)}
          />
        }
      />
      <KeyboardFormScroll
        pointerEvents={busy ? 'none' : 'auto'}
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: space.x6, padding: space.x5 }}
      >
        <View style={{ alignItems: 'center', gap: space.x2 }}>
          <SessionFolderAvatar
            testID="folder-look-preview"
            folderName={folderName}
            colorId={auto}
            look={look}
            size={theme.touch * 2}
            corner={theme.touch / 2}
          />
          {folderName === undefined ? null : (
            <Text variant="meta" tone="muted" numberOfLines={1}>
              {folderName}
            </Text>
          )}
        </View>
        {failed ? <Text tone="danger">{t.folderLookSaveFailed}</Text> : null}

        <View style={{ gap: space.x2 }}>
          <SettingsHeading>{t.folderLookIcon}</SettingsHeading>
          <Segmented<IconSet>
            label={t.folderLookIcon}
            on={SHEET_GROUP}
            value={set}
            onChange={(next) => {
              setSet(next);
              if (next === 'monogram') setIcon({ kind: 'monogram' });
            }}
            options={[
              { value: 'symbol', label: strings.hostIconSymbols },
              { value: 'emoji', label: strings.hostIconEmoji },
              { value: 'monogram', label: t.folderLookLetters },
            ]}
          />
          <LookCard>
            {set === 'symbol'
              ? HOST_SYMBOL_IDS.map((id) =>
                  iconSwatch(
                    { kind: 'symbol', id },
                    id,
                    strings.hostSymbol[id],
                    <HostGlyph
                      icon={{ kind: 'symbol', id }}
                      size={iconSize}
                      color={sameIcon(look.icon, { kind: 'symbol', id }) ? ink : theme.color.muted}
                    />,
                  ),
                )
              : set === 'emoji'
                ? HOST_EMOJI.map((emoji) =>
                    iconSwatch(
                      { kind: 'emoji', emoji },
                      emoji,
                      emoji,
                      <HostGlyph icon={{ kind: 'emoji', emoji }} size={iconSize} color={ink} />,
                    ),
                  )
                : iconSwatch(
                    { kind: 'monogram' },
                    'monogram',
                    t.folderLookLetters,
                    <Text strong style={{ color: ink }}>
                      {folderMonogram(folderName)}
                    </Text>,
                  )}
          </LookCard>
        </View>

        <View style={{ gap: space.x2 }}>
          <SettingsHeading>{t.folderLookColor}</SettingsHeading>
          <LookCard>
            <LookSwatch
              testID="folder-color-auto"
              label={t.folderLookAuto}
              selected={look.color === undefined}
              ring={theme.color.fg}
              fill={HOST_COLORS[auto][theme.scheme]}
              onPress={() => setColor(undefined)}
            >
              {look.color === undefined ? (
                <CheckIcon color={theme.color.base} size={iconSize} />
              ) : (
                <Text variant="meta" strong style={{ color: theme.color.base }}>
                  A
                </Text>
              )}
            </LookSwatch>
            {HOST_COLOR_IDS.map((id) => {
              const swatch = HOST_COLORS[id][theme.scheme];
              const selected = look.color === id;
              return (
                <LookSwatch
                  key={id}
                  testID={`folder-color-${id}`}
                  label={strings.hostColorName[id]}
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
                </LookSwatch>
              );
            })}
          </LookCard>
          <Text variant="meta" tone="muted" style={{ paddingHorizontal: space.x5 }}>
            {t.folderLookHint}
          </Text>
        </View>

        <SettingsSection on={SHEET_GROUP}>
          <SettingsRow
            on={SHEET_GROUP}
            title={t.folderLookReset}
            tone="danger"
            testID="folder-look-reset"
            onPress={() => void save(null)}
          />
        </SettingsSection>
      </KeyboardFormScroll>
    </View>
  );
}
