import { Segmented } from '../primitives/segmented';
import { Chip } from '../primitives/chip';
import { renderKeyboardFormScroll } from '../primitives/keyboard-form';
import { shareFeedbackArchive } from '../../host/share-feedback';
import { useMemo, useRef, useState } from 'react';
import { useMounted } from '../mounted';
import { FlatList, Pressable, View, type ViewInstance } from 'react-native';
import type { HostClient } from '../../host/client';
import {
  createMessageFeedback,
  type FeedbackPreview,
  type FeedbackReceipt,
} from '../../host/message-feedback';
import {
  feedbackTags,
  type FeedbackRating,
  type FeedbackSelection,
} from '../../../../../packages/core/src/diagnostics/feedback-contract';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { Toggle } from '../primitives/toggle';
import { Button } from '../primitives/button';
import { Text } from '../primitives/text';
import { TextField } from '../primitives/text-field';
import { SettingsRow } from '../primitives/settings-row';
import { useStrings } from '../strings';

const categories = [
  'conversation',
  'sessions',
  'inbox',
  'deliveries',
  'relatedChats',
  'wholeSessions',
] as const;
export function MessageFeedbackForm({
  client,
  channelId,
  messageId,
  onClose,
  onBusyChange,
}: {
  client: HostClient;
  channelId: string;
  messageId: string;
  onClose(): void;
  onBusyChange?(busy: boolean): void;
}) {
  const t = useStrings();
  const f = t.feedback;
  const theme = useDesignTheme();
  const api = useMemo(() => createMessageFeedback(client), [client]);
  const [scope, setScope] = useState<FeedbackSelection>({
    channelId,
    messageId,
    before: 20,
    after: 20,
    conversation: true,
    sessions: true,
    inbox: true,
    deliveries: true,
    relatedChats: true,
    wholeSessions: false,
  });
  const [rating, setRating] = useState<'good' | 'bad'>();
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [preview, setPreview] = useState<FeedbackPreview>();
  const [scopeKey, setScopeKey] = useState('');
  const [receipt, setReceipt] = useState<FeedbackReceipt>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const updateBusy = (value: boolean) => {
    setBusy(value);
    onBusyChange?.(value);
  };
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const frozen = useRef<{ token: string; feedback: FeedbackRating } | undefined>(undefined);
  const pending = useRef(false);
  const alive = useRef(true);
  const [locked, setLocked] = useState(false);
  const [showScope, setShowScope] = useState(false);
  const key = JSON.stringify(scope);
  const fresh = preview !== undefined && scopeKey === key;
  const refresh = async () => {
    if (pending.current) return;
    pending.current = true;
    updateBusy(true);
    setError(false);
    try {
      const next = await api.preview(scope);
      if (!alive.current) return;
      setPreview(next);
      setScopeKey(key);
      frozen.current = undefined;
      setLocked(false);
    } catch {
      if (alive.current) setError(true);
    } finally {
      pending.current = false;
      if (alive.current) updateBusy(false);
    }
  };
  const mount = useMounted<ViewInstance>(() => {
    alive.current = true;
    void refresh();
    return () => {
      alive.current = false;
    };
  }, []);
  const download = async () => {
    if (!fresh || pending.current) return;
    pending.current = true;
    updateBusy(true);
    setError(false);
    try {
      await shareFeedbackArchive(await api.download(preview.token));
    } catch {
      if (alive.current) setError(true);
    } finally {
      pending.current = false;
      if (alive.current) updateBusy(false);
    }
  };
  const submit = async () => {
    if (!fresh || !preview.canSubmit || rating === undefined || pending.current) return;
    frozen.current ??= { token: preview.token, feedback: { rating, tags, comment } };
    setLocked(true);
    pending.current = true;
    updateBusy(true);
    setError(false);
    try {
      const next = await api.submit(frozen.current);
      if (alive.current) setReceipt(next);
    } catch {
      if (alive.current) setError(true);
    } finally {
      pending.current = false;
      if (alive.current) updateBusy(false);
    }
  };
  if (receipt !== undefined)
    return (
      <View ref={mount} style={{ padding: space.x5, gap: space.x5 }}>
        <Text variant="title">{f.receipt}</Text>
        <Text selectable testID="feedback-receipt">
          {receipt.reportId}
        </Text>
        <Button label={t.close} onPress={onClose} testID="feedback-close" />
      </View>
    );
  const header = (
    <View style={{ gap: space.x4 }}>
      <Segmented
        label={f.title}
        options={[
          { value: 'good', label: f.good },
          { value: 'bad', label: f.bad },
        ]}
        value={rating ?? ''}
        disabled={locked || busy}
        onChange={(value) => {
          if (value === 'good' || value === 'bad') {
            setRating(value);
            setTags([]);
          }
        }}
      />
      {rating === undefined ? null : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.x2 }}>
          {feedbackTags[rating].map((tag) => (
            <Chip
              key={tag}
              label={f[`tag.${tag}`]}
              selected={tags.includes(tag)}
              disabled={locked || busy}
              testID={'feedback-tag-' + tag}
              onPress={() =>
                setTags((current) =>
                  current.includes(tag) ? current.filter((v) => v !== tag) : [...current, tag],
                )
              }
            />
          ))}
        </View>
      )}
      <TextField
        accessibilityLabel={f.comment}
        placeholder={f.comment}
        testID="feedback-comment"
        multiline
        value={comment}
        editable={!locked && !busy}
        onChangeText={(value) => setComment(Array.from(value).slice(0, 500).join(''))}
      />
      <Button
        label={f.include}
        testID="feedback-scope"
        onPress={() => setShowScope((value) => !value)}
      />
      <Text variant="meta" tone="muted">
        {f.before}: {scope.before} · {f.after}: {scope.after}
      </Text>
      {showScope ? (
        <>
          {(['before', 'after'] as const).map((side) => (
            <View key={side} style={{ flexDirection: 'row', alignItems: 'center', gap: space.x3 }}>
              <Text style={{ flex: 1 }}>{f[side]}</Text>
              <TextField
                testID={'feedback-' + side}
                accessibilityLabel={f[side]}
                keyboardType="number-pad"
                value={String(scope[side])}
                editable={!locked && !busy}
                onChangeText={(value) => {
                  if (/^\d{0,3}$/.test(value))
                    setScope((s) => ({ ...s, [side]: Math.min(100, Number(value)) }));
                }}
              />
            </View>
          ))}
          {categories.map((category) => (
            <SettingsRow
              key={category}
              title={f[category]}
              trailing={
                <Toggle
                  testID={'feedback-' + category}
                  label={f[category]}
                  disabled={locked || busy}
                  value={scope[category]}
                  onChange={(value) => setScope((s) => ({ ...s, [category]: value }))}
                />
              }
            />
          ))}
        </>
      ) : null}
      <Text tone="muted" variant="meta">
        {f.privacy}
      </Text>
      <Button
        label={f.refresh}
        busy={busy}
        onPress={() => void refresh()}
        testID="feedback-refresh"
      />
      {!fresh && preview !== undefined ? <Text>{f.refreshNeeded}</Text> : null}
      {error ? <Text accessibilityRole="alert">{f.failed}</Text> : null}
      {preview?.canSubmit === false ? <Text>{f.unavailable}</Text> : null}
      {preview === undefined ? null : (
        <>
          <Text strong>
            {f.preview} · {Math.ceil(preview.bytes / 1024)} KB
          </Text>
          <Text variant="meta">
            {f.sessions}: {preview.summary.sessions.length} · {f.inbox}:{' '}
            {preview.summary.admissions}
          </Text>
          {preview.summary.channels.map((channel, i) => (
            <Text key={i}>
              {channel.role === 'selected' ? f.conversation : f.relatedChats}: {channel.name} ·{' '}
              {channel.messages} {f.messages}
            </Text>
          ))}
          {preview.summary.omissions.map((omission, i) => (
            <Text key={i} tone="muted">
              {f.missing} {omission.detail}
            </Text>
          ))}
        </>
      )}
    </View>
  );
  return (
    <View ref={mount} style={{ flex: 1, backgroundColor: theme.overlay.fill }}>
      <FlatList
        data={preview?.files ?? []}
        keyExtractor={(item) => item.path}
        renderScrollComponent={renderKeyboardFormScroll}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        contentContainerStyle={{ padding: space.x5, gap: space.x3 }}
        renderItem={({ item }) => (
          <View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.path}
              accessibilityState={{ expanded: expanded.has(item.path) }}
              onPress={() =>
                setExpanded((current) => {
                  const next = new Set(current);
                  if (next.has(item.path)) next.delete(item.path);
                  else next.add(item.path);
                  return next;
                })
              }
              style={{ minHeight: theme.touch, justifyContent: 'center' }}
            >
              <Text>{item.path}</Text>
            </Pressable>
            {expanded.has(item.path) ? (
              <Text selectable variant="meta">
                {item.content}
              </Text>
            ) : null}
          </View>
        )}
      />
      <View style={{ padding: space.x5, gap: space.x3 }}>
        <Button
          label={f.submit}
          tone="primary"
          busy={busy}
          testID="feedback-submit"
          disabled={!fresh || !preview?.canSubmit || rating === undefined}
          onPress={() => void submit()}
        />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.x2 }}>
          <Button
            variant="text"
            label={f.download}
            disabled={!fresh || busy}
            onPress={() => void download()}
            testID="feedback-download"
          />
          <Button
            variant="text"
            label={t.close}
            disabled={busy}
            onPress={onClose}
            testID="feedback-close"
          />
        </View>
      </View>
    </View>
  );
}
