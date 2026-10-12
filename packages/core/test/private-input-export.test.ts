import { describe, expect, it } from 'vitest';
import { projectPrivateInputEvents } from '../../../scripts/export-private-input-evidence.mjs';

describe('public native Session evidence', () => {
  it('retains native RC1 approval outcomes without exporting unknown values or decision reasons', () => {
    const secret = 'PRIVATE-decision-reason';
    const outcomes = ['allowed-once', 'rejected', 'cancelled', 'unavailable', secret];
    const result = projectPrivateInputEvents(
      outcomes.map((outcome, seq) => ({
        seq,
        time: 1_791_691_200_000 + seq,
        type: 'approval/decided',
        data: { id: '76a6fe17-1111-2222-3333-444444444444', outcome, reason: secret },
      })),
    );
    expect(result.map((event) => event.outcome)).toEqual([
      ...outcomes.slice(0, 4),
      'decision-recorded',
    ]);
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it('exports the qualified MCP references and bounded outcome without additional protocol data', () => {
    const reference = 'private:76a6fe17-1111-2222-3333-444444444444:api_key';
    const result = projectPrivateInputEvents([
      {
        seq: 1,
        time: 1_791_691_200_000,
        type: 'tool/call',
        data: {
          callId: 'mcp_private',
          name: 'mcp__private_status__authenticated_status',
          arguments: { account: 'PRIVATE-account', api_key: reference },
        },
      },
      {
        seq: 2,
        time: 1_791_691_200_001,
        type: 'tool/result',
        data: {
          message: {
            toolCallId: 'mcp_private',
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  consumer: 'mcp-http-status-v1',
                  httpStatus: 200,
                  successful: true,
                  extra: 'PRIVATE-output',
                }),
              },
            ],
          },
        },
      },
    ]);
    expect(result[0]).toMatchObject({
      consumer: 'mcp-http-status-v1',
      references: { api_key: reference },
    });
    expect(result[1]).toMatchObject({
      value: { consumer: 'mcp-http-status-v1', successful: true, httpStatus: 200 },
    });
    expect(JSON.stringify(result)).not.toContain('PRIVATE-');
  });
  it('exports native truncation/Spill existence without publishing the file path or output', () => {
    const result = projectPrivateInputEvents([
      {
        seq: 1,
        time: 1_791_691_200_000,
        type: 'tool/call',
        data: { callId: 'call_spill', name: 'bash', arguments: '{}' },
      },
      {
        seq: 2,
        time: 1_791_691_200_001,
        type: 'tool/result',
        data: {
          message: {
            toolCallId: 'call_spill',
            content: [
              {
                type: 'text',
                text: 'PRIVATE OUTPUT [output truncated; full output: /private/output]\nFull formatted result stored at: /private/formatted. Use read',
              },
            ],
          },
        },
      },
    ]);
    expect(result[1]).toMatchObject({ value: { formattedSpill: true, subprocessSpill: true } });
    expect(JSON.stringify(result)).not.toContain('/private/');
    expect(JSON.stringify(result)).not.toContain('PRIVATE OUTPUT');
  });
  it('only exports linked reference/status facts, excluding arbitrary Session text and subprocess projections', () => {
    const secret = 'SYNTHETIC-should-never-be-exported';
    const ref = 'private:76a6fe17-1111-2222-3333-444444444444:api_key';
    const events = [
      {
        type: 'tool/call',
        data: {
          callId: 'call_a',
          name: 'ask_secret',
          arguments: JSON.stringify({
            account: secret,
            fields: [{ id: 'api_key', label: secret, required: true }],
          }),
        },
      },
      {
        type: 'tool/result',
        data: {
          message: {
            toolCallId: 'call_a',
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  status: 'configured',
                  account: secret,
                  references: { api_key: ref },
                  secret,
                }),
              },
            ],
          },
        },
      },
      { type: 'assistant/message', data: { message: secret } },
      { type: 'request/header', data: { header: { authorization: secret } } },
      {
        type: 'tool/call',
        data: { callId: 'call_b', name: 'bash', arguments: { command: secret, workdir: secret } },
      },
      {
        type: 'tool/result',
        data: {
          message: {
            toolCallId: 'call_b',
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  kind: 'foreground',
                  exitCode: 7,
                  stdout: { text: secret },
                  stderr: { text: secret },
                }),
              },
            ],
          },
        },
      },
    ].map((event, seq) => ({ ...event, seq, time: Date.parse('2026-10-11T10:00:00.000Z') }));
    const result = projectPrivateInputEvents(events);
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(result).toHaveLength(5);
    expect(result[1]).toMatchObject({
      value: { status: 'configured', references: { api_key: ref } },
    });
    expect(result[4]).toMatchObject({ value: { kind: 'foreground', exitCode: 7 } });
  });
});
