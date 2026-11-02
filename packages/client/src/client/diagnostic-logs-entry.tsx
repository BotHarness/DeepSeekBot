import { useState, type ReactElement } from 'react';

import { DiagnosticLogsDialog } from './diagnostic-logs-dialog.js';
import { Tooltip } from './ds/tooltip.js';
import type { BotHarnessTranslate } from './locale.js';
import { LogsIcon } from './logs-icon.js';

export function DiagnosticLogsEntry({ t }: { t: BotHarnessTranslate }): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <span>
      <Tooltip label={t('panel.diagnosticLogs')} side="right">
        <button
          type="button"
          aria-label={t('panel.diagnosticLogs')}
          aria-haspopup="dialog"
          aria-expanded={open}
          data-diagnostic-logs-entry=""
          onClick={() => setOpen(true)}
        >
          <LogsIcon size={16} />
        </button>
      </Tooltip>
      {open ? <DiagnosticLogsDialog onClose={() => setOpen(false)} t={t} /> : null}
    </span>
  );
}
