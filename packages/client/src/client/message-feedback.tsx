import { useRef, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { FormDialog } from './ds/form-dialog.js';
import { NumberStepper } from './ds/number-stepper.js';
import { TextAreaField } from './ds/field.js';
import { color, space, text } from './ds/tokens.stylex.js';
import { useMountedResource } from './mounted-resource.js';
import type { BotHarnessTranslate } from './locale.js';

const PATH = './api/botharness/message-feedback/';
const TAGS = {
  good: ['accurate', 'completed', 'understood', 'fast'],
  bad: [
    'incorrect',
    'instructions',
    'incomplete',
    'no-response',
    'delivery',
    'slow',
    'interface',
    'other',
  ],
} as const;
const CATEGORIES = [
  'conversation',
  'sessions',
  'inbox',
  'deliveries',
  'relatedChats',
  'wholeSessions',
] as const;
type Category = (typeof CATEGORIES)[number];
type Rating = keyof typeof TAGS;
type Preview = {
  token: string;
  canSubmit: boolean;
  bytes: number;
  channels: Array<{ name: string; messages: number; role: string }>;
  sessions: number;
  admissions: number;
  omissions: string[];
  files: Array<{ path: string; content: string }>;
};
const styles = stylex.create({
  body: { display: 'flex', flexDirection: 'column', gap: space.x4, minWidth: 0 },
  row: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: space.x3 },
  choices: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x2,
    padding: 0,
    borderWidth: 0,
    margin: 0,
  },
  note: { color: color.muted, fontSize: text.metaSize, lineHeight: text.metaLine },
  content: {
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
});

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('invalid-response');
  return value as Record<string, unknown>;
}
function string(value: unknown): string {
  if (typeof value !== 'string') throw new Error('invalid-response');
  return value;
}
function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('invalid-response');
  return value;
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('invalid-response');
  return value;
}
function parsePreview(value: unknown): Preview {
  const result = record(value),
    summary = record(result['summary']);
  return {
    token: string(result['token']),
    canSubmit: result['canSubmit'] === true,
    bytes: number(result['bytes']),
    channels: list(summary['channels']).map((item) => {
      const row = record(item);
      return {
        name: string(row['name']),
        messages: number(row['messages']),
        role: string(row['role']),
      };
    }),
    sessions: list(summary['sessions']).length,
    admissions: number(summary['admissions']),
    omissions: list(summary['omissions']).map((item) => string(record(item)['detail'])),
    files: list(result['files']).map((item) => {
      const row = record(item);
      return { path: string(row['path']), content: string(row['content']) };
    }),
  };
}

