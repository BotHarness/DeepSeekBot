import { MARKETPLACE_INSTALL_SOURCES } from '../marketplace/client.js';

export const CONNECTOR_TYPES = ['feishu', 'lark', 'slack', 'discord', 'weixin', 'other'] as const;

export const TELEMETRY_CATEGORIES = [
  'app',
  'onboarding',
  'bot_library',
  'bot_profile',
  'chat',
  'search',
  'tob',
  'layout',
  'connect',
  'remote_host',
  'pairing',
  'connection',
  'activity',
  'viewer',
  'model',
  'storage',
  'plugin',
  'im',
  'share',
  'notification',
  'marketplace',
  'install',
  'community',
  'navigation',
  'demo',
  'docs',
  'mobile_beta',
  'avatar_editor',
  'campaign',
] as const;

export const TELEMETRY_VERBS = [
  'view',
  'open',
  'close',
  'enter',
  'click',
  'select',
  'copy',
  'submit',
  'send',
  'create',
  'update',
  'delete',
  'archive',
  'restore',
  'install',
  'enable',
  'disable',
  'start',
  'pause',
  'resume',
  'restart',
  'skip',
  'complete',
  'cancel',
  'fail',
  'dismiss',
  'play',
  'download',
  'import',
  'export',
  'save',
  'wear',
  'use',
  'report',
  'snooze',
] as const;

export const TELEMETRY_SURFACES = [
  'desktop_app',
  'browser',
  'mobile_remote',
  'cli',
  'bot_tool',
  'im',
] as const;
export type TelemetrySurface = (typeof TELEMETRY_SURFACES)[number];

export type TelemetryPropertySpec = readonly string[] | 'boolean' | 'count';

export interface TelemetryEventSpec {
  origin: 'host' | 'client';
  description: string;
  properties: Readonly<Record<string, TelemetryPropertySpec>>;
}

const INTRO_STEPS = ['welcome', 'theme', 'model', 'community', 'start'] as const;
const INTRO_PERSONAS = ['engineer', 'creator', 'operator', 'learner'] as const;
const INTRO_FEATURES = ['bot', 'group', 'schedule', 'browser', 'memory', 'im'] as const;
const SURFACE = { surface: TELEMETRY_SURFACES } as const;
const LAYOUT_MODES = ['simple', 'advanced'] as const;

