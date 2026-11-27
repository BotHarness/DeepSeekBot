import type { PersonaBotRegistry } from '../../bots/registry.js';
import type { BotCreationService } from '../../bots/creation.js';
import type { BotImportsService } from '../../bots/imports.js';
import type { PersonaBotDeletions } from '../../bots/deletion.js';
import type { ChannelStore } from '../../channels/store.js';
import type { BotOnboarding } from '../../onboarding/service.js';
import type { RosterStore } from '../../roster/store.js';
import type { BotRuntime } from '../../runtime/bot-runtime-types.js';
import type { BotStateTracker } from '../../state/bot-state.js';
import type { TeamService } from '../../team/service.js';
import type { TobService } from '../../tob/service.js';
import type { TelemetryCapture } from '../../telemetry/service.js';
import type { BotModeSettings } from '../../appearance/bot-mode-settings.js';
import type { ModelsBridgeDeps } from '../models/deps.js';

export interface RosterBridgeDeps {
  channels: ChannelStore;
  registry: PersonaBotRegistry;
  roster: RosterStore;
  team?: TeamService;
}

export interface OnboardingBridgeDeps extends Pick<
  ModelsBridgeDeps,
  'modelCatalog' | 'modelPresets' | 'routingGroups'
> {
  registry: PersonaBotRegistry;
  onboarding?: BotOnboarding;
  onboardingNews?(slug?: string): Promise<boolean>;
  telemetry?: { capture?: TelemetryCapture };
  tob?: TobService;
}

export interface PersonaBotsBridgeDeps extends RosterBridgeDeps, OnboardingBridgeDeps {
  botModes?: { settings: Pick<BotModeSettings, 'allowedModes' | 'readError'> };
  browserAccess?: { changed(slug: string): void };
  computerAccess?: { changed(slug: string): void };
  creations?: BotCreationService;
  deletions?: PersonaBotDeletions;
  imports?: BotImportsService;
  runtime?: Pick<BotRuntime, 'latestAssignmentActivity' | 'resumePendingDigests'>;
  states: BotStateTracker;
  warn?(message: string): void;
}
