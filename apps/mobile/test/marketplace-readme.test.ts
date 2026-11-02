import { expect, it } from 'vitest';
import { marketplaceReadmeLink } from '../src/marketplace/readme-links';

const source = { repositoryUrl: 'https://github.com/example/writer', commit: 'a'.repeat(40) };

it('resolves README links inside the displayed repository revision', () => {
  expect(marketplaceReadmeLink('docs/setup.md#install', source)).toBe(
    `https://github.com/example/writer/blob/${'a'.repeat(40)}/docs/setup.md#install`,
  );
  expect(marketplaceReadmeLink('/docs/setup.md', source)).toBe(
    `https://github.com/example/writer/blob/${'a'.repeat(40)}/docs/setup.md`,
  );
  expect(marketplaceReadmeLink('#usage', source)).toBe(
    `https://github.com/example/writer/tree/${'a'.repeat(40)}#usage`,
  );
});

it('opens ordinary web destinations and refuses application, file and script schemes', () => {
  expect(marketplaceReadmeLink('https://example.org/guide', source)).toBe(
    'https://example.org/guide',
  );
  expect(marketplaceReadmeLink('http://example.org/guide', source)).toBe(
    'http://example.org/guide',
  );
  expect(marketplaceReadmeLink('//example.org/guide', source)).toBe('https://example.org/guide');
  for (const value of [
    'javascript:alert(1)',
    'data:text/html,hello',
    'file:///private/file',
    'intent://launch',
    'deepseekbot://pair',
    ' java\nscript:alert(1)',
    '',
  ])
    expect(marketplaceReadmeLink(value, source)).toBeUndefined();
});

it('does not invent a relative destination when the displayed revision or repository is unavailable', () => {
  expect(marketplaceReadmeLink('docs/setup.md', { ...source, commit: null })).toBeUndefined();
  expect(
    marketplaceReadmeLink('docs/setup.md', { ...source, repositoryUrl: 'javascript:alert(1)' }),
  ).toBeUndefined();
});
