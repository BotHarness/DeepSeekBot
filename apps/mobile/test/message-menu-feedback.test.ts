import { describe, expect, it, vi } from 'vitest';
import { messageMenuActions, runAction } from '../src/ui/chat/message-sheet';
import type { ConversationMessage } from '../src/host/conversation';

const message: ConversationMessage = {
  id: 'm1',
  at: '2026-10-26',
  author: 'bot',
  body: 'Hello',
  attachments: [],
  delivery: 'committed',
};
describe('message feedback and selection menu', () => {
  it('offers feedback and selection for saved messages, including attachments without text', () => {
    expect(messageMenuActions(message, undefined, true).map((a) => a.key)).toEqual([
      'copy',
      'share',
      'feedback',
      'select',
    ]);
    expect(messageMenuActions({ ...message, body: '' }, undefined, true).map((a) => a.key)).toEqual(
      ['feedback', 'select'],
    );
    expect(
      messageMenuActions({ ...message, delivery: 'pending' }, undefined, true).map((a) => a.key),
    ).not.toContain('feedback');
  });
  it('dispatches feedback separately from copying and sharing', () => {
    const handlers = {
      onCopy: vi.fn(),
      onShareText: vi.fn(),
      onOpen: vi.fn(),
      onFeedback: vi.fn(),
      onSelect: vi.fn(),
    };
    runAction({ key: 'feedback', label: 'Feedback' }, message, handlers);
    runAction({ key: 'select', label: 'Select' }, message, handlers);
    expect(handlers.onFeedback).toHaveBeenCalledOnce();
    expect(handlers.onSelect).toHaveBeenCalledOnce();
    expect(handlers.onShareText).not.toHaveBeenCalled();
  });
});
