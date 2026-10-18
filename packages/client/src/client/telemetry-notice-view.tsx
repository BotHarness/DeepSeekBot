import { useMemo, useSyncExternalStore, type ReactElement } from 'react';

import { Button, MarkdownText, type MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives';

import type { BotHarnessKey, BotHarnessTranslate } from './locale.js';
import { Modal } from './modal.js';
import { useMountedResource } from './mounted-resource.js';
import type { ReleaseNotesController, ReleaseNotesSnapshot } from './release-notes.js';
import type { TelemetryNoticeController } from './telemetry-notice.js';

const ROWS: readonly { label: BotHarnessKey; text: BotHarnessKey; row: string }[] = [
  {
    row: 'collected',
    label: 'telemetry.notice.collected.label',
    text: 'telemetry.notice.collected',
  },
  { row: 'never', label: 'telemetry.notice.never.label', text: 'telemetry.notice.never' },
  { row: 'why', label: 'telemetry.notice.why.label', text: 'telemetry.notice.why' },
  { row: 'opt-out', label: 'telemetry.notice.optOut.label', text: 'telemetry.notice.optOut' },
];

const NO_RELEASE: ReleaseNotesSnapshot | undefined = undefined;
const noSubscribe = (): (() => void) => () => undefined;
const noRelease = (): ReleaseNotesSnapshot | undefined => NO_RELEASE;

function open(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function TelemetryNoticeBody({ t }: { t: BotHarnessTranslate }): ReactElement {
  const labels = useMemo<MarkdownLabels>(
    () => ({
      code: { copyLabel: t('message.code.copy'), copiedLabel: t('message.code.copied') },
      footnotes: t('message.footnotes'),
    }),
    [t],
  );
  return (
    <dl className="bh-telemetry-notice" data-telemetry-notice>
      {ROWS.map(({ row, label, text }) => (
        <div key={row} className="bh-telemetry-notice-row" data-telemetry-row={row}>
          <dt>{t(label)}</dt>
          <dd>
            <MarkdownText text={t(text)} labels={labels} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function TelemetryNoticeDialog({
  open: visible,
  onClose,
  onOpenSettings,
  t,
}: {
  open: boolean;
  onClose: () => void;
  onOpenSettings?: (() => void) | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <Modal
      open={visible}
      onClose={onClose}
      title={t('telemetry.notice.title')}
      description={t('telemetry.notice.description')}
      closeLabel={t('telemetry.notice.close')}
      className="bh-telemetry-dialog"
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => {
              open(t('telemetry.notice.sourceUrl'));
            }}
          >
            {t('telemetry.notice.source')}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              open(t('telemetry.notice.privacyUrl'));
            }}
          >
            {t('telemetry.notice.privacy')}
          </Button>
          {onOpenSettings === undefined ? null : (
            <Button variant="outline" onClick={onOpenSettings} data-telemetry-open-settings>
              {t('telemetry.notice.settings')}
            </Button>
          )}
          <Button variant="primary" onClick={onClose}>
            {t('telemetry.notice.done')}
          </Button>
        </>
      }
    >
      {visible ? <TelemetryNoticeBody t={t} /> : null}
    </Modal>
  );
}

export function TelemetryNotice({
  controller,
  releaseNotes,
  t,
}: {
  controller: TelemetryNoticeController;
  releaseNotes?: ReleaseNotesController | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const snapshot = useSyncExternalStore(controller.source.subscribe, controller.source.getSnapshot);
  const release = useSyncExternalStore(
    releaseNotes?.source.subscribe ?? noSubscribe,
    releaseNotes?.source.getSnapshot ?? noRelease,
  );
  const mount = useMountedResource<HTMLSpanElement>(() => {
    void controller.start(releaseNotes?.start());
  }, [controller, releaseNotes]);
  return (
    <>
      <span ref={mount} hidden aria-hidden="true" />
      <TelemetryNoticeDialog
        open={
          snapshot.open && release?.announcement === undefined && release?.updateNotice !== true
        }
        onClose={() => {
          controller.dismiss();
        }}
        onOpenSettings={
          controller.canOpenSettings
            ? () => {
                controller.openSettings();
              }
            : undefined
        }
        t={t}
      />
    </>
  );
}
