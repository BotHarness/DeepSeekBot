import { expect, it } from 'vitest';
import {
  breakablePath,
  folderName,
  sessionMenuHeader,
  sessionPlace,
  sessionPlaceLabel,
} from '../src/ui/chat/session-place';

const hostIcon = { kind: 'symbol', id: 'laptop' } as const;

it('names the worktree folder from a POSIX or Windows path', () => {
  expect(folderName('/Users/me/.t3/worktrees/app/feat-5109-session-drawer')).toBe(
    'feat-5109-session-drawer',
  );
  expect(folderName('/Users/me/code/app/')).toBe('app');
  expect(folderName('C:\\Users\\me\\code\\app')).toBe('app');
  expect(folderName('/')).toBe('/');
});

it('keeps the full path for the menu and only the folder name for the header', () => {
  const place = sessionPlace({ hostIcon, hostName: 'Studio Mac', cwd: '/Users/me/code/app' });
  expect(place).toEqual({
    hostIcon,
    hostName: 'Studio Mac',
    folder: 'app',
    path: '/Users/me/code/app',
  });
  expect(sessionPlaceLabel('Launch plan', place)).toBe('Launch plan, Studio Mac, app');
  expect(sessionMenuHeader('Launch plan', place)).toBe(
    'Launch plan\nStudio Mac\n/\u200bUsers/\u200bme/\u200bcode/\u200bapp',
  );
});

it('shows only the Host when the Session has no folder', () => {
  const place = sessionPlace({ hostIcon, hostName: 'Studio Mac', cwd: undefined });
  expect(place).toEqual({ hostIcon, hostName: 'Studio Mac' });
  expect(sessionPlaceLabel('Launch plan', place)).toBe('Launch plan, Studio Mac');
  expect(sessionMenuHeader('Launch plan', place)).toBe('Launch plan\nStudio Mac');
  expect(sessionMenuHeader('Launch plan', undefined)).toBe('Launch plan');
});

it('lets a long folder path wrap at its separators instead of mid-word', () => {
  expect(breakablePath('/Users/me/botharness-feat-5214-compact-session-composer')).toBe(
    '/\u200bUsers/\u200bme/\u200bbotharness-\u200bfeat-\u200b5214-\u200bcompact-\u200bsession-\u200bcomposer',
  );
  expect(breakablePath('/srv/my_long_worktree_name')).toBe(
    '/\u200bsrv/\u200bmy_\u200blong_\u200bworktree_\u200bname',
  );
  expect(breakablePath('C:\\code\\app\\')).toBe('C:\\\u200bcode\\\u200bapp\\');
});
