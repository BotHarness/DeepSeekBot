import type { RosterView } from './client-contract';

export function createHostSnapshotSharing() {
  const shared = new Map<string, { json: string; value: unknown }>();
  const share = <T>(key: string, value: T): T => {
    const json = JSON.stringify(value);
    const previous = shared.get(key);
    if (previous?.json === json) return previous.value as T;
    shared.set(key, { json, value });
    return value;
  };
  const sameList = <T>(next: readonly T[], previous: readonly T[] | undefined): boolean =>
    previous !== undefined &&
    next.length === previous.length &&
    next.every((item, index) => item === previous[index]);
  const shareRoster = (next: RosterView, previous: RosterView | undefined): RosterView => {
    const bots = next.bots.map((bot) => share(`bot:${bot.slug}`, bot));
    const channels = next.channels.map((channel) => share(`channel:${channel.id}`, channel));
    const people = next.people?.map((person) => share(`person:${person.id}`, person));
    const roster: RosterView = {
      ...next,
      bots: sameList(bots, previous?.bots) ? previous!.bots : bots,
      channels: sameList(channels, previous?.channels) ? previous!.channels : channels,
      ...(people === undefined
        ? {}
        : {
            people: sameList(people, previous?.people) ? previous!.people! : people,
          }),
      ...(next.activityChannels === undefined
        ? {}
        : {
            activityChannels: sameList(next.activityChannels, previous?.activityChannels)
              ? previous!.activityChannels!
              : next.activityChannels,
          }),
    };
    return previous !== undefined &&
      (Object.keys(roster) as (keyof RosterView)[]).every((key) => roster[key] === previous[key]) &&
      Object.keys(previous).length === Object.keys(roster).length
      ? previous
      : roster;
  };

  return { share, shareRoster };
}
