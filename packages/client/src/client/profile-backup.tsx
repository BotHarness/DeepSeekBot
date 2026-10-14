import { useRef, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button, Checkbox } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import { SettingsRow } from './ds/settings-row.js';
import { Note } from './ds/note.js';
import { PanelDialog } from './ds/panel-dialog.js';
import { border, color, space, text } from './ds/tokens.stylex.js';
import { useMountedResource } from './mounted-resource.js';

const styles = stylex.create({
  section: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: space.x3,
    minWidth: 0,
    paddingTop: space.x4,
    borderTopWidth: border.hairline,
    borderTopStyle: 'solid',
    borderTopColor: color.divider,
  },
  heading: {
    margin: 0,
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    fontWeight: text.strong,
  },
  text: { margin: 0, overflowWrap: 'anywhere' },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.x3,
  },
  bot: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: space.x2,
    paddingBlock: space.x3,
  },
  pre: {
    alignSelf: 'stretch',
    margin: 0,
    padding: space.x3,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    backgroundColor: color.base,
  },
  code: { overflowWrap: 'anywhere' },
  stack: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: space.x3,
    alignSelf: 'stretch',
    minWidth: 0,
  },
});

const PATH = '/api/botharness/profile-backup';
interface Preview {
  bots: number;
  files: number;
  estimatedBytes: number;
  token: string;
  sessions: { count: number };
}
interface Recovery {
  restored: boolean;
  bots: {
    slug: string;
    displayName: string;
    activated: boolean;
    reason?: string;
    route?: { provider: string; model: string };
  }[];
}
interface Inspection {
  bytes: number;
  sha256: string;
  manifest: {
    id: string;
    counts: { bots: number; files: number; bytes: number };
    sessions: { count: number };
  };
}
async function result<T>(response: Response): Promise<T> {
  const value = await response.json();
  if (!response.ok) throw new Error(value.error?.code ?? 'operation-failed');
  return value as T;
}
export type ProfileBackupSettingsProps = PropsLocale<'botharness'>;
export function ProfileBackupSettings({ t }: ProfileBackupSettingsProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview>();
  const [recovery, setRecovery] = useState<Recovery>();
  const [inspection, setInspection] = useState<Inspection>();
  const [bytes, setBytes] = useState<number>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [acknowledged, setAcknowledged] = useState(false);
  const active = useRef<AbortController | undefined>(undefined);
  const mounted = useRef(false);
  const file = useRef<HTMLInputElement>(null);
  const mount = useMountedResource<HTMLDivElement>(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      active.current?.abort();
    };
  }, []);
  const run = async (work: (signal: AbortSignal) => Promise<void>): Promise<void> => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError(undefined);
    try {
      await work(controller.signal);
    } catch (failure) {
      if (mounted.current && !controller.signal.aborted)
        setError(failure instanceof Error ? failure.message : 'operation-failed');
    } finally {
      if (mounted.current && active.current === controller) {
        active.current = undefined;
        setBusy(false);
      }
    }
  };
  const refresh = async (signal: AbortSignal) => {
    const response = await fetch(PATH + '/recovery', { signal });
    const value = await result<Recovery>(response);
    if (!signal.aborted) setRecovery(value);
  };
  const show = () => {
    setOpen(true);
    void run(refresh);
  };
  const close = () => {
    active.current?.abort();
    setOpen(false);
    setPreview(undefined);
    setInspection(undefined);
    setAcknowledged(false);
  };
  const prepare = () =>
    run(async (signal) => {
      const value = await result<Preview>(await fetch(PATH, { signal }));
      if (!signal.aborted) {
        setPreview(value);
        setBytes(undefined);
      }
    });
  const download = () =>
    run(async (signal) => {
      if (!preview) return;
      const response = await fetch(PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: preview.token }),
        signal,
      });
      if (!response.ok) {
        await result(response);
        return;
      }
      const blob = await response.blob();
      if (signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download =
        response.headers.get('content-disposition')?.match(/filename="([^"]+)"/u)?.[1] ??
        'environment.botharness-backup';
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setBytes(blob.size);
      setPreview(undefined);
    });
  const inspect = (selected: File) =>
    run(async (signal) => {
      const value = await result<Inspection>(
        await fetch(PATH + '/inspect', {
          method: 'POST',
          body: selected,
          headers: { 'content-type': 'application/octet-stream' },
          signal,
        }),
      );
      if (!signal.aborted) setInspection(value);
    });
  const act = (slug: string, action: 'authorize' | 'activate') =>
    run(async (signal) => {
      const value = await result<Recovery>(
        await fetch(PATH + '/' + action, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ slug, acknowledgeSplitBrain: acknowledged }),
          signal,
        }),
      );
      if (!signal.aborted) setRecovery(value);
    });
  return (
    <SettingsRow
      rootRef={mount}
      title={t('backup.title')}
      description={t('backup.description')}
      data={{ 'data-profile-backup-setting': '' }}
      control={
        <Button variant="outline" size="sm" onClick={show}>
          {t('backup.open')}
        </Button>
      }
    >
      {open ? (
        <PanelDialog
          size="medium"
          fill
          onClose={close}
          title={t('backup.title')}
          closeLabel={t('backup.close')}
          data={{ 'data-profile-backup': '' }}
        >
          <p {...stylex.props(styles.text)}>{t('backup.identity')}</p>
          <section aria-label={t('backup.export')} {...stylex.props(styles.section)}>
            <h3 {...stylex.props(styles.heading)}>{t('backup.export')}</h3>
            <p {...stylex.props(styles.text)}>{t('backup.sensitive')}</p>
            <p {...stylex.props(styles.text)}>{t('backup.excluded')}</p>
            <p {...stylex.props(styles.text)}>{t('backup.sessions')}</p>
            <p {...stylex.props(styles.text)}>{t('backup.purge')}</p>
            <div {...stylex.props(styles.actions)}>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void prepare()}>
                {t('backup.prepare')}
              </Button>
            </div>
            {preview ? (
              <div data-backup-preview {...stylex.props(styles.stack)}>
                <p {...stylex.props(styles.text)}>
                  {t('backup.counts', {
                    bots: String(preview.bots),
                    files: String(preview.files),
                    bytes: String(preview.estimatedBytes),
                    sessions: String(preview.sessions.count),
                  })}
                </p>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => void download()}>
                  {t('backup.download')}
                </Button>
              </div>
            ) : null}
            {bytes === undefined ? null : (
              <p role="status" {...stylex.props(styles.text)}>
                {t('backup.complete', { bytes: String(bytes) })}
              </p>
            )}
          </section>
          <section aria-label={t('backup.import')} {...stylex.props(styles.section)}>
            <h3 {...stylex.props(styles.heading)}>{t('backup.import')}</h3>
            <p {...stylex.props(styles.text)}>{t('backup.localRestore')}</p>
            <input
              ref={file}
              hidden
              type="file"
              accept=".botharness-backup"
              aria-label={t('backup.select')}
              onChange={(event) => {
                const selected = event.currentTarget.files?.[0];
                if (selected) void inspect(selected);
                event.currentTarget.value = '';
              }}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => file.current?.click()}
            >
              {t('backup.select')}
            </Button>
            {inspection ? (
              <div data-backup-inspection {...stylex.props(styles.stack)}>
                <p {...stylex.props(styles.text)}>
                  {t('backup.inspected', {
                    bots: String(inspection.manifest.counts.bots),
                    files: String(inspection.manifest.counts.files),
                    bytes: String(inspection.bytes),
                  })}
                </p>
                <p {...stylex.props(styles.text)}>{t('backup.restoreCommand')}</p>
                <pre {...stylex.props(styles.pre)}>
                  botharness-profile restore --file "environment.botharness-backup" --new-home
                  "new-environment"
                </pre>
                <p {...stylex.props(styles.text)}>{t('backup.launch')}</p>
                <p {...stylex.props(styles.text)}>{t('backup.restorePosture')}</p>
                <details>
                  <summary>{t('backup.integrity')}</summary>
                  <code {...stylex.props(styles.code)}>{inspection.sha256}</code>
                </details>
              </div>
            ) : null}
          </section>
          {recovery?.restored ? (
            <section
              aria-label={t('backup.recovery')}
              data-backup-recovery
              {...stylex.props(styles.section)}
            >
              <h3 {...stylex.props(styles.heading)}>{t('backup.recovery')}</h3>
              <p {...stylex.props(styles.text)}>{t('backup.repair')}</p>
              <p {...stylex.props(styles.text)}>{t('backup.restorePosture')}</p>
              <Checkbox
                checked={acknowledged}
                onChange={setAcknowledged}
                label={t('backup.acknowledge')}
              />
              <div {...stylex.props(styles.actions)}>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void run(refresh)}
                >
                  {t('backup.refresh')}
                </Button>
              </div>
              {recovery.bots.map((bot) => (
                <div key={bot.slug} {...stylex.props(styles.bot)}>
                  <strong>{bot.displayName}</strong>
                  <div>
                    {bot.slug} ·{' '}
                    {bot.route ? bot.route.provider + '/' + bot.route.model : t('backup.noModel')}
                  </div>
                  <p {...stylex.props(styles.text)}>
                    {bot.activated ? t('backup.active') : t('backup.cold')}
                    {bot.reason
                      ? ' · ' +
                        t('backup.blocked', {
                          reason:
                            bot.reason === 'model-plan-required'
                              ? t('backup.reason.plan')
                              : bot.reason === 'model-unavailable'
                                ? t('backup.reason.unavailable')
                                : bot.reason === 'model-authorization-required'
                                  ? t('backup.reason.authorization')
                                  : bot.reason,
                        })
                      : ''}
                  </p>
                  <div {...stylex.props(styles.actions)}>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy || !bot.route}
                      onClick={() => void act(bot.slug, 'authorize')}
                    >
                      {t('backup.authorize')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy || !!bot.reason || !acknowledged || bot.activated}
                      onClick={() => void act(bot.slug, 'activate')}
                    >
                      {t('backup.activate')}
                    </Button>
                  </div>
                </div>
              ))}
            </section>
          ) : null}
          {busy ? (
            <div role="status" {...stylex.props(styles.actions)}>
              <span>{t('backup.working')}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  active.current?.abort();
                  setBusy(false);
                }}
              >
                {t('backup.cancel')}
              </Button>
            </div>
          ) : null}
          {error ? <Note tone="danger">{t('backup.error', { code: error })}</Note> : null}
        </PanelDialog>
      ) : null}
    </SettingsRow>
  );
}
