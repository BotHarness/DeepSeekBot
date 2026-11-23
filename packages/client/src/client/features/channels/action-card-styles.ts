import { color, radius, space, text } from '../../ds/tokens.stylex.js';
import { approvalsCss } from '../approvals/styles.js';
import { assignmentsCss } from '../assignments/styles.js';
import { privateInputCss } from '../private-input/styles.js';
import { sessionsCss } from '../sessions/styles.js';

export const CHANNEL_ACTION_CARD_CSS = [
  approvalsCss.grantRequestTitle,
  `.bh-session-failure-row {
  --bh-message-card-gap: ${space.x3};
  display: grid;
  gap: var(--bh-message-card-gap);
  min-width: min(340px, 100%);
  max-width: 560px;
  color: var(--tobs-ink-secondary);
  font-size: ${text.bodySize};
  line-height: ${text.bodyLine};
}
`,
  sessionsCss.sessionFailureHeading,
  `.bh-private-input-card, .bh-takeover-card { --bh-message-card-gap: ${space.x3}; display: grid; gap: var(--bh-message-card-gap); width: 380px; max-width: 100%; }
`,
  sessionsCss.takeoverCard,
  privateInputCss.messageCardActions,
  `.bh-private-input-card { --bh-message-card-gap: ${space.x2}; width: 520px; }
`,
  privateInputCss.privateInputHeading,
  `.bh-tool-approval-input {
  margin: 0;
  padding: ${space.x3};
  max-height: min(420px, 60vh);
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  border-radius: ${radius.md};
  background: ${color.well};
  color: var(--tobs-ink-primary);
}
`,
  assignmentsCss.assignmentAccessRow,
].join('');
