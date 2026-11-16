import { parseBotCliArgs } from './cli-options.js';
import { canonicalCliCommandName } from './cli-command-names.js';
import type { ToolEffects } from '../workspaces/tool-effects.js';

const opaque = undefined;
const read = { changes: 'none', reach: 'local', personalData: true } satisfies ToolEffects;
const write = { ...read, changes: 'reversible' } satisfies ToolEffects;
const externalRead = { ...read, reach: 'external' } satisfies ToolEffects;
const external = { ...write, changes: 'irreversible', reach: 'external' } satisfies ToolEffects;
const externalWrite = { ...write, reach: 'external' } satisfies ToolEffects;
const destructive = { ...write, changes: 'irreversible' } satisfies ToolEffects;
const memoryRead = { ...read, reach: 'memory' } satisfies ToolEffects;
const memoryWrite = { ...write, reach: 'memory' } satisfies ToolEffects;
const secretRead = { ...read, secrets: true } satisfies ToolEffects;
const destructiveSecret = { ...destructive, secrets: true } satisfies ToolEffects;
const secretWrite = { ...write, secrets: true } satisfies ToolEffects;
const management = { ...write, authority: 'management' } satisfies ToolEffects;
const secretManagement = { ...management, secrets: true } satisfies ToolEffects;
const externalIrreversibleManagement = {
  ...management,
  changes: 'irreversible',
  reach: 'external',
} satisfies ToolEffects;
const externalManagement = { ...management, reach: 'external' } satisfies ToolEffects;
const externalSecretManagement = { ...externalManagement, secrets: true } satisfies ToolEffects;
const destructiveManagement = { ...management, changes: 'irreversible' } satisfies ToolEffects;
const destructiveSecretManagement = {
  ...destructiveManagement,
  secrets: true,
} satisfies ToolEffects;

