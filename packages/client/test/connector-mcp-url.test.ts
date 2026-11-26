import { describe, expect, it } from 'vitest';

import { composioKeyProblem, pastedMcpUrl } from '../src/client/features/connectors/mcp-url.js';

describe('pasted MCP server addresses', () => {
  it('accepts an https address and nothing else', () => {
    expect(pastedMcpUrl(' https://mcp.posthog.com/mcp ')?.href).toBe('https://mcp.posthog.com/mcp');
    expect(pastedMcpUrl('posthog')).toBeUndefined();
    expect(pastedMcpUrl('http://mcp.posthog.com/mcp')).toBeUndefined();
    expect(pastedMcpUrl('https://user:pw@mcp.posthog.com/mcp')).toBeUndefined();
    expect(pastedMcpUrl('https://')).toBeUndefined();
  });
});

describe('Composio key prefixes', () => {
  it('flags the Connect MCP key and the personal user key', () => {
    expect(composioKeyProblem('ck_abc')).toBe('connectors.composio.consumerKey');
    expect(composioKeyProblem(' UAK_abc')).toBe('connectors.composio.userKey');
    expect(composioKeyProblem('ak_abc')).toBeUndefined();
  });
});
