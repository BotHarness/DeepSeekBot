// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import { onCreationRequest, requestCreation } from '../src/client/create-request.js';

describe('create requests for the Bot sidebar', () => {
  it('delivers a request to the mounted sidebar once', () => {
    const listener = vi.fn();
    const dispose = onCreationRequest(listener);
    requestCreation('channel');
    expect(listener).toHaveBeenCalledExactlyOnceWith('channel');
    dispose();
    requestCreation('bot');
    expect(listener).toHaveBeenCalledOnce();
    const late = vi.fn();
    onCreationRequest(late)();
    expect(late).toHaveBeenCalledExactlyOnceWith('bot');
  });

  it('keeps a request made before the sidebar mounts, as a phone landing does', () => {
    requestCreation('bot');
    const listener = vi.fn();
    const dispose = onCreationRequest(listener);
    expect(listener).toHaveBeenCalledExactlyOnceWith('bot');
    const again = vi.fn();
    onCreationRequest(again)();
    expect(again).not.toHaveBeenCalled();
    dispose();
  });
});
