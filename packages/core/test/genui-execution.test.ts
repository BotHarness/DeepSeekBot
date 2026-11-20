import { describe, expect, it } from 'vitest';
import {
  GENUI_EXECUTION_LIMITS,
  GENUI_EXECUTION_PROTOCOL,
  parseGenuiExecutionEvent,
  parseGenuiExecutionReply,
} from '../src/channels/genui-execution.js';
import { syntheticGenuiDocument } from './fixtures/genui-document.js';
import { initialGenuiDocumentState } from '../src/channels/genui-document.js';

const owner = { instanceId: 'execution-test', generation: 2, lastSequence: 0 };
const header = {
  protocol: 'botharness-genui-execution-v1',
  instanceId: owner.instanceId,
  generation: owner.generation,
  sequence: 1,
};
const state = initialGenuiDocumentState(syntheticGenuiDocument);
const snapshot = {
  ...header,
  type: 'snapshot',
  commandSequence: 0,
  html: '<html><body><input data-genui-node="1"></body></html>',
  state,
  controls: [{ id: '1', value: '', checked: false }],
  wasmBytes: 16 * 1024 * 1024,
};

describe('GenUI independently supervised execution contract', () => {
  it('freezes independent guest, payload, DOM and execution budgets', () => {
    expect(GENUI_EXECUTION_PROTOCOL).toBe(header.protocol);
    expect(Object.isFrozen(GENUI_EXECUTION_LIMITS)).toBe(true);
    expect(GENUI_EXECUTION_LIMITS.wasmBytes).toBe(64 * 1024 * 1024);
    expect(GENUI_EXECUTION_LIMITS.executionMs).toBeLessThanOrEqual(200);
    expect(GENUI_EXECUTION_LIMITS.nodes).toBe(2000);
    expect(GENUI_EXECUTION_LIMITS.domDepth).toBe(64);
    expect(GENUI_EXECUTION_LIMITS.activeWorkers).toBe(1);
    expect(GENUI_EXECUTION_LIMITS.activeDocuments).toBe(4);
  });

  it('accepts a snapshot only with canonical document-valid private state', () => {
    expect(parseGenuiExecutionReply(snapshot, owner, syntheticGenuiDocument)).toEqual(snapshot);
    for (const values of [
      { ...state.values, selected: 'unknown' },
      { ...state.values, injected: true },
    ]) {
      expect(
        parseGenuiExecutionReply(
          { ...snapshot, state: { version: 1, values } },
          owner,
          syntheticGenuiDocument,
        ),
      ).toBeUndefined();
    }
  });

  it('rejects a different mount, generation, missing sequence, replay and gaps', () => {
    for (const change of [
      { protocol: 'another' },
      { instanceId: 'previous' },
      { generation: 1 },
      { sequence: 0 },
      { sequence: 2 },
      { sequence: NaN },
      { sequence: undefined },
    ])
      expect(
        parseGenuiExecutionReply({ ...snapshot, ...change }, owner, syntheticGenuiDocument),
      ).toBeUndefined();
    expect(
      parseGenuiExecutionReply(snapshot, { ...owner, lastSequence: 1 }, syntheticGenuiDocument),
    ).toBeUndefined();
    expect(
      parseGenuiExecutionReply(
        { ...snapshot, sequence: 2 },
        { ...owner, lastSequence: 1 },
        syntheticGenuiDocument,
      )?.sequence,
    ).toBe(2);
  });

  it('bounds UTF-8 HTML and complete reply bytes rather than string characters', () => {
    const unicodeHtml = '界'.repeat(Math.floor(GENUI_EXECUTION_LIMITS.htmlBytes / 3) + 1);
    expect(unicodeHtml.length).toBeLessThan(GENUI_EXECUTION_LIMITS.htmlBytes);
    expect(
      parseGenuiExecutionReply({ ...snapshot, html: unicodeHtml }, owner, syntheticGenuiDocument),
    ).toBeUndefined();
    expect(
      parseGenuiExecutionReply(
        { ...snapshot, padding: 'x'.repeat(GENUI_EXECUTION_LIMITS.replyBytes) },
        owner,
        syntheticGenuiDocument,
      ),
    ).toBeUndefined();
    expect(
      parseGenuiExecutionReply(
        { ...snapshot, wasmBytes: GENUI_EXECUTION_LIMITS.wasmBytes + 1 },
        owner,
        syntheticGenuiDocument,
      ),
    ).toBeUndefined();
  });

  it('rejects duplicate, unknown-shaped or oversized control snapshots', () => {
    for (const controls of [
      [{ id: '0', value: '' }],
      [
        { id: '1', value: '' },
        { id: '1', value: '' },
      ],
      [{ id: '1', value: 'x'.repeat(501) }],
      [{ id: '1', checked: 'yes' }],
      [{ id: '1', value: '', run: 'do-business-action' }],
      Array.from({ length: GENUI_EXECUTION_LIMITS.controls + 1 }, (_, index) => ({
        id: String(index + 1),
        value: '',
      })),
    ])
      expect(
        parseGenuiExecutionReply({ ...snapshot, controls }, owner, syntheticGenuiDocument),
      ).toBeUndefined();
  });

  it('limits lifecycle replies to stable codes and bounded diagnostic text', () => {
    const heartbeat = { ...header, type: 'heartbeat', wasmBytes: 16 * 1024 * 1024 };
    expect(parseGenuiExecutionReply(heartbeat, owner, syntheticGenuiDocument)).toEqual(heartbeat);
    const error = {
      ...header,
      type: 'error',
      reason: 'execution',
      detail: 'interrupted',
      wasmBytes: 0,
    };
    expect(parseGenuiExecutionReply(error, owner, syntheticGenuiDocument)).toEqual(error);
    for (const change of [
      { reason: 'callTool' },
      { detail: '界'.repeat(200) },
      { secret: 'not-a-contract-field' },
    ]) {
      expect(
        parseGenuiExecutionReply({ ...error, ...change }, owner, syntheticGenuiDocument),
      ).toBeUndefined();
    }
    expect(
      parseGenuiExecutionReply(
        { ...heartbeat, type: 'runTool', tool: 'anything' },
        owner,
        syntheticGenuiDocument,
      ),
    ).toBeUndefined();
  });

  it('accepts only bounded local DOM input rather than arbitrary callbacks', () => {
    const event = { ...header, type: 'event', event: 'input', targetId: '1', value: 'Beta' };
    expect(parseGenuiExecutionEvent(event, owner)).toEqual(event);
    for (const change of [
      { targetId: '<script>' },
      { event: 'submit' },
      { event: 'runTool' },
      { value: 'x'.repeat(501) },
      { checked: 'yes' },
      { callback: 'publish-message' },
      { generation: 1 },
      { sequence: 2 },
    ])
      expect(parseGenuiExecutionEvent({ ...event, ...change }, owner)).toBeUndefined();
  });

  it('refuses malformed input without escaping the parsing boundary', () => {
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    for (const value of [undefined, null, [], 1, circular]) {
      expect(parseGenuiExecutionReply(value, owner, syntheticGenuiDocument)).toBeUndefined();
      expect(parseGenuiExecutionEvent(value, owner)).toBeUndefined();
    }
    const throwing = new Proxy(
      {},
      {
        get: () => {
          throw new Error('unreadable');
        },
      },
    );
    expect(parseGenuiExecutionReply(throwing, owner, syntheticGenuiDocument)).toBeUndefined();
    expect(parseGenuiExecutionEvent(throwing, owner)).toBeUndefined();
  });
});
