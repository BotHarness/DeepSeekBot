import type { PersonaBotActivityState } from './avatar.js';

export interface StoppableBot {
  slug: string;
  name: string;
}

export function stoppableBots(
  members: readonly {
    slug: string;
    name: string;
    paused: boolean;
    state: PersonaBotActivityState;
  }[],
): StoppableBot[] {
  return members
    .filter(
      (member) => (member.state === 'working' || member.state === 'thinking') && !member.paused,
    )
    .map((member) => ({ slug: member.slug, name: member.name }));
}
