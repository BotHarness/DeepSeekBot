import { TEAM_COMMANDS } from './cli-team.js';
import { GENUI_COMMANDS } from './cli-genui.js';
import { HOST_LOOK_COMMANDS } from './cli-host-look.js';
import { PROFILE_BACKUP_COMMANDS } from './cli-profile-backup.js';
import { WINDOW_ZOOM_COMMANDS } from './cli-window-zoom.js';
import { DESKTOP_WINDOW_COMMANDS } from './cli-desktop-window.js';
import { PRESENCE_COMMANDS } from './cli-presence.js';
import { ENGINE_COMMANDS } from './cli-engine.js';
import { PHONE_ROUTE_COMMANDS } from './cli-phone-route.js';
import { DEVICES_COMMANDS } from './cli-devices.js';
import { RELATIONSHIP_COMMANDS } from './cli-relationships.js';
import { DEVICE_CLIENT_COMMANDS } from './cli-device-client.js';
import { DEVICE_NOTIFICATION_COMMANDS } from './cli-device-notifications.js';
import { BROWSER_NOTIFICATION_COMMANDS } from './cli-browser-notifications.js';
import { FEEDBACK_COMMANDS } from './cli-feedback.js';
import { DIAGNOSTIC_LOG_COMMANDS } from './cli-diagnostic-logs.js';
import { DOCTOR_COMMANDS } from './cli-doctor.js';
import { BUG_REPORT_COMMANDS } from './cli-bug-report.js';
import { APPEARANCE_COMMANDS } from './cli-appearance.js';
import { CONNECTION_COMMANDS } from './cli-connection.js';
import { TOB_CLI_COMMANDS } from './cli-tob.js';
import { BOT_TOOL_COMMANDS } from './cli-bot-tool.js';
import { CALL_TIMELINE_COMMANDS } from './cli-call-timeline.js';
import { TAKEOVER_COMMANDS } from './cli-takeover.js';
import { CHANNEL_COMMANDS } from './cli-channels.js';
import { BROWSER_COMPUTER_COMMANDS } from './cli-browser-computer.js';
import { IM_COMMANDS } from './cli-im-authorization.js';
import { MESSAGING_COMMANDS } from './cli-messaging.js';
import { MODELS_USAGE_COMMANDS } from './cli-models-usage.js';
import { HOST_ADMIN_COMMANDS } from './cli-host-admin.js';
import { INBOX_COMMANDS } from './cli-inbox.js';
import { PROFILE_COMMANDS } from './cli-profile.js';
import { TODO_COMMANDS } from './cli-todos.js';
import { APPROVAL_TEMPLATE_COMMANDS } from './cli-approval-templates.js';
import { PROMPT_PRESET_COMMANDS } from './cli-prompt-presets.js';
import { APPROVAL_REVIEWER_COMMANDS } from './cli-approval-reviewer.js';
import { VOICE_COMMANDS } from './cli-voice.js';
import { CALL_COMMANDS } from './cli-call.js';
import { SKILL_COMMANDS } from './cli-skills.js';
import { STORAGE_COMMANDS } from './cli-storage.js';
import { IDLE_COMPACTION_COMMANDS } from './cli-idle-compaction.js';
import { BOT_MODE_COMMANDS } from './cli-bot-modes.js';
import { CONNECT_COMMANDS } from './cli-connect.js';
import { SHARE_DRAFT_COMMANDS } from './cli-share-draft.js';

