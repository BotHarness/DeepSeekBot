import { answerRecord, HostAnswerInvalid, record, some, type HostCall } from './host-answer';

export interface TeamPerson {
  humanId: string;
  displayName: string;
}

export interface HumanDmTarget {
  channelId: string;
  name: string;
}

function teamPerson(value: unknown): TeamPerson | undefined {
  const row = record(value);
  const humanId = row?.['humanId'];
  const displayName = row?.['displayName'];
  return typeof humanId === 'string' && humanId.length > 0 && typeof displayName === 'string'
    ? { humanId, displayName }
    : undefined;
}

export async function readTeamDirectory(host: HostCall): Promise<TeamPerson[]> {
  const value = await host.call('teamDirectory', {});
  const rows = Array.isArray(value) ? value : record(value)?.['items'];
  if (!Array.isArray(rows)) throw new HostAnswerInvalid('teamDirectory returned no people.');
  return some(rows, teamPerson);
}

export async function openHumanDm(
  host: HostCall,
  person: { humanId: string; displayName?: string },
): Promise<HumanDmTarget> {
  const answer = answerRecord(await host.call('humanDm', { humanId: person.humanId }), 'humanDm');
  const channelId = record(answer['channel'])?.['id'] ?? answer['channelId'];
  if (typeof channelId !== 'string' || channelId.length === 0)
    throw new HostAnswerInvalid('humanDm returned no Channel.');
  const name = record(answer['channel'])?.['name'];
  return {
    channelId,
    name: typeof name === 'string' && name.length > 0 ? name : (person.displayName ?? ''),
  };
}

export function filterTeamPeople(people: readonly TeamPerson[], query: string): TeamPerson[] {
  const needle = query.trim().toLocaleLowerCase();
  return needle.length === 0
    ? [...people]
    : people.filter((person) => person.displayName.toLocaleLowerCase().includes(needle));
}
