export type Loading = '' | 'signing-in';
export type Problem = '' | 'interrupted' | 'missing' | 'unavailable';

type Presence = {
  name: string;
  available: boolean;
  paused: boolean;
  sync: string;
  activity: string;
};

const ACTIVITIES: Record<string, string> = {
  idle: 'Relaxing',
  thinking: 'Thinking',
  working: 'Working',
  waiting: 'Waiting for you',
  blocked: 'Needs a hand',
};

const SYNC: Record<string, string> = {
  connecting: 'Connecting…',
  stale: 'Reconnecting…',
};

export function presence({ available, paused, sync, activity }: Presence) {
  if (!available) return 'Offline';
  if (paused) return 'Taking a break';
  if (sync !== 'live') return SYNC[sync] ?? 'Reconnecting…';
  return ACTIVITIES[activity] ?? activity;
}

export function loadingText(loading: Loading, name: string) {
  return loading === 'signing-in' ? `${name} is signing in` : '';
}

export function problemText(problem: Problem, name: string) {
  if (problem === 'interrupted') return { text: 'The view was interrupted.', action: 'Reload' };
  if (problem === 'missing')
    return {
      text: `${name} couldn't show up just now. Messages and activity still work.`,
      action: 'Try again',
    };
  if (problem === 'unavailable')
    return {
      text: `3D isn't available here, but ${name}'s messages and activity still work.`,
      action: 'Try again',
    };
  return undefined;
}

export function softwareText(name: string) {
  return `This computer has no graphics acceleration, so ${name} stays still here to keep the app fast. Messages and activity still work.`;
}
