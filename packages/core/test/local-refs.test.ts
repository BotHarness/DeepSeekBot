import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  fileLocalRefStore,
  LocalRefs,
  localRefsEnabled,
  withLocalRefs,
  type LocalRefSnapshot,
  type LocalRefStore,
} from '../src/runtime/local-refs.js';

const EVENT = '3cf91c78-b539-413f-9277-77fec4a1ae8b';
const EVENT_2 = '123807c8-f30c-4044-ab6d-9e3e7ddb9c89';
const DM = 'dm-bot-75a5a9e4cbef452dbbeebae09cfbb428';
const GROUP = 'group-cd3e2491-5d9f-40a7-88de-168c92f5397f';
const MESSAGE = 'human-1ed8e430-5b08-4d5d-8a0e-2d622f690790';
const ASSIGNMENT = 'botharness-948d5623-a60d-4284-979e-86db48b53f34';
const BOT = 'bot-75a5a9e4cbef452dbbeebae09cfbb428';

function memoryStore(): LocalRefStore & { saved: Map<string, LocalRefSnapshot> } {
  const saved = new Map<string, LocalRefSnapshot>();
  return { saved, load: (slug) => saved.get(slug), save: (slug, snap) => saved.set(slug, snap) };
}

describe('LocalRefs', () => {
  it('gives each id kind its own short alias and keeps it stable', () => {
    const refs = new LocalRefs(memoryStore());
    const text = `[Human DM]\nSource Event ID: ${EVENT}\nChannel: ${DM}\nMessage ID: ${MESSAGE}\nhi`;
    expect(refs.encode('ada', text)).toBe(
      '[Human DM]\nSource Event ID: e1\nChannel: dm1\nMessage ID: m1\nhi',
    );
    expect(refs.encode('ada', `${GROUP} ${ASSIGNMENT} ${EVENT_2} ${EVENT}`)).toBe('g1 a1 e2 e1');
  });

  it('keeps Bot slugs, paths and file names raw', () => {
    const refs = new LocalRefs(memoryStore());
    const text = `${BOT} /bots/${BOT}/memory /spill/${EVENT}.txt ${EVENT}/x`;
    expect(refs.encode('ada', text)).toBe(text);
  });

  it('scopes maps per Bot', () => {
    const refs = new LocalRefs(memoryStore());
    expect(refs.encode('ada', EVENT)).toBe('e1');
    expect(refs.encode('bob', EVENT_2)).toBe('e1');
    expect(refs.resolve('bob', 'e1')).toBe(EVENT_2);
  });

  it('never renumbers: a reloaded map continues after its highest alias', () => {
    const store = memoryStore();
    new LocalRefs(store).encode('ada', `${EVENT} ${EVENT_2}`);
    const reloaded = new LocalRefs(store);
    expect(reloaded.resolve('ada', 'e2')).toBe(EVENT_2);
    expect(reloaded.encode('ada', 'f0a1c2d3-0000-4000-8000-000000000000')).toBe('e3');
  });

  it('resolves whole-alias arguments and expands aliases only in forwarded text', () => {
    const refs = new LocalRefs(memoryStore());
    refs.encode('ada', `${EVENT} ${DM}`);
    const args = refs.decodeArgs(
      'ada',
      { ids: ['e1', 'e9'], channel_id: 'dm1', body: 'see e1', instructions: 'answer e1 in dm1' },
      new Set(['instructions']),
    );
    expect(args).toEqual({
      ids: [EVENT, 'e9'],
      channel_id: DM,
      body: 'see e1',
      instructions: `answer ${EVENT} in ${DM}`,
    });
  });

  it('wraps a tool: real ids reach execute, aliases reach the model', async () => {
    const refs = new LocalRefs(memoryStore());
    refs.encode('ada', EVENT);
    let seen: unknown;
    const tool = withLocalRefs(
      {
        name: 'inbox_resolve',
        description: '',
        parameters: { type: 'object', properties: {} },
        output: { schema: {}, render: () => [] },
        execute: async (args: unknown) => {
          seen = args;
          return null;
        },
      } as never,
      refs,
      'ada',
    );
    await tool.execute({ ids: ['e1'] }, {} as never);
    expect(seen).toEqual({ ids: [EVENT] });
    const content = tool.finalizeContent!({} as never, {
      isError: false,
      value: null,
      content: [{ type: 'text', text: `resolved ${EVENT} and ${EVENT_2}` }],
    });
    expect(content).toEqual([{ type: 'text', text: 'resolved e1 and e2' }]);
  });
});

describe('fileLocalRefStore', () => {
  it('persists the map and refuses a corrupt file instead of restarting numbering', () => {
    const dir = mkdtempSync(join(tmpdir(), 'local-refs-'));
    const store = fileLocalRefStore((slug) => join(dir, slug, 'local-refs.json'));
    new LocalRefs(store).encode('ada', EVENT);
    expect(JSON.parse(readFileSync(join(dir, 'ada', 'local-refs.json'), 'utf8'))).toEqual({
      version: 1,
      refs: { e1: EVENT },
    });
    expect(new LocalRefs(store).resolve('ada', 'e1')).toBe(EVENT);
    writeFileSync(join(dir, 'ada', 'local-refs.json'), '{');
    expect(() => new LocalRefs(store).encode('ada', EVENT_2)).toThrow();
  });
});

describe('localRefsEnabled', () => {
  it('is off unless BOTHARNESS_SHORT_REFS=1', () => {
    expect(localRefsEnabled({})).toBe(false);
    expect(localRefsEnabled({ BOTHARNESS_SHORT_REFS: '1' })).toBe(true);
  });
});