export const LIVE_COMMANDS = [
  ...TEAM_COMMANDS,
  ...GENUI_COMMANDS,
  ...PROFILE_BACKUP_COMMANDS,
  ...BROWSER_NOTIFICATION_COMMANDS,
  ...CONNECTION_COMMANDS,
  ...HOST_LOOK_COMMANDS,
  ...DEVICE_NOTIFICATION_COMMANDS,
  {
    command: 'device-activity',
    description:
      'read capability or prepare/register/stop/status one device Lock Screen status (--device-file, --activity-stdin)',
  },
  ...FEEDBACK_COMMANDS,
  ...DIAGNOSTIC_LOG_COMMANDS,
  ...DOCTOR_COMMANDS,
  ...BUG_REPORT_COMMANDS,
  ...WINDOW_ZOOM_COMMANDS,
  ...DESKTOP_WINDOW_COMMANDS,
  ...PRESENCE_COMMANDS,
  ...ENGINE_COMMANDS,
  ...PHONE_ROUTE_COMMANDS,
  ...DEVICES_COMMANDS,
  ...RELATIONSHIP_COMMANDS,
  ...DEVICE_CLIENT_COMMANDS,
  ...CONNECT_COMMANDS,
  ...IM_COMMANDS,
  ...MESSAGING_COMMANDS,
  {
    command: 'cloud',
    description: 'manage an explicit cloud Agent connection (private JSON through stdin)',
  },
  {
    command: 'cloud-work',
    description: 'run the cloud_work Tool directly for a Bot using JSON from stdin',
  },
  ...MODELS_USAGE_COMMANDS,
  ...CHANNEL_COMMANDS,
  ...HOST_ADMIN_COMMANDS,
  ...SHARE_DRAFT_COMMANDS,
  ...APPEARANCE_COMMANDS,
  ...INBOX_COMMANDS,
  ...BROWSER_COMPUTER_COMMANDS,
  ...PROFILE_COMMANDS,
  ...BOT_TOOL_COMMANDS,
  ...TOB_CLI_COMMANDS,
  ...TAKEOVER_COMMANDS,
  ...TODO_COMMANDS,
  ...APPROVAL_TEMPLATE_COMMANDS,
  ...PROMPT_PRESET_COMMANDS,
  ...APPROVAL_REVIEWER_COMMANDS,
  ...VOICE_COMMANDS,
  ...CALL_COMMANDS,
  ...CALL_TIMELINE_COMMANDS,
  ...IDLE_COMPACTION_COMMANDS,
  ...BOT_MODE_COMMANDS,
  ...STORAGE_COMMANDS,
  ...SKILL_COMMANDS,
  {
    command: 'send',
    description: 'send a Human DM and collect its committed Bot reply from a live Host',
  },
  {
    command: 'send-status',
    description: 'inspect a Human DM receipt and its exact Bot replies without resending',
  },
  {
    command: 'tool-approval-status',
    description: 'inspect a pending tool approval on a live Host',
  },
  {
    command: 'tool-approval-decide',
    description: 'allow once, always allow a secret_cli kind, or reject an owned tool approval',
  },
  {
    command: 'user-question-status',
    description: 'inspect a formal Human question',
  },
  {
    command: 'ask-secret-status',
    description: 'inspect a private input request without values',
  },
  {
    command: 'ask-secret-submit',
    description: 'submit confidential field JSON from stdin through the authenticated Owner',
  },
  {
    command: 'ask-secret-cancel',
    description: 'cancel a private input request as Owner',
  },
  {
    command: 'ask-secret-account-status',
    description: 'inspect current private account access',
  },
  {
    command: 'ask-secret-replace',
    description: 'open a blank replacement private input card',
  },
  {
    command: 'ask-secret-revoke',
    description: 'revoke local private account access as Owner',
  },
  {
    command: 'ask-secret-accounts',
    description: "list a Bot's private accounts as Owner, without values",
  },
  {
    command: 'user-question-answer',
    description: 'answer a formal Human question with JSON from stdin',
  },
  {
    command: 'release-info',
    description: 'read the running Host release lifecycle',
  },
  {
    command: 'workspace-options',
    description: 'list live Host workspaces for grants',
  },
  {
    command: 'folder-browse',
    description: 'list folder names on the Host computer, as the phone folder picker does',
  },
  {
    command: 'grant-create',
    description: 'authorize a Bot workspace through the live Host',
  },
  {
    command: 'browser-access-set',
    description: "turn a Bot's Browser Access on or off through the live Host",
  },
  {
    command: 'computer-access-set',
    description: "turn a Bot's Computer Access on or off through the live Host",
  },
  {
    command: 'access',
    description: "read a Bot's access preset (workspace write or full access)",
  },
  {
    command: 'access-set',
    description: "set a Bot's access preset; full access needs --acknowledge-risk",
  },
  { command: 'settings', description: 'read one live Host settings namespace' },
  {
    command: 'settings-set',
    description: 'patch one live Host settings namespace with JSON from stdin',
  },
  {
    command: 'workspace-create',
    description: 'register an absolute folder as a Host workspace',
  },
  {
    command: 'group-create',
    description: 'create a group Channel with optional initial Bots',
  },
  {
    command: 'im-app-add',
    description: 'add a token-based IM app (Discord, Slack, …) with credentials JSON from stdin',
  },
  {
    command: 'im-app-status',
    description: "read a token IM platform's apps and connection state",
  },
  {
    command: 'im-app-remove',
    description: 'remove a token IM app from the Provider',
  },
  { command: 'im-bind', description: 'bind a connected IM app to a Bot' },
  { command: 'im-unbind', description: 'unbind an IM app from a Bot' },
  {
    command: 'im-reconnect',
    description: 'reconnect a Bot IM receiver without changing its access',
  },
  {
    command: 'im-status',
    description: "read a Bot's IM apps and bindings with reception state",
  },
  {
    command: 'channel-connect',
    description: "connect an external group conversation to a Channel through a Bot's binding",
  },
  {
    command: 'channel-ingests',
    description: "list a Channel's connected external conversations",
  },
  {
    command: 'browser-open',
    description: "start a Bot's Browser and open its tab for viewing",
  },
  {
    command: 'browser-frame',
    description: "save the current picture of a Bot's Browser to a file",
  },
  {
    command: 'browser-takeover',
    description: "pause a Bot's Browser for Human input (--enabled) or hand it back (--disabled)",
  },
  {
    command: 'browser-input',
    description:
      "click, scroll, type or press a key in a paused Bot's Browser (input JSON from stdin)",
  },
  { command: 'browser-stop', description: "stop a Bot's Browser" },
  {
    command: 'computer-start',
    description: 'start the profile Computer with explicit authorization',
  },
  {
    command: 'computer-status',
    description: 'read the profile Computer target and state',
  },
  {
    command: 'computer-video',
    description:
      'Local Computer video status/open/signal/heartbeat/takeover/input/release/resume/close (JSON from stdin; open needs --out)',
  },
  {
    command: 'computer-frame',
    description: 'save the current picture of the profile Computer desktop to a file',
  },
  {
    command: 'computer-takeover',
    description:
      'pause Bot use of the profile Computer for Human input (--enabled) or hand it back (--disabled)',
  },
  {
    command: 'computer-input',
    description:
      'click, scroll, type or press a key on a paused profile Computer desktop (input JSON from stdin)',
  },
  { command: 'computer-stop', description: 'stop the profile Computer' },
  {
    command: 'browser-tools',
    description: 'list the Browser tools a Bot can call, with input schemas',
  },
  {
    command: 'browser-tool',
    description:
      'run one Browser tool directly for a Bot, without the model (args JSON from stdin)',
  },
  {
    command: 'memory-image',
    description:
      'export version-bound Memory image bytes (--path --image-source --image-revision [--image-reference] --out)',
  },
  {
    command: 'memory-file-target',
    description: 'resolve a memory file path for a Bot',
  },
  { command: 'memory-graph', description: "read a Bot's memory commit graph" },
  {
    command: 'memory-commit-diff',
    description: 'read the full diff of one memory commit',
  },
  { command: 'memory-changes', description: 'list uncommitted memory changes' },
  {
    command: 'memory-working-diff',
    description: 'read the diff of one uncommitted memory file',
  },
  {
    command: 'memory-checkpoints',
    description: 'list memory recovery checkpoints',
  },
  {
    command: 'memory-restore',
    description: 'restore memory to a recovery checkpoint',
  },
  {
    command: 'memory-restore-commit',
    description: 'restore memory to an earlier commit',
  },
  { command: 'memory-versions', description: 'list named memory versions' },
  {
    command: 'memory-version-name',
    description: 'name a memory commit as a version',
  },
  {
    command: 'memory-version-unname',
    description: 'remove a memory version name',
  },
  {
    command: 'memory-repair',
    description: 'repair a memory repository against its expected head',
  },
  {
    command: 'memory-move',
    description: "move a Bot's Memory repository to another folder, or back to the default",
  },
  {
    command: 'bot-trace',
    description: 'show which tools a Bot called in its recent turns, with outcomes',
  },
  {
    command: 'bot-turn-input',
    description: 'show the exact input messages a Bot received in its recent turns',
  },
  {
    command: 'computer-tools',
    description: 'list the Computer tools a Bot can call, with input schemas',
  },
  {
    command: 'computer-tool',
    description:
      'run one Computer tool directly for a Bot, without the model (args JSON from stdin)',
  },
] as const;

export { LIVE_OPTIONS } from './cli-option-spec.js';
export { CliLiveError } from './cli-live-error.js';
export { runLiveCli } from './cli-live-dispatch.js';
export { connectLiveHost } from './cli-live-host.js';
export { cliQuote } from './cli-live-input.js';
export { parseReviewedSettings, type ReviewedSettings } from './cli-live-control.js';
