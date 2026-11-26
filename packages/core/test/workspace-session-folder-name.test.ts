import { expect, it } from 'vitest';
import { folderName } from '../src/features/sessions/workspace-sessions.js';

it('names a Session folder by its last path part on POSIX and Windows', () => {
  expect(folderName('/work/site')).toBe('site');
  expect(folderName('/work/site/')).toBe('site');
  expect(folderName('C:\\Users\\qa\\site')).toBe('site');
  expect(folderName('/')).toBe('/');
});
