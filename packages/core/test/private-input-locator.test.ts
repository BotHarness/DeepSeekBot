import { expect, it } from 'vitest';
import {
  fullClientHash,
  fullClientLocator,
  privateInputLocator,
  privateInputWebUrl,
} from '../src/credentials/web-locator.js';

it('locates an existing private card without authority or native login credentials', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const url = new URL(privateInputWebUrl('http://127.0.0.1:31393', 'dm-ada', id));
  expect(url.search).toBe('');
  expect(privateInputLocator(url.hash)).toEqual({ channelId: 'dm-ada', messageId: id });
  expect(privateInputLocator('#botharness-private-input=%')).toBeUndefined();
  expect(fullClientLocator(fullClientHash({ kind: 'channel', channelId: 'team-42' }))).toEqual({
    kind: 'channel',
    channelId: 'team-42',
  });
  expect(fullClientLocator('#botharness-open=channel:..%2Fadmin')).toBeUndefined();
  expect(fullClientLocator('#botharness-open=channel:')).toBeUndefined();
  expect(
    privateInputLocator(
      '#botharness-private-input=' + encodeURIComponent(JSON.stringify(['group-qa', id])),
    ),
  ).toBeUndefined();
});

it.each([
  'http://user:secret@localhost/',
  'http://localhost/?token=secret',
  'http://localhost/#token',
  'file:///private',
  'https://localhost/secret',
])('refuses unsafe Web origin %s', (url) => {
  expect(() => privateInputWebUrl(url, 'dm-ada', '11111111-1111-4111-8111-111111111111')).toThrow(
    /credential-free/,
  );
});

it('round-trips the full-client landing targets the phone app opens', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  expect(fullClientLocator(fullClientHash({ kind: 'home' }))).toEqual({ kind: 'home' });
  expect(fullClientLocator(fullClientHash({ kind: 'dm', slug: 'ada-lovelace' }))).toEqual({
    kind: 'dm',
    slug: 'ada-lovelace',
  });
  expect(
    privateInputLocator(
      fullClientHash({ kind: 'private-input', channelId: 'dm-ada', messageId: id }),
    ),
  ).toEqual({ channelId: 'dm-ada', messageId: id });
  expect(fullClientLocator('#botharness-open=dm:..%2Fadmin')).toBeUndefined();
  expect(fullClientLocator('#botharness-open=dm:%')).toBeUndefined();
  expect(fullClientLocator('#botharness-open=settings')).toBeUndefined();
});

it('round-trips the create targets behind the phone app compose button', () => {
  expect(fullClientLocator(fullClientHash({ kind: 'new-bot' }))).toEqual({ kind: 'new-bot' });
  expect(fullClientLocator(fullClientHash({ kind: 'new-channel' }))).toEqual({
    kind: 'new-channel',
  });
  expect(fullClientLocator('#botharness-open=new:section')).toBeUndefined();
});
