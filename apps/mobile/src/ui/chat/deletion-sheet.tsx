import { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { deletionPreviewStore } from '../../host/deletion-preview';
import { ScrollView, View } from 'react-native';
import {
  confirmBotDeletion,
  deleteGroupOrSection,
  previewDeletion,
  retryBotDeletion,
  type DeletionClient,
  type DeletionTarget,
} from '../../host/deletion';
import { space } from '../design/tokens';
import { Button } from '../primitives/button';
import { Text } from '../primitives/text';
import { Toggle } from '../primitives/toggle';
import { useStrings } from '../strings';
import { Sheet } from './sheet';

export function DeletionSheet({
  target,
  client,
  hostName,
  onClose,
  onDeleted,
}: {
  target: DeletionTarget;
  client: DeletionClient;
  hostName: string;
  onClose(): void;
  onDeleted(): void;
}) {
  const t = useStrings();
  const store = useMemo(
    () => deletionPreviewStore(client, target.kind === 'bot' ? target.id : undefined),
    [client, target.kind, target.id],
  );
  const previewState = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const { preview } = previewState;
  const setPreview = store.setPreview;
  const [erase, setErase] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setError] = useState<string>();
  const error = actionError ?? (previewState.failed ? t.deletion.previewFailed : undefined);

  const [completed, setCompleted] = useState(false);
  const submitting = useRef(false);
  const label =
    target.kind === 'bot'
      ? t.deletion.deleteBot
      : target.kind === 'group'
        ? t.deletion.dissolve
        : t.deletion.deleteSection;
  const close = () => {
    if (!submitting.current) onClose();
  };
  const perform = async () => {
    if (submitting.current || (!completed && target.kind === 'bot' && !preview)) return;
    submitting.current = true;
    setBusy(true);
    setError(undefined);
    try {
      if (!completed && target.kind === 'bot' && preview) {
        const deletion =
          preview.deletion?.phase === 'complete'
            ? preview.deletion
            : preview.deletion
              ? await retryBotDeletion(client, target.id)
              : await confirmBotDeletion(client, preview, erase);
        if (!store.active()) return;
        setPreview({ ...preview, deletion });
        if (deletion.phase !== 'complete') {
          setError(t.deletion.incomplete);
          return;
        }
      } else if (!completed) await deleteGroupOrSection(client, target);
      setCompleted(true);
      await client.refresh();
      if (store.active()) onDeleted();
    } catch {
      if (!store.active()) return;
      setErase(false);
      setError(t.deletion.failed);
      if (target.kind === 'bot' && !completed) {
        setPreview(undefined);
        try {
          const next = await previewDeletion(client, target.id);
          if (store.active()) setPreview(next);
        } catch {}
      }
    } finally {
      submitting.current = false;
      if (store.active()) setBusy(false);
    }
  };
  return (
    <Sheet visible label={label} title={label} onClose={close}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: space.x5, gap: space.x4 }}
      >
        <Text variant="title" strong>
          {preview?.displayName ?? target.name}
        </Text>
        <Text tone="muted">{t.deletion.scope(hostName)}</Text>
        <Text>
          {target.kind === 'bot'
            ? t.deletion.botBody
            : target.kind === 'group'
              ? t.deletion.groupBody
              : t.deletion.sectionBody}
        </Text>
        {target.kind === 'bot' && !preview && !error ? <Text>{t.loading}</Text> : null}
        {preview ? (
          <>
            <Text tone="muted">
              {t.deletion.dependencies(
                preview.dependencies.sessions.length,
                preview.dependencies.grants.length + preview.dependencies.identities.length,
                preview.dependencies.channels.length,
              )}
            </Text>
            <Text strong>{t.deletion.memory}</Text>
            <Text testID="deletion-memory-path" selectable>
              {preview.memoryDir}
            </Text>
            {preview.dependencies.workspaces.map((path) => (
              <Text key={path} tone="muted" selectable>
                {path}
              </Text>
            ))}
            {preview.deletion ? (
              <Text>
                {preview.deletion.eraseMemory ? t.deletion.eraseChosen : t.deletion.retained}
              </Text>
            ) : (
              <>
                <View style={{ gap: space.x2 }}>
                  <Text>{t.deletion.erase}</Text>
                  <Toggle
                    testID="deletion-erase-memory"
                    label={t.deletion.erase}
                    value={erase}
                    disabled={busy || !preview.eraseAvailable}
                    onChange={setErase}
                  />
                </View>
                <Text tone="muted">{t.deletion.eraseBody}</Text>
                {!preview.eraseAvailable ? (
                  <Text tone="warning">{t.deletion.eraseUnavailable}</Text>
                ) : null}
              </>
            )}
          </>
        ) : null}
        {error ? (
          <Text accessibilityRole="alert" tone="danger">
            {error}
          </Text>
        ) : null}
        {!completed && target.kind === 'bot' && !preview && error ? (
          <Button
            testID="deletion-preview-retry"
            label={t.retry}
            onPress={() => {
              setErase(false);
              setError(undefined);
              void store.load();
            }}
          />
        ) : null}
        <Button
          testID="deletion-confirm"
          label={completed ? t.retry : preview?.deletion ? t.deletion.retry : label}
          tone="danger"
          busy={busy}
          disabled={!completed && target.kind === 'bot' && !preview}
          onPress={() => void perform()}
        />
        <Button
          testID="deletion-cancel"
          label={t.cancel}
          disabled={busy}
          variant="text"
          onPress={close}
        />
      </ScrollView>
    </Sheet>
  );
}
