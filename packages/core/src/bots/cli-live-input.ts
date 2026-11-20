import { CliLiveError } from './cli-live-error.js';
import type { BrowserComputerValues } from './cli-browser-computer.js';
import type { ImValues } from './cli-im-authorization.js';
import type { MessagingValues } from './cli-messaging.js';
import type { ModelsUsageValues } from './cli-models-usage.js';
import type { HostAdminValues } from './cli-host-admin.js';
import type { InboxValues } from './cli-inbox.js';
import type { ScheduleValues } from './cli-schedules.js';
import type { ProfileValues } from './cli-profile.js';
import type { TodoValues } from './cli-todos.js';
import type { ApprovalTemplateValues } from './cli-approval-templates.js';
import type { ApprovalReviewerValues } from './cli-approval-reviewer.js';
import type { VoiceValues } from './cli-voice.js';

export interface LiveValues
  extends
    ImValues,
    MessagingValues,
    ModelsUsageValues,
    HostAdminValues,
    InboxValues,
    ScheduleValues,
    BrowserComputerValues,
    ProfileValues,
    TodoValues,
    ApprovalTemplateValues,
    ApprovalReviewerValues,
    VoiceValues {
  id?: string;
  skill?: string[];
  as?: string;
  username?: string;
  'display-name'?: string;
  'initial-password-file'?: string;
  'password-stdin'?: boolean;

  'new-home'?: string;
  'client-id'?: string;
  'device-file'?: string;
  'link-file'?: string;
  'account-file'?: string;
  'connection-id'?: string;
  'confirm-disconnect'?: boolean;
  handover?: string;
  'connection-route-id'?: string;
  'expected-route-revision'?: string;
  fingerprint?: string;
  'remote-host-id'?: string;
  'host-id'?: string;
  'preferences-stdin'?: boolean;
  host?: string;
  'token-file'?: string;
  'image-source'?: string;
  'image-revision'?: string;
  'image-reference'?: string;
  timeout?: string;
  'message-id'?: string;
  'reply-to'?: string;
  quote?: string[];
  'quote-note'?: string[];
  'failure-message-id'?: string;
  'auto-continue-for'?: string;
  recovery?: string;
  body?: string;
  'body-stdin'?: boolean;
  attach?: string[];
  title?: string;
  'answer-stdin'?: boolean;
  'values-stdin'?: boolean;
  outcome?: string;
  since?: string;
  hours?: string;
  offline?: boolean;
  home?: string;
  workspace?: string;
  after?: string;
  reason?: string;
  limit?: string;
  before?: string;
  enabled?: boolean;
  disabled?: boolean;
  mode?: string;
  scope?: string;
  'acknowledge-risk'?: boolean;
  'patch-stdin'?: boolean;
  refresh?: boolean;
  'previous-value'?: string;
  member?: string[];
  'operation-key'?: string;
  app?: string;
  bot?: string;
  conversation?: string;
  out?: string;
  'args-stdin'?: boolean;
  'cause-event'?: string;
  session?: string;
  turns?: string;
  offset?: string;
  kind?: string;
  checkpoint?: string;
  'expected-current'?: string;
  'restore-id'?: string;
  'repair-id'?: string;
  'memory-location'?: string;
  'default-location'?: boolean;
  tag?: string;
  path?: string;
  sha?: string;
  name?: string;
  'expected-head'?: string;
  'edit-id'?: string;
  target?: string;
  keep?: boolean;
  drop?: boolean;
  'rewrite-stdin'?: boolean;
}

export function usage(message: string): never {
  throw new CliLiveError('usage', message);
}

export function timeoutMs(value: string | undefined): number {
  const seconds = value === undefined ? 120 : Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 600)
    usage('--timeout must be between 0 and 600 seconds.');
  return Math.ceil(seconds * 1000);
}

export function cliQuote(value: string): { messageId: string; text?: string } {
  const split = value.indexOf('::');
  return split < 0
    ? { messageId: value.trim() }
    : { messageId: value.slice(0, split).trim(), text: value.slice(split + 2) };
}
