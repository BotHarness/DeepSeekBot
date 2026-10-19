import * as Clipboard from 'expo-clipboard';
import { useState, useSyncExternalStore } from 'react';
import { Platform, View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { Button } from '../primitives/button';
import { Text } from '../primitives/text';
import { PhotoIcon } from '../shell/icons';
import { t } from '../strings';

type ClipboardState = { image: boolean; generation: number };

let state: ClipboardState = { image: false, generation: 0 };
const readClipboard = () => state;

function subscribeClipboard(notify: () => void) {
  let active = true;
  let changed = false;
  const subscription = Clipboard.addClipboardListener((event) => {
    changed = true;
    state = {
      image: event.contentTypes.includes(Clipboard.ContentType.IMAGE),
      generation: state.generation + 1,
    };
    notify();
  });
  void Clipboard.hasImageAsync().then(
    (image) => {
      if (!active || changed || image === state.image) return;
      state = { ...state, image };
      notify();
    },
    () => {},
  );
  return () => {
    active = false;
    subscription.remove();
  };
}

const unsubscribed = () => () => {};

const nativePasteButton = Platform.OS === 'ios' && Clipboard.isPasteButtonAvailable;

export const clipboardPasteAvailable = nativePasteButton || Platform.OS === 'android';

const IMAGE = { format: 'jpeg', jpegQuality: 0.8 } as const;

async function readClipboardImage(onPaste: (data: string) => void) {
  const image = await Clipboard.getImageAsync(IMAGE).catch(() => null);
  if (image !== null) onPaste(image.data);
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

export function ClipboardImageOffer({ onPaste }: { onPaste(data: string): void }) {
  const theme = useDesignTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: space.x3,
        paddingHorizontal: space.x4,
        paddingVertical: space.x2,
      }}
    >
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
          }}
        />
      ) : (
        <View>
          <Button
            testID="composer-paste-image"
            label={t.pasteImage}
            variant="text"
            on="canvas"
            icon={<PhotoIcon color={theme.color.fg} size={theme.type.body.line} />}
            onPress={() => void readClipboardImage(onPaste)}
          />
        </View>
      )}
    </View>
  );
}
