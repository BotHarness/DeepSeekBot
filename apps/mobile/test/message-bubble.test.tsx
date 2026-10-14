import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { ConversationMessage } from '../src/host/conversation';

vi.mock('react-native', () => {
  const host = (name: string) => {
    const Component = ({ children, ...props }: Record<string, unknown>) => {
      const attributes: Record<string, string> = {};
      for (const key of ['accessibilityLabel', 'accessibilityRole', 'selectable'])
        if (props[key] !== undefined) attributes[`data-${key.toLowerCase()}`] = String(props[key]);
      return (
        <div data-native={name} {...attributes}>
          {children as never}
        </div>
      );
    };
    return Component;
  };
  return {
    View: host('View'),
    Text: host('Text'),
    Pressable: host('Pressable'),
    ScrollView: host('ScrollView'),
    Linking: { openURL: async () => undefined },
    Platform: { OS: 'ios', select: (options: Record<string, unknown>) => options['ios'] },
    useColorScheme: () => 'light',
  };
});

const { MessageBubble, DraftBubble, deliveryLabel } = await import('../src/ui/chat/message-bubble');
const { t } = await import('../src/ui/strings');

const human = (overrides: Partial<ConversationMessage>): ConversationMessage => ({
  id: 'human-1',
  at: '2026-10-14T08:00:00.000Z',
  author: 'human',
  body: 'hello',
  attachments: 0,
  card: false,
  delivery: 'committed',
  ...overrides,
});

describe('message states', () => {
  it('shows a pending Human message as sending, without a retry control', () => {
    const html = renderToStaticMarkup(<MessageBubble message={human({ delivery: 'pending' })} />);
    expect(html).toContain(t.sending);
    expect(html).not.toContain('data-native="Pressable"');
  });

  it('shows a delivered message as sent until its journal entry arrives', () => {
    expect(deliveryLabel(human({}))).toBe(t.sent);
    const html = renderToStaticMarkup(<MessageBubble message={human({ revision: 4 })} />);
    expect(html).not.toContain(t.sent);
    expect(html).toContain('hello');
  });

  it('shows a failed message with a retry button', () => {
    const html = renderToStaticMarkup(
      <MessageBubble
        message={human({ delivery: 'failed', error: 'offline' })}
        onRetry={() => {}}
      />,
    );
    expect(html).toContain(
      `data-native="Pressable" data-accessibilitylabel="${t.notSent} · ${t.retrySend}"`,
    );
    expect(html).toContain('data-accessibilityrole="button"');
  });

  it('renders a Bot reply as selectable Markdown with an attachment placeholder', () => {
    const html = renderToStaticMarkup(
      <MessageBubble
        message={human({
          id: 'bot-1',
          author: 'bot',
          body: 'Use `pnpm test`:\n\n- one\n- [docs](https://botharness.ai)',
          attachments: 2,
          revision: 2,
        })}
      />,
    );
    expect(html).toContain('data-selectable="true"');
    expect(html).toContain('pnpm test');
    expect(html).toContain('data-accessibilityrole="link"');
    expect(html).toContain(t.attachments(2));
    expect(deliveryLabel(human({ author: 'bot' }))).toBeUndefined();
  });

  it('shows a card note for interactive messages and a typing line for drafts', () => {
    expect(
      renderToStaticMarkup(
        <MessageBubble message={human({ author: 'bot', card: true, body: '' })} />,
      ),
    ).toContain(t.card);
    const draft = renderToStaticMarkup(
      <DraftBubble draft={{ draftId: 'd', botSlug: 'b', body: 'Hel' }} />,
    );
    expect(draft).toContain('Hel');
    expect(draft).toContain(t.typing);
  });
});
