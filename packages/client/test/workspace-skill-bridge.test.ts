import { describe, expect, it } from 'vitest';
import { loadChannelSkillCatalog, parseChannelMessage } from '../src/client/bridge.js';

const workspace = { kind: 'workspace', workspaceId: 'grant-ws', name: 'shop' } as const;

describe('Workspace Skill owners at the bridge boundary', () => {
  it('keeps Workspace entries in the conversation Skill catalog', async () => {
    const call = async () => ({
      ok: true,
      value: {
        skills: [
          { name: 'deploy-shop', description: 'Deploy', owner: workspace, path: '/w/SKILL.md' },
          { name: 'broken', description: 'x', owner: { kind: 'workspace', name: 'no id' } },
        ],
      },
    });
    expect(await loadChannelSkillCatalog(call as never, 'group-1')).toEqual([
      { name: 'deploy-shop', description: 'Deploy', owner: workspace, path: '/w/SKILL.md' },
    ]);
  });

  it('keeps a Workspace Skill Invocation on a sent message', () => {
    const message = parseChannelMessage({
      id: 'm1',
      at: '2026-11-16T00:00:00.000Z',
      author: { kind: 'human' },
      body: '/deploy-shop now',
      skillInvocations: [
        { name: 'deploy-shop', owner: workspace, start: 0, end: 12, content: 'Deploy it' },
      ],
    });
    expect(message?.skillInvocations).toEqual([
      { name: 'deploy-shop', owner: workspace, start: 0, end: 12, content: 'Deploy it' },
    ]);
  });
});
