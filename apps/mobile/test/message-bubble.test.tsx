import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { ConversationMessage } from '../src/host/conversation';

vi.mock('react-native', () => {
  const host = (name: string) => {
    const Component = ({ children, ...props }: Record<string, unknown>) => {
      const attributes: Record<string, string> = {};
      for (const key of ['accessibilityLabel', 'accessibilityRole', 'selectable', 'source'])
        if (props[key] !== undefined)
          attributes[`data-${key.toLowerCase()}`] =
            typeof props[key] === 'object' ? JSON.stringify(props[key]) : String(props[key]);
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
    Image: host('Image'),
    ActivityIndicator: host('ActivityIndicator'),
    Linking: { openURL: async () => undefined },
    Platform: { OS: 'ios', select: (options: Record<string, unknown>) => options['ios'] },
    useColorScheme: () => 'light',
  };
});

vi.mock('react-native-svg', () => ({
  default: () => <svg />,
  Path: () => null,
}));

const { MessageBubble, DraftBubble, deliveryLabel } = await import('../src/ui/chat/message-bubble');
const { t } = await import('../src/ui/strings');

const human = (overrides: Partial<ConversationMessage>): ConversationMessage => ({
  id: 'human-1',
  at: '2026-10-14T08:00:00.000Z',
  author: 'human',
  body: 'hello',
  attachments: [],
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

  it('renders a Bot reply as selectable Markdown', () => {
    const html = renderToStaticMarkup(
      <MessageBubble
        message={human({
          id: 'bot-1',
          author: 'bot',
          body: 'Use `pnpm test`:\n\n- one\n- [docs](https://botharness.ai)',
          revision: 2,
        })}
      />,
    );
    expect(html).toContain('data-selectable="true"');
    expect(html).toContain('pnpm test');
    expect(html).toContain('data-accessibilityrole="link"');
    expect(deliveryLabel(human({ author: 'bot' }))).toBeUndefined();
  });

  it('shows images as thumbnails and files as rows with their size', () => {
    const source = { uri: 'https://host/a', headers: { authorization: 'Device x' } };
    const html = renderToStaticMarkup(
      <MessageBubble
        message={human({
          author: 'bot',
          body: '',
          attachments: [
            { key: 'a', kind: 'image', name: 'chart.png', source, local: false },
            { key: 'b', kind: 'file', name: 'report.pdf', size: 3_500_000, source, local: false },
            { key: 'c', kind: 'audio', name: 'voice.ogg', local: false },
          ],
        })}
      />,
    );
    expect(html).toContain(`data-accessibilitylabel="${t.openImage('chart.png')}"`);
    expect(html).toContain('data-native="Image"');
    expect(html).toContain('Device x');
    expect(html).toContain(`data-accessibilitylabel="${t.shareFile('report.pdf')}"`);
    expect(html).toContain('3.3 MB');
    expect(html).toContain('voice.ogg');
    expect(html).toContain(t.attachmentElsewhere);
    expect(html).not.toContain('full client to view.');
  });

  it('shows a card note for interactive messages and a typing line for drafts', () => {
    expect(
      renderToStaticMarkup(
        <MessageBubble
          message={human({
            author: 'bot',
            card: { kind: 'private-input', channelId: 'dm-ada' },
            body: '',
          })}
        />,
      ),
    ).toContain(t.card);
    const draft = renderToStaticMarkup(
      <DraftBubble draft={{ draftId: 'd', botSlug: 'b', body: 'Hel' }} />,
    );
    expect(draft).toContain('Hel');
    expect(draft).toContain(t.typing);
  });
});
