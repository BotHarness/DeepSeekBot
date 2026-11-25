import { describe, expect, it, vi } from 'vitest';
import { createHostFolder } from '../src/bot-settings';
import { HostAnswerInvalid } from '../src/host-answer';

describe('createHostFolder', () => {
  const input = { parent: '/projects', name: 'New folder' };
  const workspace = { id: 'workspace-1', path: '/projects/New folder', title: 'New folder' };

  it('returns the selected Workspace from the same call that creates it', async () => {
    const host = { call: vi.fn().mockResolvedValue(workspace) };
    await expect(createHostFolder(host, input)).resolves.toEqual(workspace);
    expect(host.call).toHaveBeenCalledExactlyOnceWith('folderCreate', input);
  });

  it('refuses a malformed Workspace response', async () => {
    const host = { call: vi.fn().mockResolvedValue({ path: workspace.path }) };
    await expect(createHostFolder(host, input)).rejects.toBeInstanceOf(HostAnswerInvalid);
  });
});
