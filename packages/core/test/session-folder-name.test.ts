import { expect, it } from 'vitest';
import { sessionFolderName } from '../src/features/sessions/session-folder-name.js';

it('names a Session folder by its last path part on POSIX and Windows', () => {
  expect(sessionFolderName('/work/site')).toBe('site');
  expect(sessionFolderName('/work/site/')).toBe('site');
  expect(sessionFolderName('C:\\Users\\qa\\site')).toBe('site');
  expect(sessionFolderName('/')).toBe('/');
});
