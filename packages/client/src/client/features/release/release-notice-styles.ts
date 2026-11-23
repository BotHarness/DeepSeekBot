import { border, space } from '../../ds/tokens.stylex.js';
import { personabotsCss } from '../personabots/styles.js';
import { releaseCss } from './styles.js';

export const RELEASE_NOTICE_CSS = [
  personabotsCss.intro,
  `.bh-release-dialog {
  width: min(680px, calc(100vw - 32px));
}
.bh-telemetry-dialog {
  width: min(560px, calc(100vw - 32px));
}
`,
  personabotsCss.telemetryNotice,
  `.bh-telemetry-notice-row {
  display: grid;
  grid-template-columns: 80px minmax(0, 1fr);
  gap: ${space.x4};
  min-width: 0;
}
`,
  personabotsCss.telemetryNoticeRow,
  `@media (max-width: 520px) {
  .bh-telemetry-notice-row {
    grid-template-columns: minmax(0, 1fr);
    gap: ${space.x1};
  }
}
.bh-release-notes {
  display: flex;
  flex-direction: column;
  gap: ${space.x2};
  max-height: min(60vh, 560px);
  overflow-y: auto;
  min-width: 0;
}
`,
  releaseCss.releaseNote,
  `.bh-release-note-head::before {
  content: '';
  flex: none;
  width: 6px;
  height: 6px;
  margin: 0 ${space.x1};
  border-right: ${border.hairline} solid currentColor;
  border-bottom: ${border.hairline} solid currentColor;
  transform: rotate(-45deg);
  transition: transform 150ms var(--ds-ease-in-out);
}
`,
  releaseCss.releaseNoteReleaseNoteHead,
  `.bh-release-note-rule {
  flex: 1;
  min-width: 16px;
  height: 1px;
  background: var(--tobs-line-edge);
}
`,
  releaseCss.releaseNoteCount,
].join('');
