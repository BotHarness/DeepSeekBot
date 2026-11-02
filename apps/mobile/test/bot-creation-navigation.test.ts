import { describe, expect, it, vi } from 'vitest';
import { openBotCreationResult } from '../src/host/bot-creation-navigation';
import type { CreationSnapshot } from '../src/host/bot-creation';
import { createCreationVisibility } from '../src/host/bot-creation-visibility';

function setup() {
  const state: CreationSnapshot = {
    loaded: true,
    busy: false,
    record: {
      kind: 'submitted',
      mutationStarted: true,
      operation: {
        hostId: 'B',
        deviceId: 'phone-b',
        operationKey: 'operation-123',
        input: { displayName: 'Bot', persona: '', description: '', roles: [] },
      },
    },
    receipt: {
      status: 'created',
      operationKey: 'operation-123',
      botSlug: 'original-bot',
      channelId: 'original-dm',
    },
  };
  const port = {
    recover: vi.fn(async () => {}),
    snapshot: () => state,
    deviceId: vi.fn(() => 'phone-b'),
    switchHost: vi.fn(async (_id: string) => true),
    open: vi.fn(async (_host: string, _slug: string) => {}),
    acknowledge: vi.fn(async (_key: string) => {}),
  };
  return { state, port };
}

describe('opening native creation results', () => {
  it('revokes automatic opening on background even when the route remains focused', async () => {
    const visibility = createCreationVisibility(true);
    visibility.focus();
    visibility.arm();
    const { port } = setup();
    const lease = visibility.lease();
    port.recover.mockImplementationOnce(async () => {
      visibility.appState(false);
    });
    expect(await openBotCreationResult(port, lease)).toBe(false);
    expect(port.switchHost).not.toHaveBeenCalled();
    expect(port.open).not.toHaveBeenCalled();
    visibility.appState(true);
    expect(visibility.takeAutoOpen()).toBe(false);
    expect(lease()).toBe(false);
    expect(await openBotCreationResult(port, visibility.lease())).toBe(true);
  });

  it('cannot navigate when backgrounding occurs during a Host switch', async () => {
    const visibility = createCreationVisibility(true);
    visibility.focus();
    const { port } = setup();
    port.switchHost.mockImplementationOnce(async () => {
      visibility.appState(false);
      return true;
    });
    expect(await openBotCreationResult(port, visibility.lease())).toBe(false);
    expect(port.open).not.toHaveBeenCalled();
    expect(port.acknowledge).not.toHaveBeenCalled();
  });

  it('arms auto-open only for an active focused progress view and invalidates earlier visits', () => {
    const visibility = createCreationVisibility(false);
    visibility.focus();
    visibility.arm();
    visibility.appState(true);
    expect(visibility.takeAutoOpen()).toBe(false);
    visibility.arm();
    const oldVisit = visibility.lease();
    visibility.blur();
    visibility.focus();
    expect(visibility.takeAutoOpen()).toBe(false);
    expect(oldVisit()).toBe(false);
    visibility.arm();
    expect(visibility.takeAutoOpen()).toBe(true);
    expect(visibility.takeAutoOpen()).toBe(false);
  });
  it('opens the confirmed original Bot on B then acknowledges only that operation', async () => {
    const { port } = setup();
    expect(await openBotCreationResult(port, () => true)).toBe(true);
    expect(port.switchHost).toHaveBeenCalledWith('B');
    expect(port.open).toHaveBeenCalledWith('B', 'original-bot');
    expect(port.acknowledge).toHaveBeenCalledWith('operation-123');
    expect(port.acknowledge.mock.invocationCallOrder[0]).toBeGreaterThan(
      port.open.mock.invocationCallOrder[0]!,
    );
  });

  it('does not switch environments or navigate when the Human leaves before recovery finishes', async () => {
    const { port } = setup();
    let focused = true;
    port.recover.mockImplementationOnce(async () => {
      focused = false;
    });
    expect(await openBotCreationResult(port, () => focused)).toBe(false);
    expect(port.switchHost).not.toHaveBeenCalled();
    expect(port.open).not.toHaveBeenCalled();
    expect(port.acknowledge).not.toHaveBeenCalled();
  });

  it('does not take over navigation when the Human leaves during a Host switch', async () => {
    const { port } = setup();
    let focused = true;
    port.switchHost.mockImplementationOnce(async () => {
      focused = false;
      return true;
    });
    expect(await openBotCreationResult(port, () => focused)).toBe(false);
    expect(port.open).not.toHaveBeenCalled();
    expect(port.acknowledge).not.toHaveBeenCalled();
  });

  it('keeps pending and refused results rather than opening an unverified Bot', async () => {
    const { state, port } = setup();
    state.error = 'creation-identity-unavailable';
    expect(await openBotCreationResult(port, () => true)).toBe(false);
    state.error = undefined;
    state.receipt = undefined;
    expect(await openBotCreationResult(port, () => true)).toBe(false);
    expect(port.switchHost).not.toHaveBeenCalled();
    expect(port.acknowledge).not.toHaveBeenCalled();
  });

  it('rejects result navigation after pairing replacement', async () => {
    const { port } = setup();
    port.deviceId.mockReturnValue('other-phone');
    expect(await openBotCreationResult(port, () => true)).toBe(false);
    expect(port.switchHost).not.toHaveBeenCalled();
  });
});
