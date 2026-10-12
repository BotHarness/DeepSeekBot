import { expect, it } from 'vitest';
import { privateInputLocator, privateInputWebUrl } from '../src/credentials/web-locator.js';

it('locates an existing private card without authority or native login credentials', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const url = new URL(privateInputWebUrl('http://127.0.0.1:31393', 'dm-ada', id));
  expect(url.search).toBe('');
  expect(privateInputLocator(url.hash)).toEqual({ channelId: 'dm-ada', messageId: id });
  expect(privateInputLocator('#botharness-private-input=%')).toBeUndefined();
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
