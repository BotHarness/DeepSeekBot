import { expect, it } from 'vitest';

import { connectInput } from '@botharness/host-client/connect-input';

it('routes an invitation link to member sign-in', () => {
  expect(connectInput(' deepseekbot://team?i=abc_123 ')).toEqual({
    kind: 'invitation',
    path: '/pair/team?i=abc_123',
  });
});

it('keeps pairing links and unknown text on the pairing path', () => {
  expect(connectInput('deepseekbot://pair?p=abc')).toEqual({
    kind: 'pairing',
    text: 'deepseekbot://pair?p=abc',
  });
  expect(connectInput('deepseekbot-dev://pair?p=abc').kind).toBe('pairing');
  expect(connectInput('not a link').kind).toBe('pairing');
  expect(connectInput('studio').kind).toBe('pairing');
});

it('treats a Host origin, with or without a scheme, as an address', () => {
  for (const input of [
    'studio.example',
    'https://studio.example',
    'https://studio.example/',
    'http://studio.example',
    'studio.tailnet.ts.net:8443',
    'localhost:3000',
  ])
    expect(connectInput(input)).toEqual({
      kind: 'address',
      address: input.replace(/\/$/u, ''),
    });
});

it('does not treat a URL with a path or query as a Host address', () => {
  expect(connectInput('https://studio.example/pair?p=abc').kind).toBe('pairing');
  expect(connectInput('https://user@studio.example').kind).toBe('pairing');
});