export const CLI_EFFECTS = {
  'tob-cli': { effects: management, brokerRead: false },
  access: { effects: read, brokerRead: true },
  'access-set': { effects: management, brokerRead: false },
  acknowledge: { effects: write, brokerRead: false },
  acknowledgements: { effects: read, brokerRead: false },
  activity: { effects: read, brokerRead: true },
  'activity-allow-once': { effects: external, brokerRead: false },
  'activity-dismiss': { effects: write, brokerRead: false },
  'activity-dismiss-all': { effects: write, brokerRead: false },
  'activity-ignore': { effects: write, brokerRead: false },
  'activity-overview': { effects: read, brokerRead: true },
  'activity-restore': { effects: write, brokerRead: false },
  'activity-snooze': { effects: write, brokerRead: false },
  'activity-status': { effects: read, brokerRead: true },
  'activity-watch': { effects: read, brokerRead: true },
  'appearance-clear-panels': { effects: write, brokerRead: false },
  'appearance-clients': { effects: read, brokerRead: true },
  'appearance-get': { effects: read, brokerRead: true },
  'appearance-reset': { effects: write, brokerRead: false },
  'appearance-set': { effects: write, brokerRead: false },
  'appearance-targets': { effects: read, brokerRead: true },
  'approval-retry': { effects: external, brokerRead: false },
  'approval-reviewer-model': { effects: read, brokerRead: true },
  'approval-reviewer-model-set': { effects: management, brokerRead: false },
  'approval-route': { effects: management, brokerRead: false },
  'approval-routes': { effects: read, brokerRead: true },
  'approval-template': { effects: management, brokerRead: false },
  'approval-template-global-set': { effects: management, brokerRead: false },
  'approval-template-set': { effects: management, brokerRead: false },
  'approval-template-show': { effects: read, brokerRead: true },
  'approval-templates': { effects: read, brokerRead: true },
  'approval-test': { effects: external, brokerRead: false },
  'ask-secret-account-status': { effects: read, brokerRead: true },
  'ask-secret-accounts': { effects: read, brokerRead: true },
  'ask-secret-cancel': { effects: write, brokerRead: false },
  'ask-secret-replace': { effects: secretWrite, brokerRead: false },
  'ask-secret-revoke': { effects: destructiveSecret, brokerRead: false },
  'ask-secret-status': { effects: read, brokerRead: true },
  'ask-secret-submit': { effects: secretWrite, brokerRead: false },
  assignment: { effects: read, brokerRead: true },
  'assignment-context': { effects: read, brokerRead: true },
  'assignment-timeline': { effects: read, brokerRead: true },
  assignments: { effects: read, brokerRead: true },
  audit: { effects: read, brokerRead: false },
  'bot-activity': { effects: read, brokerRead: true },
  'bot-activity-history': { effects: read, brokerRead: true },
  'bot-appearance-set': { effects: write, brokerRead: false },
  'bot-access': { effects: management, brokerRead: true },
  'bot-attention': { effects: read, brokerRead: true },
  'bot-avatar-set': { effects: write, brokerRead: false },
  'bot-banner-set': { effects: write, brokerRead: false },
  'bot-compact': { effects: write, brokerRead: false },
  'bot-context': { effects: read, brokerRead: true },
  'bot-delete-confirm': { effects: destructive, brokerRead: false },
  'bot-delete-memory-folder': { effects: read, brokerRead: true },
  'bot-delete-preview': { effects: read, brokerRead: true },
  'bot-delete-retry': { effects: destructive, brokerRead: false },
  'bot-import-preview': { effects: read, brokerRead: false },
  'bot-lan': { effects: management, brokerRead: false },
  'bot-new-session': { effects: write, brokerRead: false },
  'bot-primary-color-set': { effects: write, brokerRead: false },
  'bot-prompt': { effects: read, brokerRead: true },
  'bot-prompt-set': { effects: write, brokerRead: false },
  'bot-session-usage': { effects: read, brokerRead: true },
  'bot-sessions': { effects: read, brokerRead: true },
  'bot-source-policies': { effects: read, brokerRead: true },
  'bot-source-policy-reset': { effects: write, brokerRead: false },
  'bot-source-policy-set': { effects: write, brokerRead: false },
  'bot-standing-limits-set': { effects: write, brokerRead: false },
  'bot-stop': { effects: destructive, brokerRead: false },
  'bot-system-prompt': { effects: read, brokerRead: true },
  'bot-tool': { effects: opaque, brokerRead: false },
  'bot-tools': { effects: read, brokerRead: true },
  'bot-trace': { effects: read, brokerRead: true },
  'bot-turn-input': { effects: read, brokerRead: true },
  'bot-usage': { effects: read, brokerRead: true },
  'bot-zip-import': { effects: write, brokerRead: false },
  'bot-zip-import-status': { effects: read, brokerRead: false },
  'bot-zip-preview': { effects: read, brokerRead: false },
  'bot-zip-upload': { effects: write, brokerRead: false },
  bots: { effects: write, brokerRead: false },
  'browser-access-set': { effects: management, brokerRead: false },
  'browser-frame': { effects: read, brokerRead: false },
  'browser-input': { effects: external, brokerRead: false },
  'browser-install-packages': { effects: external, brokerRead: false },
  'browser-notification-clients': { effects: read, brokerRead: true },
  'browser-notifications': { effects: write, brokerRead: false },
  'browser-observation': { effects: read, brokerRead: false },
  'browser-open': { effects: external, brokerRead: false },
  'browser-packages': { effects: read, brokerRead: true },
  'browser-profile-set': { effects: management, brokerRead: false },
  'browser-stop': { effects: write, brokerRead: false },
  'browser-takeover': { effects: write, brokerRead: false },
  'browser-takeover-audit': { effects: read, brokerRead: true },
  'browser-takeover-recording': { effects: write, brokerRead: false },
  'browser-tool': { effects: opaque, brokerRead: false },
  'browser-tools': { effects: read, brokerRead: true },
  'browser-webrtc': { effects: write, brokerRead: false },
  'bug-report': { effects: external, brokerRead: false },
  'call-frame': { effects: read, brokerRead: false },
  'call-hangup': { effects: destructive, brokerRead: false },
  'call-list': { effects: read, brokerRead: true },
  'call-read': { effects: read, brokerRead: true },
  'call-readiness': { effects: read, brokerRead: true },
  'call-simulate': { effects: external, brokerRead: false },
  'call-status': { effects: read, brokerRead: true },
  capabilities: { effects: read, brokerRead: false },
  channel: { effects: read, brokerRead: true },
  'channel-activity-today': { effects: read, brokerRead: true },
  'channel-assign': { effects: external, brokerRead: false },
  'channel-assignments': { effects: read, brokerRead: true },
  'channel-bot-stop': { effects: destructive, brokerRead: false },
  'channel-bridge': { effects: external, brokerRead: false },
  'channel-bridges': { effects: read, brokerRead: true },
  'channel-changes': { effects: read, brokerRead: true },
  'channel-connect': { effects: external, brokerRead: false },
  'channel-files': { effects: read, brokerRead: false },
  'channel-history': { effects: read, brokerRead: true },
  'channel-history-sources': { effects: read, brokerRead: false },
  'channel-human-name-set': { effects: write, brokerRead: false },
  'channel-ingests': { effects: read, brokerRead: true },
  'channel-journal': { effects: read, brokerRead: false },
  'channel-list-changes': { effects: read, brokerRead: true },
  'channel-mark-all-read': { effects: write, brokerRead: false },
  'channel-mark-read': { effects: write, brokerRead: false },
  'channel-media-download': { effects: write, brokerRead: false },
  'channel-media-target': { effects: read, brokerRead: false },
  'channel-messages': { effects: read, brokerRead: true },
  'channel-mute': { effects: write, brokerRead: false },
  'channel-purge-confirm': { effects: destructive, brokerRead: false },
  'channel-purge-preview': { effects: read, brokerRead: true },
  'channel-react': { effects: external, brokerRead: false },
  'channel-rename': { effects: write, brokerRead: false },
  'channel-retry': { effects: write, brokerRead: false },
  'channel-search': { effects: read, brokerRead: true },
  'channel-timeline': { effects: read, brokerRead: false },
  'channel-unread': { effects: read, brokerRead: true },
  channels: { effects: read, brokerRead: true },
  cloud: { effects: external, brokerRead: false },
  'cloud-work': { effects: external, brokerRead: false },
  'compaction-threshold-set': { effects: write, brokerRead: false },
  'computer-access-set': { effects: management, brokerRead: false },
  'computer-diagnostics': { effects: read, brokerRead: true },
  'computer-export': { effects: secretWrite, brokerRead: false },
  'computer-exports': { effects: read, brokerRead: true },
  'computer-frame': { effects: read, brokerRead: false },
  'computer-import': { effects: secretWrite, brokerRead: false },
  'computer-input': { effects: external, brokerRead: false },
  'computer-install-packages': { effects: external, brokerRead: false },
  'computer-logs': { effects: read, brokerRead: true },
  'computer-open-dir': { effects: write, brokerRead: false },
  'computer-open-permission-settings': { effects: write, brokerRead: false },
  'computer-start': { effects: write, brokerRead: false },
  'computer-status': { effects: read, brokerRead: true },
  'computer-stop': { effects: write, brokerRead: false },
  'computer-takeover': { effects: write, brokerRead: false },
  'computer-tool': { effects: opaque, brokerRead: false },
  'computer-tools': { effects: read, brokerRead: true },
  'computer-upload': { effects: external, brokerRead: false },
  'computer-video': { effects: write, brokerRead: false },
  'computer-webrtc': { effects: write, brokerRead: false },
  'connect-account-hosts': { effects: read, brokerRead: true },
  'connect-account-revoke': { effects: externalManagement, brokerRead: false },
  'connect-check': { effects: write, brokerRead: false },
  'connect-disable': { effects: management, brokerRead: false },
  'connect-enable': { effects: externalSecretManagement, brokerRead: false },
  'connect-sign-in': { effects: externalManagement, brokerRead: false },
  'connect-sign-out': { effects: externalManagement, brokerRead: false },
  'connect-status': { effects: read, brokerRead: true },
  connection: { effects: write, brokerRead: false },
  'connection-clients': { effects: read, brokerRead: true },
  'connection-host': { effects: write, brokerRead: false },
  'connection-hosts': { effects: write, brokerRead: false },
  create: { effects: external, brokerRead: false },
  'create-status': { effects: read, brokerRead: false },
  'data-reset-confirm': { effects: destructive, brokerRead: false },
  'data-reset-preview': { effects: read, brokerRead: true },
  'desktop-window-reveal': { effects: write, brokerRead: false },
  'developer-mode-set': { effects: write, brokerRead: false },
  'device-account-pair': { effects: externalSecretManagement, brokerRead: false },
  'device-activity': { effects: write, brokerRead: false },
  'device-approve-key': { effects: management, brokerRead: false },
  'device-lan': { effects: management, brokerRead: false },
  'device-notifications': { effects: write, brokerRead: false },
  'device-offer': { effects: management, brokerRead: false },
  'device-offer-status': { effects: read, brokerRead: true },
  'device-pair': { effects: externalSecretManagement, brokerRead: false },
  'device-probe': { effects: write, brokerRead: false },
  'device-requests': { effects: read, brokerRead: true },
  'device-revoke': { effects: management, brokerRead: false },
  devices: { effects: read, brokerRead: true },
  'diagnostic-log-record': { effects: write, brokerRead: false },
  'diagnostic-logs': { effects: read, brokerRead: false },
  'diagnostic-logs-export': { effects: write, brokerRead: false },
  dm: { effects: write, brokerRead: false },
  doctor: { effects: read, brokerRead: false },
  'failure-alerts': { effects: read, brokerRead: true },
  'failure-alerts-retry': { effects: external, brokerRead: false },
  'failure-alerts-set': { effects: write, brokerRead: false },
  'failure-alerts-test': { effects: external, brokerRead: false },
  'feedback-download': { effects: secretWrite, brokerRead: false },
  'feedback-preview': { effects: read, brokerRead: false },
  'feedback-submit': { effects: external, brokerRead: false },
  'folder-browse': { effects: read, brokerRead: true },
  'genui-submit': { effects: external, brokerRead: false },
  'genui-view': { effects: read, brokerRead: true },
  'genui-view-save': { effects: write, brokerRead: false },
  'git-install': { effects: external, brokerRead: false },
  'git-status': { effects: read, brokerRead: true },
  'grant-create': { effects: management, brokerRead: false },
  'grant-request-approve': { effects: management, brokerRead: false },
  'grant-revoke': { effects: management, brokerRead: false },
  'grant-write-set': { effects: management, brokerRead: false },
  grants: { effects: read, brokerRead: true },
  'group-activity': { effects: read, brokerRead: true },
  'group-avatar-set': { effects: write, brokerRead: false },
  'group-create': { effects: write, brokerRead: false },
  'group-delete': { effects: destructive, brokerRead: false },
  'group-invite': { effects: external, brokerRead: false },
  'group-invite-cancel': { effects: write, brokerRead: false },
  'group-join-decide': { effects: write, brokerRead: false },
  'group-member-remove': { effects: write, brokerRead: false },
  'group-send-review': { effects: external, brokerRead: false },
  'group-wake-policies': { effects: read, brokerRead: true },
  'group-wake-set': { effects: write, brokerRead: false },
  help: { effects: read, brokerRead: false },
  'home-model-set': { effects: write, brokerRead: false },
  'host-look': { effects: read, brokerRead: false },
  'host-ping': { effects: read, brokerRead: true },
  'human-identity': { effects: read, brokerRead: true },
  'human-name-set': { effects: write, brokerRead: false },
  'idle-compaction': { effects: read, brokerRead: true },
  'idle-compaction-cache-set': { effects: write, brokerRead: false },
  'idle-compaction-set': { effects: write, brokerRead: false },
  'im-app-add': { effects: externalSecretManagement, brokerRead: false },
  'im-app-remove': { effects: secretManagement, brokerRead: false },
  'im-app-status': { effects: read, brokerRead: true },
  'im-apps': { effects: read, brokerRead: true },
  'im-authorize': { effects: external, brokerRead: false },
  'im-bind': { effects: externalWrite, brokerRead: false },
  'im-cancel': { effects: write, brokerRead: false },
  'im-credentials': { effects: externalSecretManagement, brokerRead: false },
  'im-status': { effects: read, brokerRead: true },
  'im-reconnect': { effects: externalWrite, brokerRead: false },
  'im-unbind': { effects: externalWrite, brokerRead: false },
  'im-verify': { effects: externalSecretManagement, brokerRead: false },
  list: { effects: read, brokerRead: true },
  'marketplace-account': { effects: externalRead, brokerRead: true },
  'marketplace-author': { effects: external, brokerRead: false },
  'marketplace-author-avatar': { effects: external, brokerRead: false },
  'marketplace-delete': { effects: external, brokerRead: false },
  'marketplace-detail': { effects: externalRead, brokerRead: true },
  'marketplace-digest': { effects: externalRead, brokerRead: true },
  'marketplace-digests': { effects: externalRead, brokerRead: true },
  'marketplace-file': { effects: externalRead, brokerRead: true },
  'marketplace-install': { effects: externalWrite, brokerRead: false },
  'marketplace-list': { effects: externalRead, brokerRead: false },
  'marketplace-mine': { effects: externalRead, brokerRead: true },
  'marketplace-report': { effects: external, brokerRead: false },
  'marketplace-sections': { effects: externalRead, brokerRead: true },
  'marketplace-submit': { effects: external, brokerRead: false },
  'marketplace-topics': { effects: externalRead, brokerRead: true },
  'marketplace-upload': { effects: external, brokerRead: false },
  'marketplace-upload-plan': { effects: read, brokerRead: true },
  members: { effects: management, brokerRead: false },
  'memory-changes': { effects: memoryRead, brokerRead: true },
  'memory-checkpoints': { effects: memoryRead, brokerRead: true },
  'memory-commit-diff': { effects: memoryRead, brokerRead: true },
  'memory-diff': { effects: memoryRead, brokerRead: true },
  'memory-file': { effects: memoryRead, brokerRead: true },
  'memory-file-target': { effects: memoryRead, brokerRead: false },
  'memory-graph': { effects: memoryRead, brokerRead: true },
  'memory-history': { effects: memoryRead, brokerRead: true },
  'memory-image': { effects: write, brokerRead: false },
  'memory-move': { effects: memoryWrite, brokerRead: false },
  'memory-repair': { effects: memoryWrite, brokerRead: false },
  'memory-restore': { effects: memoryWrite, brokerRead: false },
  'memory-restore-commit': { effects: memoryWrite, brokerRead: false },
  'memory-save': { effects: memoryWrite, brokerRead: false },
  'memory-snapshot': { effects: memoryRead, brokerRead: true },
  'memory-version-name': { effects: memoryWrite, brokerRead: false },
  'memory-version-unname': { effects: memoryWrite, brokerRead: false },
  'memory-versions': { effects: memoryRead, brokerRead: true },
  'memory-working-diff': { effects: memoryRead, brokerRead: true },
  'message-search': { effects: read, brokerRead: true },
  'messaging-authorize': { effects: management, brokerRead: false },
  'messaging-channel-target': { effects: write, brokerRead: false },
  'messaging-conversation': { effects: external, brokerRead: false },
  'messaging-defaults': { effects: read, brokerRead: true },
  'messaging-defaults-set': { effects: write, brokerRead: false },
  'messaging-grants': { effects: read, brokerRead: true },
  'messaging-group-policy': { effects: management, brokerRead: false },
  'messaging-post': { effects: external, brokerRead: false },
  'messaging-post-limit': { effects: write, brokerRead: false },
  'messaging-post-status': { effects: read, brokerRead: true },
  'messaging-reachable': { effects: externalRead, brokerRead: true },
  'messaging-receive': { effects: write, brokerRead: false },
  'messaging-revoke': { effects: management, brokerRead: false },
  'messaging-send': { effects: external, brokerRead: false },
  'messaging-source': { effects: externalRead, brokerRead: true },
  'messaging-targets': { effects: externalRead, brokerRead: true },
  'messaging-thread-policy': { effects: management, brokerRead: false },
  'model-catalog': { effects: read, brokerRead: true },
  'model-plan': { effects: read, brokerRead: true },
  'model-plan-assignments-set': { effects: write, brokerRead: false },
  'model-plan-customize': { effects: write, brokerRead: false },
  'model-plan-inherit': { effects: write, brokerRead: false },
  'model-plan-set': { effects: write, brokerRead: false },
  'model-preset-apply': { effects: write, brokerRead: false },
  'model-preset-create': { effects: write, brokerRead: false },
  'model-preset-update': { effects: write, brokerRead: false },
  'model-presets': { effects: read, brokerRead: true },
  models: { effects: read, brokerRead: false },
  onboarding: { effects: write, brokerRead: false },
  'overview-memory': { effects: read, brokerRead: true },
  'overview-usage': { effects: read, brokerRead: true },
  'pairing-list': { effects: read, brokerRead: true },
  'pairing-review': { effects: management, brokerRead: false },
  'pairing-status': { effects: write, brokerRead: false },
  pairings: { effects: read, brokerRead: true },
  'part-library': { effects: read, brokerRead: true },
  'part-library-add': { effects: write, brokerRead: false },
  'part-library-export': { effects: write, brokerRead: false },
  'part-library-import': { effects: write, brokerRead: false },
  'part-library-import-image': { effects: write, brokerRead: false },
  pause: { effects: write, brokerRead: false },
  'phone-notifications': { effects: write, brokerRead: false },
  'phone-route': { effects: read, brokerRead: true },
  'phone-route-disable': { effects: externalManagement, brokerRead: false },
  'phone-route-publish': { effects: externalManagement, brokerRead: false },
  'plugin-check': { effects: externalRead, brokerRead: true },
  'plugin-install': { effects: external, brokerRead: false },
  'plugin-restart': { effects: destructive, brokerRead: false },
  'presence-report': { effects: write, brokerRead: false },
  'presence-status': { effects: read, brokerRead: false },
  private: { effects: write, brokerRead: false },
  'private-connect': { effects: externalSecretManagement, brokerRead: false },
  'private-ingress-disable': { effects: externalManagement, brokerRead: false },
  'private-ingress-enable': { effects: externalManagement, brokerRead: false },
  'private-mcp-remove': { effects: secretManagement, brokerRead: false },
  'private-mcp-set': { effects: secretManagement, brokerRead: false },
  'private-route': { effects: write, brokerRead: false },
  'private-tunnel-disable': { effects: externalManagement, brokerRead: false },
  'private-tunnel-enable': { effects: externalManagement, brokerRead: false },
  'profile-backup-activate': { effects: destructiveManagement, brokerRead: false },
  'profile-backup-authorize': { effects: management, brokerRead: false },
  'profile-backup-export': { effects: secretManagement, brokerRead: false },
  'profile-backup-inspect': { effects: secretManagement, brokerRead: false },
  'profile-backup-preview': { effects: read, brokerRead: true },
  'profile-backup-recovery': { effects: read, brokerRead: true },
  'profile-backup-restore': { effects: destructiveSecretManagement, brokerRead: false },
  'prompt-global-set': { effects: write, brokerRead: false },
  'prompt-parts': { effects: read, brokerRead: true },
  'prompt-preset-create': { effects: write, brokerRead: false },
  'prompt-preset-delete': { effects: destructive, brokerRead: false },
  'prompt-preset-update': { effects: write, brokerRead: false },
  'prompt-presets': { effects: read, brokerRead: true },
  'question-deliveries': { effects: read, brokerRead: true },
  'question-retry': { effects: external, brokerRead: false },
  relationships: { effects: write, brokerRead: false },
  'release-check': { effects: externalRead, brokerRead: true },
  'release-info': { effects: read, brokerRead: true },
  'release-install': { effects: external, brokerRead: false },
  'release-restart': { effects: destructive, brokerRead: false },
  resume: { effects: write, brokerRead: false },
  roles: { effects: write, brokerRead: false },
  roster: { effects: read, brokerRead: true },
  'roster-batch': { effects: write, brokerRead: false },
  'roster-hidden-set': { effects: write, brokerRead: false },
  'roster-pins-set': { effects: write, brokerRead: false },
  'roster-section-create': { effects: write, brokerRead: false },
  'roster-section-remove': { effects: write, brokerRead: false },
  'roster-section-rename': { effects: write, brokerRead: false },
  'roster-section-reorder': { effects: write, brokerRead: false },
  'roster-top-reorder': { effects: write, brokerRead: false },
  'schedule-create': { effects: write, brokerRead: false },
  'schedule-delete': { effects: destructive, brokerRead: false },
  'schedule-history': { effects: read, brokerRead: true },
  'schedule-preview': { effects: read, brokerRead: true },
  'schedule-run-now': { effects: external, brokerRead: false },
  'schedule-update': { effects: write, brokerRead: false },
  schedules: { effects: read, brokerRead: true },
  search: { effects: read, brokerRead: true },
  'secret-list': { effects: secretRead, brokerRead: true },
  'secret-put': { effects: secretWrite, brokerRead: false },
  'secret-unset': { effects: destructiveSecret, brokerRead: false },
  send: { effects: external, brokerRead: false },
  'send-status': { effects: read, brokerRead: true },
  'sender-access': { effects: management, brokerRead: false },
  'session-archive-set': { effects: write, brokerRead: false },
  'session-ids': { effects: read, brokerRead: true },
  'session-owner': { effects: read, brokerRead: true },
  'session-stop': { effects: destructive, brokerRead: false },
  'session-subagents': { effects: read, brokerRead: true },
  settings: { effects: read, brokerRead: true },
  'settings-set': { effects: opaque, brokerRead: false },
  'share-draft-decide': { effects: write, brokerRead: false },
  'share-draft-discard': { effects: destructive, brokerRead: false },
  'share-draft-export': { effects: { ...write, reach: 'workspace' }, brokerRead: false },
  'share-draft-file': { effects: read, brokerRead: true },
  'share-draft-finish': { effects: write, brokerRead: false },
  'share-draft-show': { effects: read, brokerRead: true },
  'share-draft-start': { effects: write, brokerRead: false },
  show: { effects: read, brokerRead: true },
  spaces: { effects: write, brokerRead: false },
  'ssh-tunnel': { effects: externalSecretManagement, brokerRead: false },
  'storage-cleanup-confirm': { effects: destructive, brokerRead: false },
  'storage-cleanup-preview': { effects: read, brokerRead: true },
  'storage-messages-cleanup-confirm': { effects: destructive, brokerRead: false },
  'storage-messages-cleanup-preview': { effects: read, brokerRead: true },
  'storage-usage': { effects: read, brokerRead: true },
  'skills-list': { effects: read, brokerRead: true },
  'skills-memory': { effects: memoryRead, brokerRead: true },
  'skills-show': { effects: read, brokerRead: true },
  'skills-remove': { effects: memoryWrite, brokerRead: false },
  'speaker-policy': { effects: read, brokerRead: true },
  'takeover-cancel': { effects: write, brokerRead: false },
  'takeover-complete': { effects: write, brokerRead: false },
  'takeover-request': { effects: write, brokerRead: false },
  'takeover-status': { effects: read, brokerRead: true },
  takeovers: { effects: read, brokerRead: true },
  'team-directory': { effects: read, brokerRead: false },
  'team-mode': { effects: management, brokerRead: false },
  'telemetry-set': { effects: write, brokerRead: false },
  'telemetry-status': { effects: read, brokerRead: true },
  'tob-home': { effects: read, brokerRead: false },
  'todo-add': { effects: write, brokerRead: false },
  'todo-remove': { effects: write, brokerRead: false },
  'todo-tool': { effects: opaque, brokerRead: false },
  'todo-tools': { effects: read, brokerRead: true },
  'todo-update': { effects: write, brokerRead: false },
  todos: { effects: read, brokerRead: true },
  'tool-approval-decide': { effects: externalIrreversibleManagement, brokerRead: false },
  'tool-approval-history': { effects: read, brokerRead: true },
  'tool-approval-rule-revoke': { effects: externalIrreversibleManagement, brokerRead: false },
  'tool-approval-rules': { effects: read, brokerRead: true },
  'tool-approval-status': { effects: read, brokerRead: true },
  update: { effects: write, brokerRead: false },
  'update-cancel': { effects: write, brokerRead: false },
  'update-status': { effects: read, brokerRead: true },
  usage: { effects: read, brokerRead: false },
  'user-question-answer': { effects: external, brokerRead: false },
  'user-question-status': { effects: read, brokerRead: true },
  'voice-asr-set': { effects: write, brokerRead: false },
  'voice-default-set': { effects: write, brokerRead: false },
  'voice-defaults': { effects: read, brokerRead: true },
  'voice-dictate': { effects: external, brokerRead: false },
  'voice-local-kit': { effects: write, brokerRead: false },
  'voice-provider-add': { effects: secretManagement, brokerRead: false },
  'voice-provider-remove': { effects: destructiveSecret, brokerRead: false },
  'voice-provider-test': { effects: external, brokerRead: false },
  'voice-providers': { effects: read, brokerRead: true },
  'voice-set': { effects: write, brokerRead: false },
  'voice-synthesize': { effects: external, brokerRead: false },
  'voice-transcribe': { effects: external, brokerRead: false },
  'voice-vad-set': { effects: write, brokerRead: false },
  'wallpaper-crop': { effects: write, brokerRead: false },
  'wallpaper-get': { effects: read, brokerRead: true },
  'wallpaper-import': { effects: write, brokerRead: false },
  'wallpaper-remove': { effects: write, brokerRead: false },
  'wallpaper-rotation': { effects: write, brokerRead: false },
  'wallpaper-select': { effects: write, brokerRead: false },
  'window-zoom-clients': { effects: read, brokerRead: true },
  'window-zoom-get': { effects: read, brokerRead: true },
  'window-zoom-reset': { effects: write, brokerRead: false },
  'window-zoom-set': { effects: write, brokerRead: false },
  'window-zoom-setup-cancel': { effects: write, brokerRead: false },
  'window-zoom-setup-disable': { effects: write, brokerRead: false },
  'window-zoom-setup-enable': { effects: write, brokerRead: false },
  'window-zoom-setup-status': { effects: read, brokerRead: true },
  'workspace-create': { effects: write, brokerRead: false },
  'workspace-options': { effects: read, brokerRead: true },
} satisfies Record<string, { effects: ToolEffects | undefined; brokerRead: boolean }>;
const declarations: Readonly<
  Partial<Record<string, { effects: ToolEffects | undefined; brokerRead: boolean }>>
