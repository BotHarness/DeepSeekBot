import { expect, it } from 'vitest';
import {
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
    'Launch plan\nStudio Mac\n/Users/me/code/app',
  );
});

it('shows only the Host when the Session has no folder', () => {
  const place = sessionPlace({ hostIcon, hostName: 'Studio Mac', cwd: undefined });
  expect(place).toEqual({ hostIcon, hostName: 'Studio Mac' });
  expect(sessionPlaceLabel('Launch plan', place)).toBe('Launch plan, Studio Mac');
  expect(sessionMenuHeader('Launch plan', place)).toBe('Launch plan\nStudio Mac');
  expect(sessionMenuHeader('Launch plan', undefined)).toBe('Launch plan');
});
