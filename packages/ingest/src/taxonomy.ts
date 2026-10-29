export const LEGACY_EVENT_NAMES: Readonly<Record<string, string>> = {
  plugin_started: 'app:host_start',
  daily_usage: 'app:usage_report',
  bot_created: 'bot_library:bot_create',
  bot_archived: 'bot_library:bot_archive',
  bot_deleted: 'bot_library:bot_delete',
  avatar_edited: 'bot_profile:avatar_update',
  banner_edited: 'bot_profile:banner_update',
  connector_enabled: 'im:connector_enable',
  marketplace_bot_installed: 'marketplace:bot_install',
  message_feedback: 'chat:message_feedback_submit',
  intro_shown: 'onboarding:intro_view',
  intro_step_viewed: 'onboarding:intro_step_view',
  intro_dismissed: 'onboarding:intro_dismiss',
  intro_completed: 'onboarding:intro_complete',
  intro_theme_changed: 'onboarding:theme_update',
  intro_model_saved: 'onboarding:model_save',
  intro_community_clicked: 'onboarding:community_link_click',
  marketplace_sections_shown: 'marketplace:section_view',
  marketplace_bot_opened: 'marketplace:bot_open',
  marketplace_digest_shown: 'marketplace:digest_view',
  marketplace_digest_opened: 'marketplace:digest_open',
  marketplace_digest_archive_opened: 'marketplace:digest_archive_open',
  mobile_app_opened: 'app:app_open',
  mobile_pairing_started: 'pairing:attempt_start',
  mobile_pairing_result: 'pairing:attempt_complete',
  mobile_connection_result: 'connection:attempt_complete',
  mobile_activation_step: 'onboarding:activation_step_complete',
  mobile_bot_operation_started: 'bot_library:create_attempt_start',
  mobile_bot_operation_result: 'bot_library:create_attempt_complete',
  install_tab_switched: 'install:tab_select',
  install_command_copied: 'install:command_copy',
  install_cta_clicked: 'install:cta_click',
  setup_prompt_copied: 'install:setup_prompt_copy',
  dsh_download_clicked: 'install:dsh_download_click',
  mobile_beta_menu_opened: 'mobile_beta:menu_open',
  mobile_install_clicked: 'mobile_beta:install_link_click',
  github_clicked: 'community:github_link_click',
  discord_clicked: 'community:discord_link_click',
  qq_group_copied: 'community:qq_group_copy',
  docs_clicked: 'navigation:docs_link_click',
  changelog_clicked: 'navigation:changelog_link_click',
  market_clicked: 'navigation:market_link_click',
  avatar_clicked: 'navigation:avatar_link_click',
  language_switched: 'navigation:language_select',
  feature_demo_used: 'demo:feature_demo_use',
  hero_demo_used: 'demo:hero_demo_use',
  video_played: 'demo:video_play',
  demo_channel_opened: 'demo:channel_open',
  demo_approval_answered: 'demo:approval_submit',
  demo_message_sent: 'demo:message_send',
  market_bot_opened: 'marketplace:bot_open',
  market_install_clicked: 'marketplace:install_button_click',
  docs_search_opened: 'docs:search_open',
  docs_search_queried: 'docs:search_submit',
  docs_search_result_opened: 'docs:search_result_open',
  avatar_tab_selected: 'avatar_editor:tab_select',
  avatar_preset_selected: 'avatar_editor:preset_select',
  avatar_species_selected: 'avatar_editor:species_select',
  avatar_headpiece_selected: 'avatar_editor:headpiece_select',
  avatar_restored: 'avatar_editor:avatar_restore',
  avatar_downloaded: 'avatar_editor:avatar_download',
  avatar_part_draw_started: 'avatar_editor:part_draw_start',
  avatar_part_draw_cancelled: 'avatar_editor:part_draw_cancel',
  avatar_part_saved: 'avatar_editor:part_save',
  avatar_part_worn: 'avatar_editor:part_wear',
  avatar_part_deleted: 'avatar_editor:part_delete',
  avatar_part_exported: 'avatar_editor:part_export',
  avatar_part_imported: 'avatar_editor:part_import',
  avatar_part_import_failed: 'avatar_editor:part_import_fail',
  link_clicked: 'campaign:short_link_click',
};

const TUTORIAL_ACTIONS: Readonly<Record<string, string>> = {
  start: 'onboarding:tutorial_start',
  pause: 'onboarding:tutorial_pause',
  skip: 'onboarding:tutorial_skip',
  continue: 'onboarding:tutorial_resume',
  restart: 'onboarding:tutorial_restart',
  finish: 'onboarding:tutorial_complete',
};

const RENAMED_PROPERTIES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'app:usage_report': {
    persona_bots: 'persona_bot_count',
    sessions: 'session_count',
    messages: 'message_count',
  },
  'onboarding:model_save': { advanced: 'is_advanced' },
  'marketplace:bot_install': { from: 'entry' },
  'marketplace:bot_open': { from: 'entry' },
  'marketplace:digest_open': { from: 'entry' },
};

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function normalizeEvent(event: Json): Json {
  const name = event['event'];
  if (typeof name !== 'string') return event;
  const properties = isRecord(event['properties']) ? { ...event['properties'] } : undefined;
  let next = LEGACY_EVENT_NAMES[name];
  if (name === 'tutorial_action' && properties !== undefined) {
    next = TUTORIAL_ACTIONS[String(properties['action'])];
    if (next !== undefined) delete properties['action'];
  }
  if (next === undefined && properties?.['source'] !== 'plugin') return event;
  const renamed = next ?? name;
  if (properties !== undefined) {
    if (properties['source'] === 'plugin') properties['source'] = 'host';
    if ('plugin_version' in properties && !('app_version' in properties)) {
      properties['app_version'] = properties['plugin_version'];
      delete properties['plugin_version'];
    }
    for (const [from, to] of Object.entries(RENAMED_PROPERTIES[renamed] ?? {}))
      if (from in properties && !(to in properties)) {
        properties[to] = properties[from];
        delete properties[from];
      }
  }
  return { ...event, event: renamed, ...(properties === undefined ? {} : { properties }) };
}

export function normalizeCaptureBody(text: string): string | undefined {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return undefined;
  }
  const all = (events: unknown[]) =>
    events.map((entry) => (isRecord(entry) ? normalizeEvent(entry) : entry));
  if (Array.isArray(body)) return JSON.stringify(all(body));
  if (!isRecord(body)) return undefined;
  if (Array.isArray(body['batch'])) return JSON.stringify({ ...body, batch: all(body['batch']) });
  if (typeof body['event'] === 'string') return JSON.stringify(normalizeEvent(body));
  return undefined;
}