> = CLI_EFFECTS;

export function hasCliDeclaration(command: string): boolean {
  return Object.hasOwn(declarations, canonicalCliCommandName(command));
}

function botAccessEffects(
  action: string | undefined,
  values: ReturnType<typeof parseBotCliArgs>['values'],
): ToolEffects | undefined {
  if (action === 'reachable' || action === 'visibility') return read;
  if (action === 'visibility-set') return values.preview ? read : management;
  if (action === 'switches')
    return values['proactive-dms'] === undefined &&
      values['join-channels'] === undefined &&
      values['speaker-context'] === undefined
      ? read
      : management;
  if (action === 'proactive-opt-out') return write;
  return undefined;
}

function familyEffects(
  command: string,
  action: string | undefined,
  rest: readonly string[],
  values: ReturnType<typeof parseBotCliArgs>['values'],
  fallback: ToolEffects | undefined,
): ToolEffects | undefined {
  switch (command) {
    case 'bots': {
      switch (action) {
        case 'list':
        case 'show':
          return read;
        case 'create':
          return values['from-git'] ? externalWrite : write;
        case 'delete':
          return destructive;
        default:
          return botAccessEffects(action, values);
      }
    }
    case 'bot-access':
      return botAccessEffects(action, values);
    case 'channels':
      if (
        action === undefined ||
        ['get', 'roles', 'browse', 'browse-public', 'member-candidates'].includes(action)
      )
        return read;
      if (action === 'send') return external;
      if (['visibility', 'admins', 'add-member', 'policy', 'set-public'].includes(action))
        return management;
      if (['join', 'join-public', 'description'].includes(action)) return write;
      return undefined;
    case 'devices':
      return values.revoke === undefined ? read : destructiveManagement;
    case 'members':
      if (action === 'list' || ((action === 'transfer' || action === 'purge') && values.preview))
        return read;
      if (['password', 'change-password', 'reset-password', 'create'].includes(action ?? ''))
        return secretManagement;
      if (action === 'purge') return destructiveSecretManagement;
      return action === undefined ? secretManagement : management;
    case 'roles':
      return action === 'list' || action === 'catalog' || action === 'conflicts'
        ? read
        : action === 'delete'
          ? destructiveManagement
          : management;
    case 'spaces':
      return action === 'list' || action === 'audience-directory'
        ? read
        : action === 'delete'
          ? destructiveManagement
          : management;
    case 'team-mode':
      return action === 'status'
        ? read
        : action === 'owner-password' || action === 'transfer-owner'
          ? secretManagement
          : management;
    case 'private-route':
      return action === 'list'
        ? read
        : { ...externalManagement, ...(values['token-stdin'] ? { secrets: true } : {}) };
    case 'private-tunnel-enable':
      return { ...externalManagement, ...(values['token-stdin'] ? { secrets: true } : {}) };
    case 'cloud':
      return action === 'list'
        ? read
        : action === 'policy'
          ? management
          : action === 'import'
            ? externalSecretManagement
            : action === 'remove'
              ? destructiveSecretManagement
              : undefined;
    case 'skills-show':
      return values.owner?.startsWith('bot:')
        ? memoryRead
        : values.owner?.startsWith('workspace:')
          ? { ...read, reach: 'workspace' }
          : read;
    case 'computer-video':
      return action === 'input' ? external : write;
    case 'approval-template':
      return action === 'delete'
        ? values.confirm
          ? destructiveManagement
          : read
        : action === 'list' || action === 'show'
          ? read
          : action === 'create' && values['apply-to'] === undefined
            ? write
            : management;
    case 'bot-lan':
      return action === 'list' ? read : management;
    case 'relationships':
      return ['list', 'account-discover', 'account-status', 'enrollments'].includes(action ?? '')
        ? externalRead
        : { ...management, reach: 'external', secrets: true };
    case 'connection-hosts':
      return { ...read, reach: 'external' };
    case 'connection-host': {
      const operation = rest[1];
      return [
        'inspect',
        'test-route',
        'read-operation',
        'read-previous-operation',
        'plan-stop-route',
        'plan-revoke-device',
        'plan-sign-out',
      ].includes(operation ?? '')
        ? externalRead
        : { ...management, reach: 'external' };
    }
    case 'connection':
      return action === 'status' ? read : { ...management, secrets: true };
    case 'browser-notifications':
      return values['patch-stdin'] ? management : read;
    case 'phone-notifications':
    case 'device-notifications':
      return values['preferences-stdin'] || values.delivery ? externalManagement : externalRead;
    case 'device-activity':
      return action === 'capability' ? externalRead : externalWrite;
    case 'onboarding':
      return values.action === undefined ? read : write;
    case 'create':
    case 'bot-import-preview':
    case 'create-status':
      return values['from-git']
        ? command === 'create'
          ? externalWrite
          : externalRead
        : command === 'create'
          ? write
          : read;
    case 'marketplace-install':
      return values.review === undefined ? externalRead : externalWrite;
    case 'voice-provider-add':
      return values['key-stdin'] ? secretManagement : management;
    case 'tob-cli':
      return action === 'status' ? read : action === 'cancel' ? write : undefined;
    case 'bot-tool':
    case 'browser-tool':
    case 'computer-tool':
    case 'todo-tool':
    case 'settings-set':
      return undefined;
    default:
      return fallback;
  }
}

