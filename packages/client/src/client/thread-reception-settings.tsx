import { useState, type ReactElement } from 'react';
import { Combobox } from './combobox.js';
import * as stylex from '@stylexjs/stylex';
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import type {
  ThreadReceptionInput,
  ThreadReceptionView,
} from '../../../core/src/messaging/thread-policy.js';
import type { BotHarnessTranslate } from './locale.js';
import { Field, TextField } from './ds/field.js';
import { FormDialog } from './ds/form-dialog.js';
import { space } from './ds/tokens.stylex.js';
import { MessagingHelp } from './messaging-help.js';

const styles = stylex.create({
  heading: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x2,
  },
});

export function ThreadReceptionSettings({
  policies,
  busy,
  t,
  save,
}: {
  policies: ThreadReceptionView[];
  busy: boolean;
  t: BotHarnessTranslate;
  save(sourceEventId: string, input: ThreadReceptionInput): Promise<boolean>;
}): ReactElement {
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<ThreadReceptionView>();
  const [mode, setMode] = useState<ThreadReceptionInput['mode']>('inherit');
  const [wake, setWake] = useState<'inherit' | NonNullable<ThreadReceptionInput['wake']>['wake']>(
    'inherit',
  );
  const [count, setCount] = useState(5);
  const [seconds, setSeconds] = useState(30);
  const open = (row: ThreadReceptionView) => {
    setFailed(false);
    setSelected(row);
    setMode(row.mode);
    setWake(row.wake?.wake ?? 'inherit');
    setCount(row.wake?.count ?? 5);
    setSeconds(row.wake?.intervalSeconds ?? 30);
  };
  return (
    <section className="bh-im-threads" aria-label={t('im.threads')}>
      <div className="bh-im-heading">
        <strong>{t('im.threads')}</strong>
        <MessagingHelp title={t('im.threads')} text={t('im.threadHint')} t={t} />
      </div>
      <table className="bh-source-policy-table" aria-label={t('im.threads')}>
        <thead>
          <tr>
            <th>{t('im.thread')}</th>
            <th>{t('im.threadParticipation')}</th>
            <th>{t('im.threadEditor')}</th>
            <th>{t('im.threadManage')}</th>
          </tr>
        </thead>
        <tbody>
          {policies.map((row) => (
            <tr key={row.threadId}>
              <td>
                <span className="bh-im-thread-preview">{row.preview ?? row.threadId}</span>
                <details>
                  <summary>{t('im.threadDetails')}</summary>
                  <code>{row.threadId}</code>
                </details>
              </td>
              <td>
                <Tag tone="neutral">{t(`im.threadMode.${row.mode}`)}</Tag>
              </td>
              <td>
                {t(
                  row.editor.kind === 'human'
                    ? 'im.policyHuman'
                    : row.editor.kind === 'bot'
                      ? 'im.policyBot'
                      : 'im.policyDefault',
                )}
              </td>
              <td>
                <Button size="sm" variant="primary" disabled={busy} onClick={() => open(row)}>
                  {t('im.threadManage')}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {selected ? (
        <FormDialog
          title={t('im.threadManage')}
          description={selected.preview ?? selected.threadId}
          labels={{ close: t('common.close'), cancel: t('common.cancel') }}
          submitLabel={t('im.threadSave')}
          submitDisabled={
            (mode === 'follow' && selected.ordinaryDelivery !== 'verified') ||
            (wake === 'digest' &&
              (!Number.isInteger(count) ||
                count < 1 ||
                count > 100 ||
                !Number.isInteger(seconds) ||
                seconds < 1 ||
                seconds > 86400))
          }
          busy={busy}
          error={failed ? t('im.error') : undefined}
          onCancel={() => {
            if (!busy) setSelected(undefined);
          }}
          onSubmit={() =>
            void (async () => {
              if (
                await save(selected.anchorSourceEventId, {
                  mode,
                  expectedRevision: selected.revision,
                  wake:
                    mode === 'follow' && wake !== 'inherit'
                      ? { wake, count, intervalSeconds: seconds }
                      : null,
                })
              )
                setSelected(undefined);
              else setFailed(true);
            })()
          }
        >
          <Field
            label={
              <span {...stylex.props(styles.heading)}>
                {t('im.threadParticipation')}
                <MessagingHelp
                  title={t('im.threadParticipation')}
                  text={t('im.threadHumanOverride')}
                  t={t}
                />
              </span>
            }
            hint={selected.ordinaryDelivery !== 'verified' ? t('im.threadUnverified') : undefined}
            group
          >
            {() => (
              <Combobox
                searchable={false}
                label={t('im.threadParticipation')}
                toggleLabel={t('im.threadParticipation')}
                value={mode}
                disabled={busy}
                onSelect={(value) => setMode(value as ThreadReceptionInput['mode'])}
                options={(['inherit', 'follow', 'exclude'] as const).map((value) => ({
                  value,
                  label: t(`im.threadMode.${value}`),
                }))}
              />
            )}
          </Field>
          <Field label={t('im.ordinaryWake')} group>
            {() => (
              <Combobox
                searchable={false}
                label={t('im.ordinaryWake')}
                toggleLabel={t('im.ordinaryWake')}
                value={wake}
                disabled={busy || mode !== 'follow'}
                onSelect={(value) => setWake(value as typeof wake)}
                options={(['inherit', 'immediate', 'digest', 'mentions', 'silent'] as const).map(
                  (value) => ({
                    value,
                    label: value === 'inherit' ? t('im.threadInheritWake') : t(`im.wake.${value}`),
                  }),
                )}
              />
            )}
          </Field>
          {wake === 'digest' && mode === 'follow' ? (
            <>
              <TextField
                label={t('im.digestCount')}
                type="number"
                min={1}
                max={100}
                value={String(count)}
                disabled={busy}
                onChange={(value) => setCount(Number(value))}
              />
              <TextField
                label={t('im.digestSeconds')}
                type="number"
                min={1}
                max={86400}
                value={String(seconds)}
                disabled={busy}
                onChange={(value) => setSeconds(Number(value))}
              />
            </>
          ) : null}
        </FormDialog>
      ) : null}
    </section>
  );
}
