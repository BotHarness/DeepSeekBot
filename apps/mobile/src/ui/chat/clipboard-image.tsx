import * as Clipboard from 'expo-clipboard';
import { useState, useSyncExternalStore } from 'react';
import { AppState, Platform, View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
import { useLiquidGlass } from '../primitives/drawer-material';
import { Button } from '../primitives/button';
import { Text } from '../primitives/text';
import { PhotoIcon } from '../shell/icons';
import { t } from '../strings';
import { ComposerFieldMaterial } from './composer-chrome';

type ClipboardState = { image: boolean; generation: number };

const FOCUS_SETTLE = 500;

let state: ClipboardState = { image: false, generation: 0 };
const readClipboard = () => state;

function subscribeClipboard(notify: () => void) {
  let active = true;
  let changed = false;
  let latest = 0;
  const subscription = Clipboard.addClipboardListener((event) => {
    changed = true;
    state = {
      image: event.contentTypes.includes(Clipboard.ContentType.IMAGE),
      generation: state.generation + 1,
    };
    notify();
  });
  const refresh = (returning: boolean) => {
    const request = ++latest;
    changed = false;
    void Clipboard.hasImageAsync().then(
      (image) => {
        if (!active || request !== latest || changed) return;
        if (image === state.image && !(returning && image)) return;
        state = { image, generation: returning ? state.generation + 1 : state.generation };
        notify();
      },
      () => {},
    );
  };
  let settle: ReturnType<typeof setTimeout> | undefined;
  const foreground = AppState.addEventListener('change', (next) => {
    if (next !== 'active') return;
    refresh(true);
    if (Platform.OS !== 'android') return;
    clearTimeout(settle);
    settle = setTimeout(() => refresh(!state.image), FOCUS_SETTLE);
  });
  refresh(false);
  return () => {
    active = false;
    clearTimeout(settle);
    subscription.remove();
    foreground.remove();
  };
}

const unsubscribed = () => () => {};

const nativePasteButton = Platform.OS === 'ios' && Clipboard.isPasteButtonAvailable;

export const clipboardPasteAvailable = nativePasteButton || Platform.OS === 'android';

const IMAGE = { format: 'jpeg', jpegQuality: 0.8 } as const;

async function readClipboardImage(onPaste: (data: string) => void, onUnreadable: () => void) {
  const image = await Clipboard.getImageAsync(IMAGE).catch(() => null);
  if (image === null) onUnreadable();
  else onPaste(image.data);
}

export function useClipboardImage(watching: boolean) {
  const current = useSyncExternalStore(
    watching && clipboardPasteAvailable ? subscribeClipboard : unsubscribed,
    readClipboard,
  );
  const [used, setUsed] = useState(-1);
  return {
    offered: watching && clipboardPasteAvailable && current.image && used !== current.generation,
    used: () => setUsed(current.generation),
  };
}

export function ClipboardImageOffer({
  onPaste,
  onUnreadable,
}: {
  onPaste(data: string): void;
  onUnreadable(): void;
}) {
  const theme = useDesignTheme();
  const glass = useLiquidGlass();
  const corner = glass ? radius.xl : radius.lg;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: space.x3,
        marginBottom: space.x2,
        paddingHorizontal: glass ? space.x5 : space.x4,
        paddingVertical: space.x2,
        borderRadius: corner,
        ...(glass
          ? {}
          : {
              borderWidth: edge.hairline,
              borderColor: theme.layer.sheet.edge,
              backgroundColor: theme.layer.sheet.fill,
            }),
      }}
    >
      {glass ? <ComposerFieldMaterial cornerRadius={corner} /> : null}
      <Text variant="meta" tone="muted" style={{ flexShrink: 1 }}>
        {t.clipboardImage}
      </Text>
      {nativePasteButton ? (
        <Clipboard.ClipboardPasteButton
          testID="composer-paste-image"
          acceptedContentTypes={['image']}
          imageOptions={IMAGE}
          displayMode={theme.largeText ? 'iconOnly' : 'iconAndLabel'}
          cornerStyle="capsule"
          backgroundColor={theme.color.surface}
          foregroundColor={theme.color.fg}
          style={{ height: theme.touch, width: theme.largeText ? theme.touch : theme.touch * 2.5 }}
          onPress={(data) => {
            if (data.type === 'image') onPaste(data.data);
            else onUnreadable();
          }}
        />
      ) : (
        <View>
          <Button
            testID="composer-paste-image"
            label={t.pasteImage}
            variant="text"
            on="sheet"
            icon={<PhotoIcon color={theme.color.fg} size={theme.type.body.line} />}
            onPress={() => void readClipboardImage(onPaste, onUnreadable)}
          />
        </View>
      )}
    </View>
  );
}
