import { describe, expect, it, vi } from 'vitest';
import { createSectionFlow } from '../src/ui/chat/conversation-sections';

function setup() {
  const calls: [string, Record<string, unknown> | undefined][] = [];
  const request = vi.fn(
    async (method: string, args?: Record<string, unknown>): Promise<unknown> => {
      calls.push([method, args]);
      return method === 'sectionCreate' ? { section: { id: 's1', name: 'Work' } } : {};
    },
  );
  const client = {
    call: <T>(method: string, args?: Record<string, unknown>) =>
      request(method, args) as Promise<T>,
    refresh: vi.fn(async () => {}),
  };
  let current = true;
  const flow = createSectionFlow(client, 'dm-ada', () => current);
  return {
    flow,
    client,
    calls,
    request,
    changeHost: () => {
      current = false;
    },
  };
}

describe('Host-owned conversation sections', () => {
  it('assigns an existing Host section and refreshes the canonical roster', async () => {
    const { flow, calls, client } = setup();
    await flow.choose({ id: 'remote-section', name: 'Work' });
    expect(calls).toEqual([
      ['channelAssign', { channelId: 'dm-ada', sectionId: 'remote-section' }],
    ]);
    expect(client.refresh).toHaveBeenCalledOnce();
    expect(flow.getSnapshot()).toMatchObject({ complete: true, busy: false });
  });

  it('retains an unsectioned target across failure and retries null without creating a section', async () => {
    const { flow, request } = setup();
    request.mockRejectedValueOnce(Error('offline'));
    await flow.choose({ id: null, name: 'Unsectioned' });
    expect(flow.getSnapshot()).toMatchObject({ error: 'assign', selected: { id: null } });
    await flow.retry();
    expect(request.mock.calls).toEqual([
      ['channelAssign', { channelId: 'dm-ada', sectionId: null }],
      ['channelAssign', { channelId: 'dm-ada', sectionId: null }],
    ]);
    expect(flow.getSnapshot()).toMatchObject({ busy: false, complete: true, error: undefined });
  });
  it('refuses unsectioned writes after a Host change', async () => {
    const { flow, changeHost, calls } = setup();
    changeHost();
    await flow.choose({ id: null, name: 'Unsectioned' });
    expect(calls).toEqual([]);
    expect(flow.getSnapshot().error).toBe('changed');
  });
  it('trims a new name, creates on the Host, then assigns the returned ID', async () => {
    const { flow, calls } = setup();
    await flow.create('  Work  ');
    expect(calls).toEqual([
      ['sectionCreate', { name: 'Work' }],
      ['channelAssign', { channelId: 'dm-ada', sectionId: 's1' }],
    ]);
  });

  it('retains a created section after assignment fails and retries without creating again', async () => {
    const { flow, calls, request } = setup();
    request.mockResolvedValueOnce({ section: { id: 's1', name: 'Work' } });
    request.mockRejectedValueOnce(Error('offline'));
    await flow.create('Work');
    expect(flow.getSnapshot()).toMatchObject({
      error: 'assign',
      selected: { id: 's1', name: 'Work' },
      complete: false,
    });
    await flow.retry();
    expect(request.mock.calls.map(([method]) => method)).toEqual([
      'sectionCreate',
      'channelAssign',
      'channelAssign',
    ]);
    expect(calls.at(-1)).toEqual(['channelAssign', { channelId: 'dm-ada', sectionId: 's1' }]);
    expect(flow.getSnapshot().error).toBeUndefined();
  });

  it('distinguishes creation and refresh failures; a refresh retry does not repeat writes', async () => {
    const { flow, request, client } = setup();
    request.mockRejectedValueOnce(Error('refused'));
    await flow.create('Work');
    expect(flow.getSnapshot().error).toBe('create');
    expect(request).toHaveBeenCalledOnce();
    client.refresh.mockRejectedValueOnce(Error('offline'));
    await flow.choose({ id: 'existing', name: 'Work' });
    expect(flow.getSnapshot()).toMatchObject({ error: 'refresh', complete: true });
    await flow.retry();
    expect(request).toHaveBeenCalledTimes(2);
    expect(client.refresh).toHaveBeenCalledTimes(2);
  });

  it('refuses a stale owner before creation, assignment or refresh retry', async () => {
    const { flow, request, changeHost } = setup();
    changeHost();
    await flow.create('Work');
    await flow.choose({ id: 's1', name: 'Work' });
    await flow.retry();
    expect(request).not.toHaveBeenCalled();
    expect(flow.getSnapshot().error).toBe('changed');
  });

  it('stops after in-flight creation if the Host changes and guards rapid duplicate submission', async () => {
    const { flow, request, changeHost } = setup();
    let finish!: (value: unknown) => void;
    request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = flow.create('Work');
    await flow.create('Work');
    expect(flow.getSnapshot().busy).toBe(true);
    changeHost();
    finish({ section: { id: 's1', name: 'Work' } });
    await pending;
    expect(request).toHaveBeenCalledOnce();
    expect(flow.getSnapshot()).toMatchObject({
      error: 'changed',
      selected: { id: 's1' },
      busy: false,
    });
  });

  it('does not send an empty name', async () => {
    const { flow, request } = setup();
    await flow.create('  ');
    expect(request).not.toHaveBeenCalled();
  });
  it('retries assignment when a different selection fails after a prior refresh failure', async () => {
    const { flow, request, client } = setup();
    client.refresh.mockRejectedValueOnce(Error('offline'));
    await flow.choose({ id: 'old', name: 'Old' });
    request.mockRejectedValueOnce(Error('offline'));
    await flow.choose({ id: 'new', name: 'New' });
    expect(flow.getSnapshot()).toMatchObject({ complete: false, error: 'assign' });
    await flow.retry();
    expect(request).toHaveBeenLastCalledWith('channelAssign', {
      channelId: 'dm-ada',
      sectionId: 'new',
    });
    expect(request).toHaveBeenCalledTimes(3);
  });
});
