import { describe, expect, it, vi } from 'vitest';
import { decideConnectorRequestCall, loadBotConnectors, setBotConnector } from '../src/connectors';
import { approvalContent } from '../src/requests';
import { connectorRequestView } from '../src/shared/connector-request';

const view = {
  configured: true,
  accounts: [
    { accountId: 'shared', service: 'gmail', name: 'Gmail', label: 'Work', status: 'active' },
    {
      accountId: 'own',
      service: 'notion',
      name: 'Notion',
      label: 'Notes',
      identity: 'ada@example.com',
      holderSlug: 'ada',
      status: 'active',
    },
    { accountId: 'other', service: 'slack', name: 'Slack', label: 'Grace', holderSlug: 'grace' },
  ],
};

function host(granted: unknown) {
  return {
    call: vi.fn(async (method: string) =>
      method === 'connectors'
        ? view
        : method === 'connectorRequestDecide'
          ? { accepted: true }
          : granted,
    ),
  };
}

describe('per-Bot Connector Account switches', () => {
  it('lists shared and own accounts with persistent and one-time access, hiding other Bots’ own', async () => {
    const client = host({
      connectors: [{ accountId: 'own', access: 'write' }],
      once: [{ accountId: 'shared', access: 'read' }],
    });
    expect(await loadBotConnectors(client, 'ada')).toEqual([
      {
        accountId: 'shared',
        service: 'gmail',
        name: 'Gmail',
        label: 'Work',
        active: true,
        own: false,
        once: 'read',
      },
      {
        accountId: 'own',
        service: 'notion',
        name: 'Notion',
        label: 'Notes',
        identity: 'ada@example.com',
        active: true,
        own: true,
        access: 'write',
      },
    ]);
    expect(client.call).toHaveBeenCalledWith('botConnectors', { slug: 'ada' });
  });

  it('revokes through connectorGrantSet and reads the result', async () => {
    const client = host({ connectors: [], once: [] });
    const accounts = await setBotConnector(client, 'ada', 'shared', null);
    expect(client.call).toHaveBeenCalledWith('connectorGrantSet', {
      slug: 'ada',
      accountId: 'shared',
      access: null,
    });
    expect(
      accounts.every((account) => account.access === undefined && account.once === undefined),
    ).toBe(true);
  });

  it('sends the card choice and refuses an unaccepted answer', async () => {
    const client = host(undefined);
    await expect(decideConnectorRequestCall(client, 'dm-ada', 'm1', 'once')).resolves.toEqual({
      accepted: true,
    });
    expect(client.call).toHaveBeenCalledWith('connectorRequestDecide', {
      channelId: 'dm-ada',
      messageId: 'm1',
      choice: 'once',
    });
    await expect(
      decideConnectorRequestCall({ call: async () => ({}) }, 'dm-ada', 'm1', 'deny'),
    ).rejects.toThrow('not accepted');
  });

  it('keeps the connector preview on the approval content and falls back to the tool input', () => {
    const connectorRequest = {
      service: 'gmail',
      name: 'Gmail',
      access: 'read',
      reason: 'Find the invoice',
      account: { accountId: 'shared', label: 'Work', holder: 'shared' },
    };
    const content = approvalContent({
      toolName: 'connector_request',
      role: 'orchestrator',
      cwd: '/qa',
      input: '{}',
      connectorRequest: { ...connectorRequest, extra: true },
    });
    expect(content?.connectorRequest).toEqual(connectorRequest);
    expect(
      connectorRequestView({
        toolName: 'connector_request',
        input: '{"service":"notion","access":"write","reason":"Draft"}',
      }),
    ).toEqual({ service: 'notion', name: 'notion', access: 'write', reason: 'Draft' });
    expect(connectorRequestView({ toolName: 'bash', input: '{}' })).toBeUndefined();
  });
});
