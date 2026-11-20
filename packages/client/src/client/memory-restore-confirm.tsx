import type { ReactElement } from 'react';
import type { BotHarnessTranslate } from './locale.js';
import { Button } from './ds/button.js';
import { Input } from './ds/input.js';
import { MessagingHelp } from './messaging-help.js';

export function renderMemoryRestoreConfirm({
  sha,
  dirty,
  t,
  restoreForm,
  busy,
  setRestoreForm,
  restoreCommit,
}: {
  sha: string;
  dirty: boolean;
  t: BotHarnessTranslate;
  restoreForm: { sha: string; name: string } | undefined;
  busy: boolean;
  setRestoreForm(form: { sha: string; name: string } | undefined): void;
  restoreCommit(): Promise<void>;
}): ReactElement {
  return (
    <div className="bh-memory-restore-confirm" role="group">
      <p className="bh-memory-restore-title">
        {t('memory.restoreCommit.title')}
        <MessagingHelp
          title={t('memory.restoreCommit.title')}
          text={`${t('memory.restoreCommit.confirm')}${
            dirty ? t('memory.restoreCommit.confirmDirty') : t('memory.restoreCommit.confirmClean')
          }`}
          t={t}
        />
      </p>
      <label className="bh-memory-restore-note">
        <span>{t('memory.restoreCommit.name')}</span>
        <Input
          value={restoreForm?.name ?? ''}
          maxLength={60}
          placeholder={t('memory.version.placeholder')}
          disabled={busy}
          onChange={(event) => setRestoreForm({ sha: sha, name: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void restoreCommit();
          }}
        />
      </label>
      <Button variant="primary" size="sm" disabled={busy} onClick={() => void restoreCommit()}>
        {busy
          ? t('memory.restoreCommit.loading')
          : dirty
            ? t('memory.restoreCommit.submitDirty')
            : t('memory.restoreCommit.submit')}
      </Button>
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => setRestoreForm(undefined)}>
        {t('common.cancel')}
      </Button>
    </div>
  );
}
