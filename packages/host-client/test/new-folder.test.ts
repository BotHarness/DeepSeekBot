import { describe, expect, it } from 'vitest';
import { MethodRefused } from '../src/client-errors';
import { canCreateFolders, newFolderNameProblem, newFolderRefusal } from '../src/new-folder';

describe('newFolderNameProblem', () => {
  it('accepts a single folder name', () => {
    expect(newFolderNameProblem('Reports 2026')).toBeUndefined();
    expect(newFolderNameProblem('  spaced  ')).toBeUndefined();
    expect(newFolderNameProblem('.config')).toBeUndefined();
  });

  it('asks for a name when it is blank', () => {
    expect(newFolderNameProblem('')).toBe('empty');
    expect(newFolderNameProblem('   ')).toBe('empty');
  });

  it('refuses path separators and traversal', () => {
    expect(newFolderNameProblem('a/b')).toBe('segment');
    expect(newFolderNameProblem('a\\b')).toBe('segment');
    expect(newFolderNameProblem('/abs')).toBe('segment');
    expect(newFolderNameProblem('..')).toBe('segment');
    expect(newFolderNameProblem('.')).toBe('segment');
    expect(newFolderNameProblem('a..b')).toBe('segment');
    expect(newFolderNameProblem('nul\0byte')).toBe('segment');
  });

  it('refuses names longer than the Host accepts', () => {
    expect(newFolderNameProblem('a'.repeat(255))).toBeUndefined();
    expect(newFolderNameProblem('a'.repeat(256))).toBe('too-long');
  });
});

describe('newFolderRefusal', () => {
  const refused = (code: string) => new MethodRefused(code, 'Host text');

  it('maps Host refusals to the inline messages the picker shows', () => {
    expect(newFolderRefusal(refused('folder-create/already-exists'))).toBe('exists');
    expect(newFolderRefusal(refused('folder-create/outside-grant'))).toBe('outside-grant');
    expect(newFolderRefusal(refused('folder-create/denied'))).toBe('denied');
    expect(newFolderRefusal(refused('permission-required'))).toBe('permission');
    expect(newFolderRefusal(refused('invalid-input'))).toBe('invalid');
  });

  it('reads the code from any transport error with a code', () => {
    expect(newFolderRefusal(Object.assign(new Error('x'), { code: 'folder-create/denied' }))).toBe(
      'denied',
    );
  });

  it('leaves other failures to the generic error text', () => {
    expect(newFolderRefusal(refused('folder-create/failed'))).toBeUndefined();
    expect(newFolderRefusal(new Error('offline'))).toBeUndefined();
    expect(newFolderRefusal('nope')).toBeUndefined();
  });
});

describe('canCreateFolders', () => {
  it('lets the Owner create folders', () => {
    expect(canCreateFolders({ owner: true, permissions: [] })).toBe(true);
  });

  it('lets a member create folders only with the Host Permission', () => {
    expect(canCreateFolders({ owner: false, permissions: ['workspaces.createFolder'] })).toBe(true);
    expect(canCreateFolders({ owner: false, permissions: ['workspaces.manageShared'] })).toBe(
      false,
    );
  });

  it('hides New folder until the viewer is known', () => {
    expect(canCreateFolders(undefined)).toBe(false);
  });
});
