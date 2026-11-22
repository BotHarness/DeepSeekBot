import { WORKSPACE_CSS } from '../../workspace-styles.js';
import { INTERNAL_TOUR_CSS } from '../../internal-tour-styles.js';
import { COMPOSER_CONTEXT_CSS } from '../../composer-context-styles.js';
import { WINDOW_COMPANION_CSS } from '../../window-companion-styles.js';
import { COMBOBOX_CSS } from '../../combobox.js';
import { CHANNEL_DOCK_CSS } from '../../channel-dock-styles.js';
import { GENERATED_FILES_CSS } from '../../generated-files-styles.js';
import { CALL_CSS } from '../../call-styles.js';
import { VOICE_RIPPLE_CSS } from '../../voice-ripple-styles.js';
import { ACTIVITY_INBOX_CSS } from '../../activity-inbox-styles.js';
import { MOBILE_APPS_CSS } from '../../mobile-apps-styles.js';
import { STYLEX_CSS } from '../../ds/stylex-css.js';
import { SHELL_AND_ROSTER_CSS } from '../../shell-and-roster-styles.js';
import { CHANNEL_ROSTER_CSS } from '../channels/roster-styles.js';
import { MARKETPLACE_CATALOG_CSS } from '../marketplace/catalog-styles.js';
import { LOADING_CSS } from './loading-styles.js';
import { CONVERSATION_HEADER_CSS } from '../channels/conversation-header-styles.js';
import { AVATAR_EDITOR_CSS } from '../avatars/editor-styles.js';
import { MESSAGING_ADMINISTRATION_CSS } from '../messaging/administration-styles.js';
import { PROFILE_USAGE_CSS } from '../usage/profile-usage-styles.js';
import { MESSAGE_TIMELINE_CSS } from '../channels/message-timeline-styles.js';
import { CONVERSATION_COMPOSER_CSS } from '../channels/conversation-composer-styles.js';
import { CHANNEL_SIDEBAR_SETTINGS_CSS } from '../channels/sidebar-settings-styles.js';
import { CHANNEL_ACTION_CARD_CSS } from '../channels/action-card-styles.js';
import { CONVERSATION_MEMORY_CSS } from '../memory/conversation-memory-styles.js';
import { ACTIVITY_PANEL_CSS } from '../activity/activity-panel-styles.js';
import { RELEASE_NOTICE_CSS } from '../release/release-notice-styles.js';
import { CARD_LIST_CSS } from './card-list-styles.js';

export const CSS = [
  WORKSPACE_CSS,
  COMPOSER_CONTEXT_CSS,
  INTERNAL_TOUR_CSS,
  COMBOBOX_CSS,
  WINDOW_COMPANION_CSS,
  CHANNEL_DOCK_CSS,
  GENERATED_FILES_CSS,
  CALL_CSS,
  VOICE_RIPPLE_CSS,
  ACTIVITY_INBOX_CSS,
  MOBILE_APPS_CSS,
  SHELL_AND_ROSTER_CSS,
  CHANNEL_ROSTER_CSS,
  MARKETPLACE_CATALOG_CSS,
  LOADING_CSS,
  CONVERSATION_HEADER_CSS,
  AVATAR_EDITOR_CSS,
  MESSAGING_ADMINISTRATION_CSS,
  PROFILE_USAGE_CSS,
  MESSAGE_TIMELINE_CSS,
  CONVERSATION_COMPOSER_CSS,
  CHANNEL_SIDEBAR_SETTINGS_CSS,
  CHANNEL_ACTION_CARD_CSS,
  CONVERSATION_MEMORY_CSS,
  ACTIVITY_PANEL_CSS,
  RELEASE_NOTICE_CSS,
  CARD_LIST_CSS,
  STYLEX_CSS,
].join('');
