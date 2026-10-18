import { TextInput } from '../primitives/system-text';
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { KeyboardFormScroll } from '../primitives/keyboard-form';
import { SvgXml } from 'react-native-svg';

import {
  BANNER_COLORS,
  BANNER_GRADIENTS,
  bannerHex,
  DEFAULT_HOST_LOOK,
  HEX_PLACEHOLDER,
  HOST_AVATAR_PRESETS,
  HOST_NAME_MAX,
  hostLookName,
  shownHostName,
  withHostName,
  type HostAvatar,
  type HostBanner,
  type HostLook,
} from '../design/host-look';
import { useDesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
import { Button } from '../primitives/button';
import { Text } from '../primitives/text';
import { Notice } from '../request-parts';
import { t } from '../strings';
import { Chip } from '../primitives/chip';
import { GradientFill } from './gradient-fill';
import { HostBandLayer, HostChipFace, useHostBand } from './host-band';
import { hostInitial, HostTile, presetAvatarSvg } from './host-tile';

export interface HostLookActions {
  onChange(look: HostLook): void;
  onPickImage(slot: 'avatar' | 'banner'): Promise<string | undefined>;
  onClose(): void;
}

type BannerKind = HostBanner['kind'];

const KINDS: readonly BannerKind[] = ['accent', 'color', 'gradient', 'image'];

const KIND_LABEL: Record<BannerKind, string> = {
  accent: t.bannerAccent,
  color: t.bannerSolid,
  gradient: t.bannerGradient,
  image: t.bannerImage,
};

function Preview({ hostName, look }: { hostName: string; look: HostLook }) {
  const theme = useDesignTheme();
  const band = useHostBand(look.banner);
  return (
    <View
      accessibilityLabel={t.hostLookPreview}
      style={{ borderRadius: radius.lg, overflow: 'hidden' }}
    >
      <HostBandLayer
        band={band}
        banner={look.banner}
        flex={false}
        header={
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.x4,
              paddingTop: space.x6,
              paddingBottom: space.x5,
              paddingHorizontal: space.x5,
            }}
          >
            <HostChipFace hostName={hostName} avatar={look.avatar} band={band} />
          </View>
        }
      >
        <View
          style={{
            height: space.x6 * 2,
            backgroundColor: theme.color.base,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
          }}
        />
      </HostBandLayer>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: space.x3 }}>
      <Text variant="meta" tone="muted" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

