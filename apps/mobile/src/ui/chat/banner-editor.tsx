import { Image } from 'expo-image';
import { View } from 'react-native';
import { useRef, useState } from 'react';
import { profileShell, radius, space } from '../design/tokens';
import { Button } from '../primitives/button';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { Sheet, SheetActions } from './sheet';

export interface BannerActions {
  pick(): Promise<string | undefined>;
  save(image: string | null): Promise<void>;
}

export function BannerEditor({ actions, onClose }: { actions: BannerActions; onClose(): void }) {
  const t = useStrings();
  const copy = t.profileBanner;
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<string>();
  const [error, setError] = useState<string>();

  const run = async (work: () => Promise<void>, failure: string) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await work();
    } catch {
      setError(failure);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const choose = () =>
    void run(async () => {
      const image = await actions.pick();
      if (image !== undefined) setDraft(image);
    }, t.avatarPickFailed);
  const save = (image: string | null) =>
    void run(async () => {
      await actions.save(image);
      onClose();
    }, t.dialogFailed);
  const close = () => {
    if (!pending.current) onClose();
  };

  return (
    <Sheet visible label={copy.change} title={copy.change} onClose={close}>
      <View style={{ gap: space.x3, paddingHorizontal: space.x5 }}>
        {draft === undefined ? null : (
          <Image
            accessible
            accessibilityLabel={copy.preview}
            source={{ uri: draft }}
            contentFit="contain"
            style={{
              width: '100%',
              aspectRatio: profileShell.bannerAspect,
              borderRadius: radius.md,
            }}
          />
        )}
        <Button label={t.avatarChoose} testID="bot-banner-pick" disabled={busy} onPress={choose} />
        <Button
          label={copy.restore}
          testID="bot-banner-restore"
          disabled={busy}
          onPress={() => save(null)}
        />
        {error === undefined ? null : (
          <Text accessibilityRole="alert" accessibilityLiveRegion="polite" tone="danger">
            {error}
          </Text>
        )}
      </View>
      <SheetActions>
        <Button label={t.cancel} disabled={busy} onPress={close} />
        <Button
          tone="primary"
          label={copy.save}
          testID="bot-banner-save"
          busy={busy}
          disabled={draft === undefined}
          onPress={() => {
            if (draft !== undefined) save(draft);
          }}
        />
      </SheetActions>
    </Sheet>
  );
}
