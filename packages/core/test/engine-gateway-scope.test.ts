import { describe, expect, it } from 'vitest';

import { gatewayScopeRefusal } from '../src/engines/engine-gateway.js';

describe('engine gateway scope', () => {
  it('accepts a Workspace Grant selector for a tool call', () => {
    expect(
      gatewayScopeRefusal({ arguments: { grant_id: 'grant-1' } }, 'channel-1'),
    ).toBeUndefined();
    expect(gatewayScopeRefusal({ grant_id: 'grant-1' }, 'channel-1')).toBeUndefined();
  });

  it('still refuses another routing destination', () => {
    expect(gatewayScopeRefusal({ arguments: { conversation_id: 'other' } }, 'channel-1')).toBe(
      'destination-out-of-scope',
    );
    expect(gatewayScopeRefusal({ channel_id: 'other' }, 'channel-1')).toBe('channel-out-of-scope');
  });
});
