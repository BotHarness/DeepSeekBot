import type { RosterBot } from '../../host/client';
import type { ColorRole } from '../design/theme';

export function botStateTone(bot: RosterBot): ColorRole {
  if (bot.paused) return 'muted';
  if (bot.state === 'thinking' || bot.state === 'working') return 'accent';
  if (bot.state === 'waiting') return 'warning';
  if (bot.state === 'blocked') return 'danger';
  return 'muted';
}

export function botBusy(bot: RosterBot): boolean {
  return !bot.paused && (bot.state === 'thinking' || bot.state === 'working');
}

export function botDotTone(bot: RosterBot): ColorRole {
  if (!bot.paused && bot.state === 'idle') return 'success';
  return botStateTone(bot);
}
