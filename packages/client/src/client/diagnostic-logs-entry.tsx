import { useState, type ReactElement } from 'react';

import { BugReportDialog } from './bug-report-dialog.js';
import { DiagnosticLogsDialog } from './diagnostic-logs-dialog.js';
import { Tooltip } from './ds/tooltip.js';
import type { BotHarnessTranslate } from './locale.js';
import { LogsIcon } from './logs-icon.js';

export function DiagnosticLogsEntry({ t }: { t: BotHarnessTranslate }): ReactElement {
  const [open, setOpen] = useState<'logs' | 'report'>();
  return (
    <span>
      <Tooltip label={t('panel.diagnosticLogs')} side="right" portal>
        <button
          type="button"
          aria-label={t('panel.diagnosticLogs')}
          aria-haspopup="dialog"
          aria-expanded={open !== undefined}
          data-diagnostic-logs-entry=""
          onClick={() => setOpen('logs')}
        >
          <LogsIcon size={16} />
        </button>
      </Tooltip>
      {open === 'logs' ? (
        <DiagnosticLogsDialog
          onClose={() => setOpen(undefined)}
          onReport={() => setOpen('report')}
          t={t}
        />
      ) : open === 'report' ? (
        <BugReportDialog onClose={() => setOpen(undefined)} t={t} />
      ) : null}
    </span>
  );
}
