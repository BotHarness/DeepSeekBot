export const SKILL_OPTIONS = {
  skill: { type: 'string', multiple: true },
  owner: { type: 'string' },
  confirm: { type: 'boolean' },
} as const;

export const APPROVAL_REVIEWER_OPTIONS = {
  effort: { type: 'string' },
} as const;

export const APPROVAL_TEMPLATE_OPTIONS = {
  from: { type: 'string' },
  'delete-revision': { type: 'string' },
  blank: { type: 'boolean' },
  'parts-file': { type: 'string' },
  'apply-to': { type: 'string' },
  'text-stdin': { type: 'boolean' },
  'literal-template': { type: 'boolean' },
} as const;

export const BROWSER_COMPUTER_OPTIONS = {
  permission: { type: 'string' },
  tab: { type: 'string' },
  profile: { type: 'string' },
  package: { type: 'string', multiple: true },
  confirm: { type: 'boolean' },
  'token-stdin': { type: 'boolean' },
  dir: { type: 'string' },
  plugin: { type: 'string' },
  entity: { type: 'string' },
  viewer: { type: 'string' },
  probe: { type: 'boolean' },
} as const;

export const CALL_TIMELINE_OPTIONS = {
  'from-ms': { type: 'string' },
  'to-ms': { type: 'string' },
} as const;

export const CALL_OPTIONS = {
  script: { type: 'string' },
  'reply-wait': { type: 'string' },
  video: { type: 'string' },
  screen: { type: 'string' },
  'share-ends-at': { type: 'string' },
  'share-pause': { type: 'string' },
} as const;

export const CHANNEL_OPTIONS = {
  'avatar-file': { type: 'string' },
  'expected-channel': { type: 'string' },
  invitation: { type: 'string' },
  request: { type: 'string' },
  accept: { type: 'boolean' },
  decline: { type: 'boolean' },
  inherit: { type: 'boolean' },
  count: { type: 'string' },
  interval: { type: 'string' },
  direction: { type: 'string' },
  around: { type: 'string' },
  'older-limit': { type: 'string' },
  'newer-limit': { type: 'string' },
  through: { type: 'string' },
  since: { type: 'string' },
  epoch: { type: 'string' },
  'source-event': { type: 'string', multiple: true },
  confirm: { type: 'boolean' },
  emoji: { type: 'string' },
  remove: { type: 'boolean' },
  off: { type: 'boolean' },
  attachment: { type: 'string' },
  representation: { type: 'string' },
} as const;

export const CONNECT_OPTIONS = {
  'expected-route-revision': { type: 'string' },
  hostname: { type: 'string' },
  'token-stdin': { type: 'boolean' },
  wait: { type: 'boolean' },
  quick: { type: 'boolean' },
  origin: { type: 'string' },
  lan: { type: 'boolean' },
} as const;

export const DEVICE_NOTIFICATION_OPTIONS = {
  'metro-port': { type: 'string' },
  'target-id': { type: 'string' },
  'device-name': { type: 'string' },
  'device-file': { type: 'string' },
  'preferences-stdin': { type: 'boolean' },
  delivery: { type: 'string' },
} as const;

export const GENUI_OPTIONS = {
  'genui-file': { type: 'string' },
  'genui-stdin': { type: 'boolean' },
} as const;

export const HOST_ADMIN_OPTIONS = {
  force: { type: 'boolean' },
  action: { type: 'string' },
  query: { type: 'string' },
  topic: { type: 'string' },
  sort: { type: 'string' },
  lang: { type: 'string' },
  reason: { type: 'string' },
  decision: { type: 'string' },
  capability: { type: 'string', multiple: true },
  confirm: { type: 'boolean' },
  'accept-terms': { type: 'boolean' },
  'include-uploads': { type: 'boolean' },
  review: { type: 'string' },
  replaces: { type: 'string' },
  day: { type: 'string' },
  version: { type: 'string' },
} as const;

