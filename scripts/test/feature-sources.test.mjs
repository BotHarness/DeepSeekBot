import { describe, expect, it } from 'vitest';
import { byPaths, byTerms, unclaimed } from '../feature-impact.mjs';
import { checkSources, listItems, parseFeature, parseGlossary } from '../feature-sources.mjs';

const glossary = parseGlossary(
  [
    '**Call screen**:',
    'The phone screen of a Bot call.',
    '_Avoid_: call page, 通话页 (on mobile)',
    '',
    '**Team mode / 团队模式**:',
    'Members sign in.',
    '',
    '**DM**:',
    'A direct message.',
  ].join('\n'),
);

const feature = (file, sources, terms, title = file) => ({
  file,
  title,
  sources,
  terms,
});

describe('feature sources and terms', () => {
  it('reads a feature, its index row and its lists', () => {
    const text = [
      '# Bot calls',
      '## Sources',
      '',
      '- `packages/core/src/voice/call*.ts`',
      '- `apps/mobile/src/ui/chat/call-*`',
      '',
      '## Terms',
      '- Call screen',
      '## Sub-features',
      '- not a term',
    ].join('\n');
    const index = '| Bot calls | yes | `scripts/e2e-call.mjs` | [Bot calls](bot-call.md) |';
    expect(parseFeature('bot-call.md', text, index)).toEqual({
      file: 'bot-call.md',
      title: 'Bot calls',
      model: 'yes',
      journey: '`scripts/e2e-call.mjs`',
      sources: ['packages/core/src/voice/call*.ts', 'apps/mobile/src/ui/chat/call-*'],
      terms: ['Call screen'],
    });
    expect(listItems('# None', 'Sources')).toBeUndefined();
  });

  it('accepts a glossary heading or either half of a bilingual one', () => {
    expect([...glossary.names.keys()]).toEqual([
      'Call screen',
      'Team mode / 团队模式',
      'Team mode',
      '团队模式',
      'DM',
    ]);
    expect(glossary.avoided.get('通话页')).toBe('Call screen');
  });

  it('fails a dead glob, an unknown term, an unmapped feature and a stale baseline entry', () => {
    const errors = checkSources(
      [
        feature(
          'call.md',
          ['packages/voice/call*.ts', 'packages/gone/**'],
          ['Call screen', 'Phone page'],
        ),
        feature('new.md', undefined, undefined),
        feature('old.md', undefined, undefined),
        feature('done.md', ['packages/voice/call.ts'], ['DM']),
      ],
      ['packages/voice/call.ts'],
      glossary,
      { unmapped: ['old.md', 'done.md', 'removed.md'] },
    );
    expect(errors).toEqual([
      'call.md: source packages/gone/** matches no tracked file',
      'call.md: term "Phone page" is not a GLOSSARY.md entry',
      expect.stringContaining('new.md: add a "## Sources" list'),
      expect.stringContaining('done.md is mapped now; remove it from'),
      expect.stringContaining('lists removed.md, which is not a feature'),
    ]);
  });

  it('maps changed paths to the features that claim them, including the feature file itself', () => {
    const features = [
      feature('call.md', ['packages/voice/call*.ts'], ['Call screen']),
      feature('team.md', ['packages/team/**'], ['Team mode']),
    ];
    const paths = [
      'packages/voice/calls.ts',
      '.agents/skills/verify-deepseekbot/features/team.md',
      'packages/other/x.ts',
      'README.md',
    ];
    expect(byPaths(features, paths).map(({ feature, matched }) => [feature.file, matched])).toEqual(
      [
        ['call.md', ['packages/voice/calls.ts']],
        ['team.md', ['.agents/skills/verify-deepseekbot/features/team.md']],
      ],
    );
    expect(unclaimed(features, paths)).toEqual(['packages/other/x.ts']);
  });

  it('ranks features for a bug report by rare glossary terms, avoided words and title words', () => {
    const features = [
      feature('call.md', ['a'], ['Call screen', 'DM'], 'Bot calls on the phone'),
      feature('team.md', ['b'], ['Team mode', 'DM'], 'Team members sign in'),
      feature('other.md', ['c'], ['DM'], 'Wallpaper'),
    ];
    const ranked = (text) => byTerms(features, glossary, text).map(({ feature }) => feature.file);
    expect(ranked('团队模式下成员无法登录')).toEqual(['team.md']);
    expect(ranked('the 通话页 freezes in a DM')).toEqual(['call.md', 'team.md', 'other.md']);
    expect(ranked('members cannot sign in')).toEqual(['team.md']);
    expect(ranked('nothing related')).toEqual([]);
  });
});