export const TELEMETRY_EVENTS = {
  'app:host_start': {
    origin: 'host',
    description: 'The Host process started with telemetry enabled.',
    properties: {},
  },
  'app:usage_report': {
    origin: 'host',
    description:
      'At most once per 24 hours: Bot count and Sessions and messages since the last report.',
    properties: {
      persona_bot_count: 'count',
      session_count: 'count',
      message_count: 'count',
      window_hours: 'count',
    },
  },
  'app:active_day_start': {
    origin: 'host',
    description:
      'First Human activity of the Host-local calendar day: entering Bot mode, a Human message or an IM message. Basis of DAU, WAU and MAU.',
    properties: {
      trigger: ['bot_mode_enter', 'message', 'im_message'],
      surface: TELEMETRY_SURFACES,
    },
  },
  'app:bot_mode_enter': {
    origin: 'client',
    description: 'The Web Client entered Bot mode, with the layout mode it opened in.',
    properties: { layout: LAYOUT_MODES, ...SURFACE },
  },
  'search:switcher_open': {
    origin: 'client',
    description: 'The quick switcher (search Channels, messages and settings) opened.',
    properties: SURFACE,
  },
  'search:result_open': {
    origin: 'client',
    description: 'A quick switcher result was opened.',
    properties: { kind: ['channel', 'message', 'setting'], ...SURFACE },
  },
  'layout:mode_select': {
    origin: 'client',
    description: 'The Human chose Simple or Advanced layout mode in settings.',
    properties: { mode: LAYOUT_MODES, ...SURFACE },
  },
  'viewer:subpanel_open': {
    origin: 'client',
    description: "A PersonaBot's Browser or Computer viewer opened.",
    properties: { panel: ['browser', 'computer'], ...SURFACE },
  },
  'activity:inbox_open': {
    origin: 'client',
    description: 'Activity Center (the Human Inbox) opened.',
    properties: SURFACE,
  },
  'activity:approval_submit': {
    origin: 'client',
    description: 'The Human answered a tool approval.',
    properties: { decision: ['allow_once', 'allow_always', 'reject'], ...SURFACE },
  },
  'activity:question_submit': {
    origin: 'client',
    description: "The Human answered a Bot's question card.",
    properties: SURFACE,
  },
  'activity:grant_request_submit': {
    origin: 'client',
    description: 'The Human granted a requested Workspace folder.',
    properties: SURFACE,
  },
  'activity:inbox_reply_send': {
    origin: 'client',
    description: 'The Human replied to a message from Activity Center.',
    properties: { target: ['message', 'assignment'], ...SURFACE },
  },
  'activity:inbox_item_dismiss': {
    origin: 'client',
    description: 'The Human dismissed an Activity Center item.',
    properties: SURFACE,
  },
  'activity:inbox_item_snooze': {
    origin: 'client',
    description: 'The Human snoozed an Activity Center item.',
    properties: SURFACE,
  },
  'model:plan_update': {
    origin: 'client',
    description: "A PersonaBot's model plan changed.",
    properties: { via: ['preset', 'custom', 'assignments', 'plan', 'inherit'], ...SURFACE },
  },
  'remote_host:host_pair_complete': {
    origin: 'client',
    description: 'The Web Client finished pairing with a Remote Host.',
    properties: { outcome: ['success', 'refused', 'failed'], ...SURFACE },
  },
  'remote_host:conversation_open': {
    origin: 'client',
    description: 'A conversation on a Remote Host opened in the Web Client.',
    properties: SURFACE,
  },
  'connect:sign_in_start': {
    origin: 'host',
    description: 'Connect account sign-in started.',
    properties: {},
  },
  'connect:sign_in_complete': {
    origin: 'host',
    description: 'Connect account sign-in finished.',
    properties: { outcome: ['success', 'denied', 'expired'] },
  },
  'tob:delegation_send': {
    origin: 'host',
    description: 'Tob sent a message to a colleague PersonaBot (Tob Delegation).',
    properties: { surface: TELEMETRY_SURFACES },
  },
  'bot_library:bot_create': {
    origin: 'host',
    description: 'A PersonaBot was created (blank, Git, Zip or Marketplace).',
    properties: {},
  },
  'bot_library:bot_archive': {
    origin: 'host',
    description: 'A PersonaBot was paused (archived).',
    properties: {},
  },
  'bot_library:bot_delete': {
    origin: 'host',
    description: 'A PersonaBot deletion started.',
    properties: {},
  },
  'bot_profile:avatar_update': {
    origin: 'host',
    description: "A PersonaBot's avatar changed.",
    properties: {},
  },
  'bot_profile:banner_update': {
    origin: 'host',
    description: "A PersonaBot's banner changed.",
    properties: {},
  },
  'im:connector_enable': {
    origin: 'host',
    description: 'An IM connector was enabled for the first time.',
    properties: { type: CONNECTOR_TYPES },
  },
  'onboarding:tutorial_start': {
    origin: 'host',
    description: 'The getting-started tutorial started.',
    properties: {},
  },
  'onboarding:tutorial_pause': {
    origin: 'host',
    description: 'The tutorial was paused.',
    properties: {},
  },
  'onboarding:tutorial_skip': {
    origin: 'host',
    description: 'The tutorial was skipped.',
    properties: {},
  },
  'onboarding:tutorial_resume': {
    origin: 'host',
    description: 'A paused tutorial continued.',
    properties: {},
  },
  'onboarding:tutorial_restart': {
    origin: 'host',
    description: 'The tutorial restarted from the beginning.',
    properties: {},
  },
  'onboarding:tutorial_complete': {
    origin: 'host',
    description: 'The tutorial finished.',
    properties: {},
  },
  'onboarding:intro_view': {
    origin: 'client',
    description: 'The first-entry intro opened.',
    properties: SURFACE,
  },
  'onboarding:intro_step_view': {
    origin: 'client',
    description: 'An intro step became visible.',
    properties: { step: INTRO_STEPS, ...SURFACE },
  },
  'onboarding:intro_dismiss': {
    origin: 'client',
    description: 'The intro closed before its last step.',
    properties: { step: INTRO_STEPS, via: ['skip', 'close'], ...SURFACE },
  },
  'onboarding:intro_complete': {
    origin: 'client',
    description: 'The intro finished with a chosen starter.',
    properties: {
      starter: ['botPrompt', 'firstRequest', 'exampleRequest', 'own', 'persona', 'interview'],
      persona: INTRO_PERSONAS,
      feature: INTRO_FEATURES,
      ...SURFACE,
    },
  },
  'onboarding:persona_select': {
    origin: 'client',
    description: 'A starting persona was picked on the last intro step.',
    properties: { persona: INTRO_PERSONAS, ...SURFACE },
  },
  'onboarding:theme_update': {
    origin: 'client',
    description: 'A theme setting changed in the intro.',
    properties: { setting: ['scheme', 'preset', 'layout', 'wallpaper'], ...SURFACE },
  },
  'onboarding:model_save': {
    origin: 'client',
    description: 'The intro saved a model choice.',
    properties: { is_advanced: 'boolean', ...SURFACE },
  },
  'onboarding:community_link_click': {
    origin: 'client',
    description: 'A community link was opened from the intro.',
    properties: { target: ['github', 'discord', 'qq'], ...SURFACE },
  },
  'marketplace:bot_install': {
    origin: 'host',
    description: 'A Marketplace Bot was installed.',
    properties: { entry: MARKETPLACE_INSTALL_SOURCES },
  },
  'marketplace:section_view': {
    origin: 'client',
    description: 'The Hot, New and Rising rows were shown.',
    properties: SURFACE,
  },
  'marketplace:bot_open': {
    origin: 'client',
    description: 'A Marketplace Bot was opened from a list, row or Digest.',
    properties: { entry: MARKETPLACE_INSTALL_SOURCES, step: ['detail', 'install'], ...SURFACE },
  },
  'marketplace:digest_view': {
    origin: 'client',
    description: 'The daily Digest hero card was shown.',
    properties: SURFACE,
  },
  'marketplace:digest_open': {
    origin: 'client',
    description: 'A Digest article was opened.',
    properties: { entry: ['hero', 'archive'], ...SURFACE },
  },
  'marketplace:digest_archive_open': {
    origin: 'client',
    description: 'The past Digests list was opened.',
    properties: SURFACE,
  },
} as const satisfies Record<string, TelemetryEventSpec>;