export const IM_OPTIONS = {
  'credentials-stdin': { type: 'boolean' },
  'verification-stdin': { type: 'boolean' },
  wait: { type: 'boolean' },
} as const;

export const INBOX_OPTIONS = {
  notifications: { type: 'boolean' },
  category: { type: 'string' },
  'watch-seconds': { type: 'string' },
  channel: { type: 'string' },
  request: { type: 'string' },
  sort: { type: 'string' },
  search: { type: 'string' },
  unread: { type: 'boolean' },
  'source-key': { type: 'string' },
  source: { type: 'string' },
  section: { type: 'string' },
  unsectioned: { type: 'boolean' },
  index: { type: 'string' },
  archived: { type: 'boolean' },
  unarchived: { type: 'boolean' },
  rule: { type: 'string' },
  server: { type: 'string' },
  confirm: { type: 'boolean' },
  until: { type: 'string' },
  snoozed: { type: 'boolean' },
  dismissed: { type: 'boolean' },
  activity: { type: 'string' },
  'include-archived': { type: 'boolean' },
} as const;

export const MESSAGING_OPTIONS = {
  'input-stdin': { type: 'boolean' },
  'read-mode': { type: 'string' },
  confirm: { type: 'boolean' },
  binding: { type: 'string' },
  source: { type: 'string' },
  channel: { type: 'string' },
  pairing: { type: 'string' },
  delivery: { type: 'string' },
  'request-id': { type: 'string' },
} as const;

export const MODELS_USAGE_OPTIONS = {
  'expected-revision': { type: 'string' },
  'plan-stdin': { type: 'boolean' },
  period: { type: 'string' },
  after: { type: 'string' },
  start: { type: 'string' },
  end: { type: 'string' },
  model: { type: 'string' },
  provider: { type: 'string' },
  purpose: { type: 'string' },
  weeks: { type: 'string' },
} as const;

export const PRESENCE_OPTIONS = {
  active: { type: 'boolean' },
  idle: { type: 'boolean' },
} as const;

export const PROFILE_OPTIONS = {
  file: { type: 'string' },
  'recipe-stdin': { type: 'boolean' },
  'part-stdin': { type: 'boolean' },
  color: { type: 'string' },
  automatic: { type: 'boolean' },
  'source-class': { type: 'string' },
  wake: { type: 'string' },
  delivery: { type: 'string' },
  'digest-count': { type: 'string' },
  'digest-interval': { type: 'string' },
  soul: { type: 'string' },
  'core-memory': { type: 'string' },
  section: { type: 'string' },
  confirm: { type: 'boolean' },
  slot: { type: 'string' },
  colors: { type: 'string' },
  parent: { type: 'string' },
  'part-id': { type: 'string' },
} as const;

export const PROMPT_PRESET_OPTIONS = {
  'parts-stdin': { type: 'boolean' },
  'prompt-limit': { type: 'string', multiple: true },
  'expected-revision': { type: 'string' },
  confirm: { type: 'boolean' },
} as const;

export const SCHEDULE_OPTIONS = {
  confirm: { type: 'boolean' },
} as const;

export const SHARE_DRAFT_OPTIONS = {
  keep: { type: 'boolean' },
  drop: { type: 'boolean' },
  'rewrite-stdin': { type: 'boolean' },
} as const;

export const SSH_OPTIONS = {
  'pairing-file': { type: 'string' },
  'local-port': { type: 'string' },
  'remote-port': { type: 'string' },
  'ssh-config': { type: 'string' },
} as const;

export const STORAGE_OPTIONS = {
  chat: { type: 'string', multiple: true },
  media: { type: 'string', multiple: true },
  'older-than-days': { type: 'string' },
} as const;

export const TAKEOVER_OPTIONS = {
  minutes: { type: 'string' },
  pending: { type: 'boolean' },
} as const;

