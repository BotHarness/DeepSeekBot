import { describe, expect, it } from 'vitest';

import { parseChannelMessage } from '../src/client/bridge.js';
import { memberPage } from '../src/client/member-page.js';
import { groupChannelMessages } from '../src/client/message-groups.js';
import { humanIdOf } from '../src/client/self-human.js';
import type { ChannelMessage } from '../src/client/store.js';

const at = '2026-11-14T00:00:00.000Z';

function human(id: string, humanId?: string): ChannelMessage {
  return parseChannelMessage({
    id,
    at,
    body: id,
    author: { kind: 'human', ...(humanId === undefined ? {} : { humanId, displayName: 'Bob' }) },
  })!;
}

describe('Human authors in Team mode', () => {
  it('keeps the speaking Human on parsed messages, defaulting to the Owner', () => {
    expect(human('a', 'human-bob').author).toEqual({
      kind: 'human',
      humanId: 'human-bob',
      displayName: 'Bob',
    });
    expect(humanIdOf(human('b').author)).toBe('local-human');
  });

  it('starts a new group when a different Human speaks', () => {
    const groups = groupChannelMessages([human('o1'), human('o2'), human('b1', 'human-bob')]);
    expect(groups.map((group) => group.messages.map((message) => message.id))).toEqual([
      ['o1', 'o2'],
      ['b1'],
    ]);
  });

  it('treats only a non-owner access baseline as a member page', () => {
    expect(memberPage({})).toBe(false);
    expect(memberPage({ __DSH_REMOTE_ACCESS__: { type: 'baseline', owner: true } })).toBe(false);
    expect(memberPage({ __DSH_REMOTE_ACCESS__: { type: 'baseline', grants: [] } })).toBe(true);
  });
});
