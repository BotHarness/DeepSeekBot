import { Segmented } from '../primitives/segmented';
import { FeedbackTag } from './feedback-tag';
import { renderKeyboardFormScroll } from '../primitives/keyboard-form';
import { shareFeedbackArchive } from '../../host/share-feedback';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useMounted } from '../mounted';
import { FlatList, View, type ViewInstance } from 'react-native';
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
import { Button } from '../primitives/creation-button';
import { Text } from '../primitives/text';
import { TextField } from '../primitives/text-field';
import { labelInField } from '../primitives/field-label';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { SettingsRow, SettingsSection } from '../primitives/settings-row';
import { useStrings } from '../strings';

const categories = [
  'conversation',
  'sessions',
  'inbox',
  'deliveries',
  'relatedChats',
  'wholeSessions',
] as const;

function FeedbackSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <SettingsSection>
      <View style={{ padding: space.x5, gap: space.x4 }}>
        <Text variant="title" accessibilityRole="header">
          {title}
        </Text>
        {children}
      </View>
    </SettingsSection>
  );
}
export function MessageFeedbackForm({
  client,
  channelId,
  messageId,
  onClose,
  failureTurn = false,
  onBusyChange,
}: {
  client: HostClient;
  channelId: string;
  messageId: string;
  onClose(): void;
  failureTurn?: boolean;
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
    failureTurn,
  });
  const [rating, setRating] = useState<'good' | 'bad' | undefined>(failureTurn ? 'bad' : undefined);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [preview, setPreview] = useState<FeedbackPreview>();
  const [scopeKey, setScopeKey] = useState('');
  const [receipt, setReceipt] = useState<FeedbackReceipt>();
  const [activity, setActivity] = useState<'preview' | 'submit' | 'download'>();
  const busy = activity !== undefined;
  const [error, setError] = useState(false);
  const updateBusy = (value: boolean, operation: 'preview' | 'submit' | 'download' = 'preview') => {
    setActivity(value ? operation : undefined);
    onBusyChange?.(value);
  };
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const frozen = useRef<{ token: string; feedback: FeedbackRating } | undefined>(undefined);
  const pending = useRef(false);
  const alive = useRef(true);
  const [locked, setLocked] = useState(false);
  const [showScope, setShowScope] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
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
    updateBusy(true, 'download');
    setError(false);
    try {
      await shareFeedbackArchive(
        await api.download(preview.token),
        receipt?.reportId ?? preview.token,
      );
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
    updateBusy(true, 'submit');
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
  const ratingPanel = receipt ? (
    <FeedbackSection title={f.receipt}>
      <Text selectable testID="feedback-receipt">
        {receipt.reportId}
      </Text>
      <Button
        label={t.close}
        tone="primary"
        disabled={busy}
        onPress={onClose}
        testID="feedback-close"
      />
    </FeedbackSection>
  ) : (
    <FeedbackSection title={f.ratingTitle}>
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
            <FeedbackTag
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
      <Text tone="muted">{failureTurn ? t.sessionRecovery.uploadScope : f.privacy}</Text>
      {Array.from(comment).length >= 450 ? <Text>{Array.from(comment).length} / 500</Text> : null}
      {preview?.canSubmit === false ? <Text>{f.unavailable}</Text> : null}
      <Button
        label={f.submit}
        tone="primary"
        testID="feedback-submit"
        disabled={busy || !fresh || !preview?.canSubmit || rating === undefined}
        onPress={() => void submit()}
      />
      {activity === 'submit' ? <LoadingIndicator size="control" /> : null}
    </FeedbackSection>
  );
  const header = (
    <View style={{ gap: space.x6 }}>
      {ratingPanel}
      {error ? <Text accessibilityRole="alert">{f.failed}</Text> : null}
      <FeedbackSection title={f.localBundle}>
        <Text tone="muted">{f.localOnly}</Text>
        {preview ? (
          <Text>
            {preview.summary.channels.reduce((total, channel) => total + channel.messages, 0)}{' '}
            {f.messages} · {preview.summary.sessions.length} {f.sessionCount} ·{' '}
            {Math.ceil(preview.bytes / 1024)} KB
          </Text>
        ) : busy ? (
          <Text>{f.preparing}</Text>
        ) : null}
        {!receipt ? (
          <>
            <Button
              label={f.include}
              variant="text"
              testID="feedback-scope"
              onPress={() => setShowScope((value) => !value)}
            />
            {showScope ? (
              <View style={{ gap: space.x3 }}>
                {(['before', 'after'] as const).map((side) => (
                  <View key={side} style={{ gap: space.x2 }}>
                    {labelInField ? null : <Text>{f[side]}</Text>}
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
                    control={{
                      kind: 'switch',
                      value: scope[category],
                      onChange: (value) => setScope((s) => ({ ...s, [category]: value })),
                      disabled: locked || busy,
                      testID: 'feedback-' + category,
                    }}
                  />
                ))}
              </View>
            ) : null}
          </>
        ) : null}
        {!fresh && preview !== undefined ? <Text>{f.refreshNeeded}</Text> : null}
        {!fresh || (locked && !receipt) || error ? (
          <Button
            label={f.refresh}
            disabled={busy}
            onPress={() => void refresh()}
            testID="feedback-refresh"
          />
        ) : null}
        {activity === 'preview' ? <LoadingIndicator size="control" /> : null}
        <Button
          label={f.download}
          disabled={!fresh || busy}
          onPress={() => void download()}
          testID="feedback-download"
        />
        {activity === 'download' ? <LoadingIndicator size="control" /> : null}
        {preview ? (
          <Button
            label={showFiles ? f.hideFiles : f.viewFiles}
            variant="text"
            onPress={() => setShowFiles((value) => !value)}
            testID="feedback-files"
          />
        ) : null}
        {showFiles && preview ? (
          <View style={{ gap: space.x3 }}>
            <Text>
              {f.sessions}: {preview.summary.sessions.length} · {f.inbox}:{' '}
              {preview.summary.admissions}
            </Text>
            {preview.summary.channels.map((channel, i) => (
              <Text key={i}>
                {channel.role === 'selected' ? f.conversation : f.relatedChats}: {channel.name} ·{' '}
                {channel.messages} {f.messages}
              </Text>
            ))}
          </View>
        ) : null}
        {preview?.summary.omissions.map((omission, i) => (
          <Text key={i} tone="muted">
            {f.missing} {omission.detail}
          </Text>
        ))}
      </FeedbackSection>
    </View>
  );
  return (
    <View ref={mount} style={{ flex: 1, backgroundColor: theme.layer.canvas.fill }}>
      <FlatList
        data={showFiles ? (preview?.files ?? []) : []}
        keyExtractor={(item) => item.path}
        renderScrollComponent={renderKeyboardFormScroll}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: space.x5, gap: space.x3 }}
        renderItem={({ item }) => (
          <SettingsSection>
            <Button
              variant="text"
              label={item.path}
              onPress={() =>
                setExpanded((current) => {
                  const next = new Set(current);
                  if (next.has(item.path)) next.delete(item.path);
                  else next.add(item.path);
                  return next;
                })
              }
            />
            {expanded.has(item.path) ? (
              <Text selectable style={{ padding: space.x4 }}>
                {item.content}
              </Text>
            ) : null}
          </SettingsSection>
        )}
      />
    </View>
  );
}