export const TEAM_OPTIONS = {
  private: { type: 'boolean' },
  public: { type: 'string' },
  'proactive-dms': { type: 'string' },
  'join-channels': { type: 'string' },
  'speaker-context': { type: 'string' },
  'policy-stdin': { type: 'boolean' },
  as: { type: 'string' },
  after: { type: 'string' },
  reason: { type: 'string' },
  audience: { type: 'string' },
  models: { type: 'string' },
  'human-id': { type: 'string' },
  post: { type: 'string' },
  'add-members': { type: 'string' },
  'mention-all': { type: 'string' },
  'add-bots': { type: 'string' },
  'edit-details': { type: 'string' },
  to: { type: 'string' },
  preview: { type: 'boolean' },
  'token-stdin': { type: 'boolean' },
  'sign-out-others': { type: 'string' },
  permissions: { type: 'string' },
  set: { type: 'string' },
  revoke: { type: 'string' },
  'role-ids': { type: 'string' },
  username: { type: 'string' },
  'display-name': { type: 'string' },
  'initial-password-file': { type: 'string' },
  'password-stdin': { type: 'boolean' },
} as const;

export const TODO_OPTIONS = {
  done: { type: 'boolean' },
  'not-done': { type: 'boolean' },
} as const;

export const VOICE_OPTIONS = {
  'base-url': { type: 'string' },
  'key-stdin': { type: 'boolean' },
  voice: { type: 'string' },
  text: { type: 'string' },
  markdown: { type: 'boolean' },
  language: { type: 'string' },
} as const;

export const WALLPAPER_OPTIONS = {
  'wallpaper-item': { type: 'string' },
} as const;

export const WINDOW_ZOOM_OPTIONS = {
  'client-id': { type: 'string' },
  'zoom-level': { type: 'string' },
  'zoom-default': { type: 'boolean' },
} as const;

export const ZIP_UPLOAD_OPTIONS = {
  'upload-key': { type: 'string' },
  'archive-sha256': { type: 'string' },
  'archive-size': { type: 'string' },
} as const;

export const APPEARANCE_OPTIONS = {
  ...WALLPAPER_OPTIONS,
  'client-id': { type: 'string' },
  'confirm-reset': { type: 'boolean' },
  'expected-wallpaper-revision': { type: 'string' },
} as const;

export const LIVE_OPTIONS = {
  ...TEAM_OPTIONS,
  ...GENUI_OPTIONS,
  'new-home': { type: 'string' },

  'connection-id': { type: 'string' },
  'confirm-disconnect': { type: 'boolean' },
  handover: { type: 'string' },
  'connection-route-id': { type: 'string' },
  fingerprint: { type: 'string' },
  'link-file': { type: 'string' },
  'account-file': { type: 'string' },
  'remote-host-id': { type: 'string' },
  'host-id': { type: 'string' },
  ...DEVICE_NOTIFICATION_OPTIONS,
  'activity-stdin': { type: 'boolean' },
  ...WINDOW_ZOOM_OPTIONS,
  ...PRESENCE_OPTIONS,
  ...CONNECT_OPTIONS,
  ...APPEARANCE_OPTIONS,
  ...IM_OPTIONS,
  ...MESSAGING_OPTIONS,
  ...MODELS_USAGE_OPTIONS,
  ...CHANNEL_OPTIONS,
  ...HOST_ADMIN_OPTIONS,
  ...SHARE_DRAFT_OPTIONS,
  ...INBOX_OPTIONS,
  ...SCHEDULE_OPTIONS,
  ...TAKEOVER_OPTIONS,
  ...BROWSER_COMPUTER_OPTIONS,
  ...PROFILE_OPTIONS,
  ...TODO_OPTIONS,
  ...APPROVAL_TEMPLATE_OPTIONS,
  ...PROMPT_PRESET_OPTIONS,
  ...APPROVAL_REVIEWER_OPTIONS,
  ...VOICE_OPTIONS,
  ...CALL_OPTIONS,
  ...CALL_TIMELINE_OPTIONS,
  ...STORAGE_OPTIONS,
  ...SKILL_OPTIONS,
  host: { type: 'string' },
  'token-file': { type: 'string' },
  'image-source': { type: 'string' },
  'image-revision': { type: 'string' },
  'image-reference': { type: 'string' },
  timeout: { type: 'string' },
  'message-id': { type: 'string' },
  'reply-to': { type: 'string' },
  'failure-message-id': { type: 'string' },
  'auto-continue-for': { type: 'string' },
  recovery: { type: 'string' },
  outcome: { type: 'string' },
  'answer-stdin': { type: 'boolean' },
  'values-stdin': { type: 'boolean' },
  since: { type: 'string' },
  hours: { type: 'string' },
  offline: { type: 'boolean' },
  workspace: { type: 'string' },
  mode: { type: 'string' },
  scope: { type: 'string' },
  'acknowledge-risk': { type: 'boolean' },
  'patch-stdin': { type: 'boolean' },
  refresh: { type: 'boolean' },
  'previous-value': { type: 'string' },
  member: { type: 'string', multiple: true },
  attach: { type: 'string', multiple: true },
  app: { type: 'string' },
  bot: { type: 'string' },
  conversation: { type: 'string' },
  out: { type: 'string' },
  'route-id': { type: 'string' },
  'args-stdin': { type: 'boolean' },
  'cause-event': { type: 'string' },
  session: { type: 'string' },
  turns: { type: 'string' },
  offset: { type: 'string' },
  kind: { type: 'string' },
  checkpoint: { type: 'string' },
  'expected-current': { type: 'string' },
  'restore-id': { type: 'string' },
  'repair-id': { type: 'string' },
  'default-location': { type: 'boolean' },
  tag: { type: 'string' },
  target: { type: 'string' },
} as const;