export function MessageFeedbackDialog({
  channelId,
  messageId,
  onClose,
  t,
}: {
  channelId: string;
  messageId: string;
  onClose(): void;
  t: BotHarnessTranslate;
}): ReactElement {
  const [rating, setRating] = useState<Rating>();
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [scope, setScope] = useState({
    before: 20,
    after: 20,
    conversation: true,
    sessions: true,
    inbox: true,
    deliveries: true,
    relatedChats: true,
    wholeSessions: false,
  });
  const [preview, setPreview] = useState<Preview>();
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const [receipt, setReceipt] = useState<string>();
  const [submitted, setSubmitted] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const active = useRef<AbortController | undefined>(undefined);
  const mounted = useRef(false);
  const run = async (work: (signal: AbortSignal) => Promise<void>) => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError(false);
    try {
      await work(controller.signal);
    } catch {
      if (mounted.current && !controller.signal.aborted) setError(true);
    } finally {
      if (mounted.current && active.current === controller) setBusy(false);
    }
  };
  const post = async (action: string, body: unknown, signal: AbortSignal) => {
    const response = await fetch(PATH + action, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) throw new Error('feedback-failed');
    return response;
  };
  const prepare = () =>
    run(async (signal) => {
      const value: unknown = await (
        await post('preview', { channelId, messageId, ...scope }, signal)
      ).json();
      if (!signal.aborted) {
        setPreview(parsePreview(value));
        setDirty(false);
        setSubmitted(false);
      }
    });
  const mount = useMountedResource<HTMLDivElement>(() => {
    mounted.current = true;
    void prepare();
    return () => {
      mounted.current = false;
      active.current?.abort();
    };
  }, []);
  const submit = () => {
    if (!preview || !rating || dirty) return;
    setSubmitted(true);
    void run(async (signal) => {
      const result: unknown = await (
        await post('submit', { token: preview.token, feedback: { rating, tags, comment } }, signal)
      ).json();
      if (!signal.aborted) setReceipt(string(record(result)['reportId']));
    });
  };
  const download = () => {
    if (!preview || dirty) return;
    void run(async (signal) => {
      const blob = await (await post('download', { token: preview.token }, signal)).blob();
      if (signal.aborted) return;
      const url = URL.createObjectURL(blob),
        anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'message-feedback.zip';
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  };
  return (
    <FormDialog
      title={t('feedback.title')}
      description={t('feedback.description')}
      size="wide"
      scroll
      labels={{ close: t('common.close'), cancel: t('common.cancel') }}
      onCancel={onClose}
      submitLabel={receipt ? t('common.close') : t('feedback.submit')}
      onSubmit={receipt ? onClose : submit}
      busy={busy}
      submitDisabled={!receipt && (!rating || !preview?.canSubmit || dirty)}
      error={error ? t('feedback.failed') : undefined}
      secondary={
        <Button type="button" disabled={!preview || dirty || busy} onClick={download}>
          {t('feedback.download')}
        </Button>
      }
    >
      <div ref={mount} {...stylex.props(styles.body)}>
        {receipt ? (
          <p role="status">{t('feedback.receipt', { id: receipt })}</p>
        ) : (
          <>
            <div {...stylex.props(styles.row)}>
              {(['good', 'bad'] as const).map((value) => (
                <Button
                  key={value}
                  type="button"
                  aria-pressed={rating === value}
                  disabled={busy || submitted}
                  onClick={() => {
                    setRating(value);
                    setTags([]);
                  }}
                >
                  {t(`feedback.${value}`)}
                </Button>
              ))}
            </div>
            {rating && (
              <div {...stylex.props(styles.row)}>
                {TAGS[rating].map((tag) => (
                  <label key={tag}>
                    <input
                      type="checkbox"
                      checked={tags.includes(tag)}
                      disabled={busy || submitted}
                      onChange={() =>
                        setTags((current) =>
                          current.includes(tag)
                            ? current.filter((item) => item !== tag)
                            : [...current, tag],
                        )
                      }
                    />
                    {t(`feedback.tag.${tag}`)}
                  </label>
                ))}
              </div>
            )}
            <TextAreaField
              label={t('feedback.comment')}
              value={comment}
              disabled={busy || submitted}
              onChange={(value) => setComment(Array.from(value).slice(0, 500).join(''))}
            />
            <fieldset {...stylex.props(styles.choices)} disabled={busy || submitted}>
              <legend>{t('feedback.include')}</legend>
              <div {...stylex.props(styles.row)}>
                {(['before', 'after'] as const).map((key) => (
                  <label key={key}>
                    {t(`feedback.${key}`)}
                    <NumberStepper
                      label={t(`feedback.${key}`)}
                      decreaseLabel={t('common.decrease')}
                      increaseLabel={t('common.increase')}
                      min={0}
                      max={100}
                      value={scope[key]}
                      disabled={busy || submitted}
                      onChange={(value) => {
                        setScope((current) => ({ ...current, [key]: value }));
                        setDirty(true);
                      }}
                    />
                  </label>
                ))}
              </div>
              {CATEGORIES.map((category: Category) => (
                <label key={category}>
                  <input
                    type="checkbox"
                    checked={scope[category]}
                    onChange={(event) => {
                      setScope((current) => ({ ...current, [category]: event.target.checked }));
                      setDirty(true);
                    }}
                  />
                  {t(`feedback.${category}`)}
                </label>
              ))}
            </fieldset>
            <Button type="button" disabled={busy} onClick={() => void prepare()}>
              {t('feedback.refresh')}
            </Button>
            {busy && !preview ? <p role="status">{t('feedback.preparing')}</p> : null}
            {dirty && <p role="status">{t('feedback.refreshNeeded')}</p>}
            {preview && (
              <section aria-label={t('feedback.preview')}>
                {preview.channels.map((channel, index) => (
                  <p key={index}>
                    {channel.name} · {channel.messages} {t('feedback.messages')}
                    {channel.role !== 'selected' ? ` · ${t('feedback.relatedChats')}` : ''}
                  </p>
                ))}
                <p>
                  {t('feedback.counts', {
                    sessions: preview.sessions,
                    inbox: preview.admissions,
                    kb: Math.ceil(preview.bytes / 1024),
                  })}
                </p>
                {preview.omissions.map((item, index) => (
                  <p key={index} role="status">
                    {t('feedback.missing')} {item}
                  </p>
                ))}
                {!preview.canSubmit && <p role="status">{t('feedback.unavailable')}</p>}
                {preview.files.map((file) => (
                  <details
                    key={file.path}
                    onToggle={(event) => {
                      if (event.currentTarget.open)
                        setExpanded((current) => new Set([...current, file.path]));
                    }}
                  >
                    <summary>{file.path}</summary>
                    {expanded.has(file.path) ? (
                      <pre {...stylex.props(styles.content)}>{file.content}</pre>
                    ) : null}
                  </details>
                ))}
              </section>
            )}
            <p {...stylex.props(styles.note)}>{t('feedback.privacy')}</p>
          </>
        )}
      </div>
    </FormDialog>
  );
}