function Swatch({
  label,
  selected,
  round = false,
  onPress,
  children,
}: {
  label: string;
  selected: boolean;
  round?: boolean;
  onPress(): void;
  children: ReactNode;
}) {
  const theme = useDesignTheme();
  const size = theme.touch + space.x3;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={({ pressed }) => ({
        width: size + space.x3,
        height: size + space.x3,
        padding: space.x1,
        borderRadius: round ? radius.round : radius.md + space.x2,
        borderWidth: edge.focus,
        borderColor: selected ? theme.color.fg : 'transparent',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View
        style={{
          flex: 1,
          borderRadius: round ? radius.round : radius.md,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.layer.raised.fill,
        }}
      >
        {children}
      </View>
    </Pressable>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.x2 }}>{children}</View>;
}

function HexField({
  label,
  value,
  onValid,
}: {
  label: string;
  value: string;
  onValid(hex: string): void;
}) {
  const theme = useDesignTheme();
  const [draft, setDraft] = useState(value);
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    if (bannerHex(draft) !== bannerHex(value)) setDraft(value);
  }
  const valid = bannerHex(draft) !== undefined;
  return (
    <View style={{ flex: 1, gap: space.x2 }}>
      <Text variant="meta" tone="muted">
        {label}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.x3,
          minHeight: theme.touch,
          paddingHorizontal: space.x4,
          borderRadius: radius.md,
          borderWidth: edge.hairline,
          borderColor: valid ? theme.layer.field.edge : theme.color.danger,
          backgroundColor: theme.layer.field.fill,
        }}
      >
        <View
          style={{
            width: space.x5,
            height: space.x5,
            borderRadius: radius.round,
            backgroundColor: bannerHex(draft) ?? value,
          }}
        />
        <TextInput
          accessibilityLabel={label}
          value={draft}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={7}
          placeholder={HEX_PLACEHOLDER}
          placeholderTextColor={theme.color.subtle}
          onChangeText={(text) => {
            setDraft(text);
            const hex = bannerHex(text);
            if (hex !== undefined) onValid(hex);
          }}
          style={{
            flex: 1,
            minHeight: theme.touch,
            color: theme.color.fg,
            fontSize: theme.type.body.size,
            fontFamily: theme.mono,
          }}
        />
      </View>
    </View>
  );
}

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
  const [kind, setKind] = useState<BannerKind>(look.banner.kind);
  const [pickError, setPickError] = useState(false);
  const [nameDraft, setNameDraft] = useState(look.name ?? '');
  const [stored, setStored] = useState(look);
  if (stored !== look) {
    setStored(look);
    if (look.banner.kind !== stored.banner.kind) setKind(look.banner.kind);
    if (look.name !== stored.name && hostLookName(nameDraft) !== look.name)
      setNameDraft(look.name ?? '');
  }
  const shown = shownHostName(look, hostName);
  const setAvatar = (avatar: HostAvatar) => actions.onChange({ ...look, avatar });
  const setBanner = (banner: HostBanner) => actions.onChange({ ...look, banner });
  const banner = look.banner;
  const color = banner.kind === 'color' ? banner.color : BANNER_COLORS[0];
  const gradient =
    banner.kind === 'gradient' ? { from: banner.from, to: banner.to } : BANNER_GRADIENTS[0];

  const pick = (slot: 'avatar' | 'banner') => {
    setPickError(false);
    actions.onPickImage(slot).then(
      (uri) => {
        if (uri === undefined) return;
        if (slot === 'avatar') setAvatar({ kind: 'image', uri });
        else setBanner({ kind: 'image', uri });
      },
      () => setPickError(true),
    );
  };

  const choose = (next: BannerKind) => {
    setKind(next);
    if (next === 'accent') setBanner({ kind: 'accent' });
    if (next === 'color' && banner.kind !== 'color') setBanner({ kind: 'color', color });
    if (next === 'gradient' && banner.kind !== 'gradient')
      setBanner({ kind: 'gradient', ...gradient });
  };

  return (
    <KeyboardFormScroll
      nestedScrollEnabled
      style={{ flex: 1 }}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ gap: space.x6, padding: space.x5 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: -space.x3 }}>
        <Text variant="title" accessibilityRole="header" style={{ flex: 1 }}>
          {t.hostLook}
        </Text>
        <Pressable
          onPress={actions.onClose}
          accessibilityRole="button"
          accessibilityLabel={t.done}
          style={({ pressed }) => ({
            minWidth: theme.touch,
            minHeight: theme.touch,
            paddingHorizontal: space.x3,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text tone="accent" strong>
            {t.done}
          </Text>
        </Pressable>
      </View>
      <Preview hostName={shown} look={look} />

      <Section title={t.hostLookName}>
        <TextInput
          accessibilityLabel={t.hostLookName}
          value={nameDraft}
          placeholder={hostName}
          placeholderTextColor={theme.color.subtle}
          maxLength={HOST_NAME_MAX}
          autoCorrect={false}
          returnKeyType="done"
          onChangeText={(text) => {
            setNameDraft(text);
            actions.onChange(withHostName(look, text));
          }}
          style={{
            minHeight: theme.touch,
            paddingHorizontal: space.x4,
            borderRadius: radius.md,
            borderWidth: edge.hairline,
            borderColor: theme.layer.field.edge,
            backgroundColor: theme.layer.field.fill,
            color: theme.color.fg,
            fontSize: theme.type.body.size,
          }}
        />
      </Section>

      <Section title={t.hostAvatar}>
        <Grid>
          <Swatch
            label={t.hostAvatarInitial}
            selected={look.avatar.kind === 'initial'}
            onPress={() => setAvatar({ kind: 'initial' })}
          >
            <Text variant="title">{hostInitial(shown)}</Text>
          </Swatch>
          {HOST_AVATAR_PRESETS.map((id, index) => (
            <Swatch
              key={id}
              label={t.hostAvatarPreset(index + 1)}
              selected={look.avatar.kind === 'preset' && look.avatar.id === id}
              onPress={() => setAvatar({ kind: 'preset', id })}
            >
              <SvgXml xml={presetAvatarSvg(id)} width="100%" height="100%" />
            </Swatch>
          ))}
          <Swatch
            label={t.hostAvatarPhoto}
            selected={look.avatar.kind === 'image'}
            onPress={() => pick('avatar')}
          >
            {look.avatar.kind === 'image' ? (
              <HostTile
                hostName={shown}
                avatar={look.avatar}
                size={theme.touch + space.x2}
                fill={theme.layer.raised.fill}
                letter={theme.color.fg}
              />
            ) : (
              <Text variant="title" tone="muted">
                +
              </Text>
            )}
          </Swatch>
        </Grid>
      </Section>

      <Section title={t.hostBanner}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.x3 }}>
          {KINDS.map((option) => (
            <Chip
              key={option}
              label={KIND_LABEL[option]}
              selected={kind === option}
              onPress={() => choose(option)}
            />
          ))}
        </View>

        {kind === 'color' ? (
          <>
            <Grid>
              {BANNER_COLORS.map((hex) => (
                <Swatch
                  key={hex}
                  round
                  label={t.bannerSwatch(hex.toUpperCase())}
                  selected={banner.kind === 'color' && banner.color === hex}
                  onPress={() => setBanner({ kind: 'color', color: hex })}
                >
                  <View style={{ alignSelf: 'stretch', flex: 1, backgroundColor: hex }} />
                </Swatch>
              ))}
            </Grid>
            <HexField
              label={t.bannerCustom}
              value={color.toUpperCase()}
              onValid={(hex) => setBanner({ kind: 'color', color: hex })}
            />
          </>
        ) : null}

        {kind === 'gradient' ? (
          <>
            <Grid>
              {BANNER_GRADIENTS.map((stops) => (
                <Swatch
                  key={`${stops.from}-${stops.to}`}
                  label={t.bannerGradientSwatch(stops.from.toUpperCase(), stops.to.toUpperCase())}
                  selected={
                    banner.kind === 'gradient' &&
                    banner.from === stops.from &&
                    banner.to === stops.to
                  }
                  onPress={() => setBanner({ kind: 'gradient', ...stops })}
                >
                  <GradientFill
                    gradient={{ ...stops, fromOpacity: 1, toOpacity: 1, direction: 'diagonal' }}
                  />
                </Swatch>
              ))}
            </Grid>
            <View style={{ flexDirection: 'row', gap: space.x3 }}>
              <HexField
                label={t.bannerFrom}
                value={gradient.from.toUpperCase()}
                onValid={(from) => setBanner({ kind: 'gradient', from, to: gradient.to })}
              />
              <HexField
                label={t.bannerTo}
                value={gradient.to.toUpperCase()}
                onValid={(to) => setBanner({ kind: 'gradient', from: gradient.from, to })}
              />
            </View>
          </>
        ) : null}

        {kind === 'image' ? (
          <Button
            on="canvas"
            label={banner.kind === 'image' ? t.bannerChangePicture : t.bannerChoosePicture}
            onPress={() => pick('banner')}
          />
        ) : null}
      </Section>

      {pickError ? <Notice tone="danger">{t.hostLookPickFailed}</Notice> : null}

      <Button
        on="canvas"
        tone="danger"
        label={t.hostLookReset}
        onPress={() => {
          setKind('accent');
          setNameDraft('');
          actions.onChange(DEFAULT_HOST_LOOK);
        }}
      />
    </KeyboardFormScroll>
  );
}