export const BOT_CLI_OPTIONS = {
  administration: { type: 'boolean' },
  name: { type: 'string' },
  persona: { type: 'string' },
  'persona-stdin': { type: 'boolean' },
  'core-memory-stdin': { type: 'boolean' },
  description: { type: 'string' },
  role: { type: 'string', multiple: true },
  preset: { type: 'string' },
  'preset-revision': { type: 'string' },
  'operation-key': { type: 'string' },
  ...ZIP_UPLOAD_OPTIONS,
  'expected-profile': { type: 'string' },
  'erase-memory': { type: 'boolean' },
  'from-zip': { type: 'string' },
  'from-dir': { type: 'string' },
  'from-git': { type: 'string' },
  'expected-commit': { type: 'string' },
  'memory-location': { type: 'string' },
  home: { type: 'string' },
  'orchestrator-provider': { type: 'string' },
  'orchestrator-model': { type: 'string' },
  'orchestrator-effort': { type: 'string' },
  'assignment-provider': { type: 'string' },
  'assignment-model': { type: 'string' },
  'assignment-effort': { type: 'string' },
  nickname: { type: 'string' },
  clear: { type: 'boolean' },
  path: { type: 'string' },
  body: { type: 'string' },
  'body-stdin': { type: 'boolean' },
  'expected-head': { type: 'string' },
  'edit-id': { type: 'string' },
  limit: { type: 'string' },
  sha: { type: 'string' },
  before: { type: 'string' },
  cursor: { type: 'string' },
  state: { type: 'string' },
  'confirmation-stdin': { type: 'boolean' },
  grant: { type: 'string' },
  enabled: { type: 'boolean' },
  disabled: { type: 'boolean' },
  locked: { type: 'boolean' },
  unlocked: { type: 'boolean' },
  title: { type: 'string' },
  prompt: { type: 'string' },
  sid: { type: 'string' },
  every: { type: 'string' },
  daily: { type: 'string' },
  weekly: { type: 'string' },
  weekdays: { type: 'string' },
  'once-date': { type: 'string' },
  'once-time': { type: 'string' },
  cron: { type: 'string' },
  timezone: { type: 'string' },
  ...LIVE_OPTIONS,
  ...SSH_OPTIONS,
  compact: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
} as const;
