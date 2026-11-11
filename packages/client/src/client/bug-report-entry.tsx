import { useState, type ReactElement } from 'react';

import { BugIcon } from './bug-icon.js';
import { BugReportDialog } from './bug-report-dialog.js';
import { Tooltip } from './ds/tooltip.js';
import type { BotHarnessTranslate } from './locale.js';

export function BugReportEntry({ t }: { t: BotHarnessTranslate }): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <span>
      <Tooltip label={t('bugReport.open')} side="right" portal>
        <button
          type="button"
          aria-label={t('bugReport.open')}
          aria-haspopup="dialog"
          aria-expanded={open}
          data-bug-report-entry=""
          onClick={() => setOpen(true)}
        >
          <BugIcon size={16} />
        </button>
      </Tooltip>
      {open ? <BugReportDialog onClose={() => setOpen(false)} t={t} /> : null}
    </span>
  );
}
