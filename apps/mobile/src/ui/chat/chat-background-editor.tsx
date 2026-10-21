import { useState, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import type {
  BackgroundChoice,
  BackgroundEdit,
  BackgroundSource,
} from '../../host/chat-background';
import { DesignThemeProvider, useDesignTheme, type ColorScheme } from '../design/theme';
import { backgroundColors } from '../design/background-colors';
import { radius, space } from '../design/tokens';
import { Button } from '../primitives/button';
import { PercentageSlider } from '../primitives/percentage-slider';
import { Text } from '../primitives/text';
import { Segmented } from '../primitives/segmented';
import { t } from '../strings';
import { backgroundOverflow } from './background-position';
import { BackgroundPreview } from './background-preview';

export function ChatBackgroundEditor({
  edit,
  inherited,
  scoped = false,
  imageUri,
  onPickImage,
  onDone,
  onCancel,
}: {
  edit: BackgroundEdit;
  inherited: BackgroundChoice;
  scoped?: boolean;
  imageUri(id: string): string;
  onPickImage(): Promise<BackgroundSource | undefined>;
  onDone(): void;
  onCancel(): void;
}) {
  const theme = useDesignTheme();
  const state = useSyncExternalStore(edit.subscribe, edit.getSnapshot);
  const [pickError, setPickError] = useState(false);
  const [picking, setPicking] = useState(false);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [previewScheme, setPreviewScheme] = useState<ColorScheme>(theme.scheme);
  const busy = state.busy || picking;
  const choice = state.choice ?? inherited;
  const image = state.choice?.kind === 'image' ? state.choice : undefined;
  const overflow =
    choice.kind === 'image' ? backgroundOverflow(choice, viewport, choice.fit) : { x: 0, y: 0 };
  const crop = { x: overflow.x >= 1, y: overflow.y >= 1 };
  const chooseImage = () => {
    if (busy) return;
    setPickError(false);
    setPicking(true);
    void onPickImage()
      .then((source) => (source === undefined ? undefined : edit.pick(source.uri, source)))
      .catch(() => setPickError(true))
      .finally(() => setPicking(false));
  };
  return (
    <View style={{ flex: 1, backgroundColor: theme.overlay.fill }}>
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: space.x5, gap: space.x5 }}
      >
        <Text variant="meta" tone="muted">
          {t.chatBackground.local}
        </Text>
        {scoped ? (
          <Text variant="meta" tone="muted">
            {state.choice === undefined
              ? t.chatBackground.inherited(
                  {
                    default: t.chatBackground.theme,
                    color: t.chatBackground.solid,
                    image: t.chatBackground.image,
                  }[inherited.kind],
                )
              : t.chatBackground.override}
          </Text>
        ) : null}
        <Segmented
          label={t.chatBackground.type}
          value={state.choice?.kind ?? 'inherit'}
          options={[
            ...(scoped ? [{ value: 'inherit' as const, label: t.chatBackground.useDefault }] : []),
            { value: 'default', label: t.chatBackground.theme },
            { value: 'color', label: t.chatBackground.solid },
            { value: 'image', label: t.chatBackground.image },
          ]}
          onChange={(kind) => {
            if (busy) return;
            if (kind === 'image') chooseImage();
            else
              edit.choose(
                kind === 'color'
                  ? { kind: 'color', color: backgroundColors[0] }
                  : kind === 'default'
                    ? { kind: 'default' }
                    : undefined,
              );
          }}
        />
        <Segmented<ColorScheme>
          label={t.chatBackground.previewAppearance}
          value={previewScheme}
          options={[
            { value: 'light', label: t.chatBackground.light },
            { value: 'dark', label: t.chatBackground.dark },
          ]}
          onChange={setPreviewScheme}
        />
        <DesignThemeProvider appearance={{ scheme: previewScheme }}>
          <BackgroundPreview
            viewport={viewport}
            onViewport={setViewport}
            choice={choice}
            imageUri={imageUri}
            onChange={image === undefined ? undefined : (next) => edit.choose(next)}
          >
            <PreviewMessages />
          </BackgroundPreview>
        </DesignThemeProvider>
        {state.choice?.kind !== 'color' ? null : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.x3 }}>
            {backgroundColors.map((color, index) => (
              <Pressable
                key={color}
                accessibilityRole="radio"
                accessibilityLabel={`${t.chatBackground.solid} ${index + 1}`}
                accessibilityState={{
                  checked: state.choice?.kind === 'color' && state.choice.color === color,
                }}
                disabled={busy}
                onPress={() => edit.choose({ kind: 'color', color })}
                style={{
                  width: theme.touch,
                  height: theme.touch,
                  borderRadius: radius.round,
                  backgroundColor: color,
                  borderWidth:
                    state.choice?.kind === 'color' && state.choice.color === color ? space.x1 : 0,
                  borderColor: theme.color.accent,
                }}
              />
            ))}
          </View>
        )}
        <Button label={t.chatBackground.chooseImage} busy={busy} onPress={chooseImage} />
        {image === undefined ? null : (
          <View style={{ gap: space.x3 }}>
            <Segmented
              label={t.chatBackground.fit}
              value={image.fit}
              options={[
                { value: 'cover', label: t.chatBackground.fill },
                { value: 'contain', label: t.chatBackground.fit },
              ]}
              onChange={(fit) => edit.choose({ ...image, fit })}
            />
            <Text variant="meta" tone="muted">
              {t.chatBackground.drag}
            </Text>
            <View style={{ gap: space.x2 }}>
              {crop.x ? (
                <>
                  <Text>{`${t.chatBackground.horizontal} · ${Math.round(image.x * 100)}%`}</Text>
                  <PercentageSlider
                    label={t.chatBackground.horizontal}
                    value={Math.round(image.x * 100)}
                    onChange={(x) => edit.choose({ ...image, x: x / 100 })}
                  />
                </>
              ) : null}
              {crop.y ? (
                <>
                  <Text>{`${t.chatBackground.vertical} · ${Math.round(image.y * 100)}%`}</Text>
                  <PercentageSlider
                    label={t.chatBackground.vertical}
                    value={Math.round(image.y * 100)}
                    onChange={(y) => edit.choose({ ...image, y: y / 100 })}
                  />
                </>
              ) : null}
              <Button
                label={t.chatBackground.center}
                disabled={busy}
                onPress={() => edit.choose({ ...image, x: 0.5, y: 0.5 })}
              />
            </View>
            <Text>{`${t.chatBackground.fade} · ${image.fade}%`}</Text>
            <PercentageSlider
              label={t.chatBackground.fade}
              value={image.fade}
              onChange={(fade) => edit.choose({ ...image, fade })}
            />
            <Text variant="meta" tone="muted">
              {t.chatBackground.fadeHint}
            </Text>
          </View>
        )}
      </ScrollView>
      <View style={{ padding: space.x5, gap: space.x3 }}>
        {state.error || pickError ? (
          <Text accessibilityRole="alert" tone="danger">
            {t.chatBackground.failed}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', gap: space.x3 }}>
          <View style={{ flex: 1 }}>
            <Button label={t.cancel} disabled={busy} onPress={onCancel} />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label={t.done}
              tone="primary"
              busy={busy}
              onPress={() => {
                void edit
                  .save()
                  .then(onDone)
                  .catch(() => {});
              }}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

function PreviewMessages() {
  const theme = useDesignTheme();
  return (
    <>
      <View
        style={{
          alignSelf: 'flex-end',
          padding: space.x4,
          borderRadius: radius.lg,
          backgroundColor: theme.layer.raised.fill,
        }}
      >
        <Text>{t.chatBackground.sampleHuman}</Text>
      </View>
      <View
        style={{
          alignSelf: 'flex-start',
          padding: space.x4,
          borderRadius: radius.lg,
          backgroundColor: theme.layer.raised.fill,
        }}
      >
        <Text>{t.chatBackground.sampleBot}</Text>
      </View>
    </>
  );
}