export type TelemetryEventName = keyof typeof TELEMETRY_EVENTS;
export type ClientTelemetryEventName = {
  [K in TelemetryEventName]: (typeof TELEMETRY_EVENTS)[K]['origin'] extends 'client' ? K : never;
}[TelemetryEventName];

export const RESERVED_TELEMETRY_EVENTS = ['$exception', 'chat:message_feedback_submit'] as const;

export function isTelemetryEventName(value: unknown): value is TelemetryEventName {
  return typeof value === 'string' && Object.hasOwn(TELEMETRY_EVENTS, value);
}

export function isClientTelemetryEventName(value: unknown): value is ClientTelemetryEventName {
  return isTelemetryEventName(value) && TELEMETRY_EVENTS[value].origin === 'client';
}

export function telemetryEventProperties(
  event: TelemetryEventName,
  properties: Readonly<Record<string, unknown>> = {},
): Record<string, string | number | boolean> | undefined {
  const spec: Readonly<Record<string, TelemetryPropertySpec>> = TELEMETRY_EVENTS[event].properties;
  const out: Record<string, string | number | boolean> = {};
  for (const [key, allowed] of Object.entries(spec)) {
    const value = properties[key];
    if (value === undefined) continue;
    if (allowed === 'boolean') {
      if (typeof value !== 'boolean') return undefined;
    } else if (allowed === 'count') {
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return undefined;
    } else if (typeof value !== 'string' || !allowed.includes(value)) return undefined;
    out[key] = value;
  }
  return out;
}

export function telemetryNameIsWellFormed(name: string): boolean {
  const match = /^([a-z][a-z_]*):([a-z][a-z_]*)$/u.exec(name);
  if (match === null) return false;
  const [, category, rest] = match;
  return (
    (TELEMETRY_CATEGORIES as readonly string[]).includes(category!) &&
    TELEMETRY_VERBS.some((verb) => rest === verb || rest!.endsWith(`_${verb}`))
  );
}