export function cliEffects(argv: readonly string[]): ToolEffects | undefined {
  let parsed: ReturnType<typeof parseBotCliArgs>;
  try {
    parsed = parseBotCliArgs(argv);
  } catch {
    return undefined;
  }
  const [requestedCommand, action] = parsed.positionals;
  if (!requestedCommand) return undefined;
  const command = canonicalCliCommandName(requestedCommand);
  if (!hasCliDeclaration(command)) return undefined;
  const effects = familyEffects(
    command,
    action,
    parsed.positionals.slice(1),
    parsed.values,
    declarations[command]?.effects,
  );
  if (!effects) return undefined;
  if (parsed.values.out !== undefined)
    return {
      ...effects,
      changes: effects.changes === 'none' ? 'reversible' : effects.changes,
      reach: effects.reach === 'external' ? 'external' : 'workspace',
    };
  return effects;
}

export function brokerCliEffects(name: string, args: unknown): ToolEffects | undefined {
  const command = name.slice('deepseekbot '.length);
  if (typeof args !== 'object' || args === null) return undefined;
  if (
    'patch' in args &&
    typeof args.patch === 'object' &&
    args.patch !== null &&
    'argv' in args.patch
  ) {
    const argv = args.patch.argv;
    if (
      !Array.isArray(argv) ||
      !argv.every((arg): arg is string => typeof arg === 'string') ||
      argv[0] !== command
    )
      return undefined;
    return cliEffects(argv);
  }
  if ('command' in args && args.command === command) return cliEffects([command]);
  return undefined;
}

export const BROKER_CLI_READS: ReadonlySet<string> = new Set(
  Object.entries(CLI_EFFECTS)
    .filter(([, declaration]) => declaration.brokerRead)
    .map(([name]) => name),
);
