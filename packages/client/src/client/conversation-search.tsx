import * as stylex from '@stylexjs/stylex';
import { useId, useRef, useState, type ReactElement, type ReactNode } from 'react';

import {
  IconCloseOutlineRegular,
  IconSearchOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';

import { IconButton } from './ds/icon-button.js';
import { border, color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import type { ChannelMessage } from './store.js';

const SEARCH_DEBOUNCE_MS = 250;
const SNIPPET_CONTEXT = 40;

export interface ConversationSearchPage {
  messages: ChannelMessage[];
  nextCursor?: string;
}

const styles = stylex.create({
  panel: {
    position: 'absolute',
    zIndex: 5,
    right: space.x5,
    display: 'flex',
    flexDirection: 'column',
    width: 'min(420px, calc(100% - 32px))',
    maxHeight: 'min(60vh, 480px)',
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: color.border,
    borderRadius: radius.md,
    backgroundColor: color.base,
    boxShadow: 'var(--dsw-elevation-prominent)',
    overflow: 'hidden',
  },
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    paddingBlock: space.x2,
    paddingInlineStart: space.x4,
    paddingInlineEnd: space.x2,
    color: color.muted,
  },
  input: {
    flex: 1,
    minWidth: 0,
    paddingBlock: space.x3,
    paddingInline: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    color: color.fg,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    outline: 'none',
  },
  status: {
    flex: 'none',
    color: color.subtle,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    whiteSpace: 'nowrap',
  },
  list: {
    margin: 0,
    padding: space.x2,
    listStyle: 'none',
    overflowY: 'auto',
    borderTopWidth: border.hairline,
    borderTopStyle: 'solid',
    borderTopColor: color.divider,
  },
  option: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    paddingBlock: space.x3,
    paddingInline: space.x3,
    borderRadius: radius.sm,
    cursor: 'pointer',
    backgroundColor: { default: 'transparent', ':hover': color.hover },
  },
  optionActive: {
    backgroundColor: color.selected,
  },
  meta: {
    display: 'flex',
    gap: space.x3,
    color: color.subtle,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  author: {
    color: color.muted,
    fontWeight: text.strong,
  },
  snippet: {
    color: color.fg,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    overflowWrap: 'anywhere',
  },
  mark: {
    backgroundColor: color.warningSoft,
    color: 'inherit',
    borderRadius: radius.xs,
  },
  note: {
    paddingBlock: space.x3,
    paddingInline: space.x4,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  more: {
    width: '100%',
    paddingBlock: space.x3,
    paddingInline: space.x3,
    borderWidth: 0,
    borderRadius: radius.sm,
    backgroundColor: { default: 'transparent', ':hover': color.hover },
    color: color.accent,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    cursor: 'pointer',
  },
});

export function searchSnippet(
  body: string,
  query: string,
): { before: string; match: string; after: string } {
  const flat = body.replace(/\s+/gu, ' ').trim();
  const index = flat.toLowerCase().indexOf(query.trim().toLowerCase());
  if (index === -1) return { before: flat.slice(0, SNIPPET_CONTEXT * 2), match: '', after: '' };
  const end = index + query.trim().length;
  const start = Math.max(0, index - SNIPPET_CONTEXT);
  return {
    before: (start > 0 ? '…' : '') + flat.slice(start, index),
    match: flat.slice(index, end),
    after:
      flat.slice(end, end + SNIPPET_CONTEXT * 2) +
      (end + SNIPPET_CONTEXT * 2 < flat.length ? '…' : ''),
  };
}

export function ConversationSearch({
  search,
  onJump,
  onClose,
  label,
  time,
  top,
  t,
}: {
  search(text: string, cursor?: string): Promise<ConversationSearchPage>;
  onJump(messageId: string): void;
  onClose(): void;
  label(message: ChannelMessage): ReactNode;
  time(at: string): string;
  top: number;
  t: BotHarnessTranslate;
}): ReactElement {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [results, setResults] = useState<ChannelMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [active, setActive] = useState(-1);
  const sequence = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const listId = useId();
  const optionId = (index: number) => `${listId}-option-${String(index)}`;

  const inputMount = useMountedResource<HTMLInputElement>((node) => {
    node.focus();
    return () => {
      sequence.current += 1;
      if (timer.current !== undefined) clearTimeout(timer.current);
    };
  }, []);

  const run = async (text: string, cursor?: string): Promise<void> => {
    const current = ++sequence.current;
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      setSubmitted('');
      setResults([]);
      setNextCursor(undefined);
      setError(undefined);
      setLoading(false);
      setActive(-1);
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      const page = await search(trimmed, cursor);
      if (current !== sequence.current) return;
      setSubmitted(trimmed);
      setResults((previous) =>
        cursor === undefined ? page.messages : [...previous, ...page.messages],
      );
      setNextCursor(page.nextCursor);
      if (cursor === undefined) setActive(page.messages.length > 0 ? 0 : -1);
    } catch (failure) {
      if (current !== sequence.current) return;
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  };

  const schedule = (text: string): void => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = undefined;
      void run(text);
    }, SEARCH_DEBOUNCE_MS);
  };

  const jump = (index: number): void => {
    const message = results[index];
    if (message === undefined) return;
    setActive(index);
    onJump(message.id);
  };

  const count =
    submitted === ''
      ? undefined
      : t(nextCursor === undefined ? 'search.results' : 'search.resultsMore', {
          count: String(results.length),
        });

  return (
    <div
      role="search"
      aria-label={t('search.label')}
      data-conversation-search=""
      {...stylex.props(styles.panel)}
      style={{ top }}
    >
      <div {...stylex.props(styles.bar)}>
        <IconSearchOutlineRegular size={16} aria-hidden="true" />
        <input
          ref={inputMount}
          type="search"
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            active >= 0 && active < results.length ? optionId(active) : undefined
          }
          aria-label={t('search.placeholder')}
          placeholder={t('search.placeholder')}
          value={query}
          {...stylex.props(styles.input)}
          onChange={(event) => {
            setQuery(event.target.value);
            schedule(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              onClose();
            } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              if (results.length === 0) return;
              event.preventDefault();
              const delta = event.key === 'ArrowDown' ? 1 : -1;
              setActive((index) => (index + delta + results.length) % results.length);
            } else if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (timer.current !== undefined || query.trim() !== submitted) {
                if (timer.current !== undefined) clearTimeout(timer.current);
                timer.current = undefined;
                void run(query);
                return;
              }
              if (results.length === 0) return;
              const index = event.shiftKey
                ? (Math.max(active, 0) - 1 + results.length) % results.length
                : active < 0
                  ? 0
                  : active;
              jump(index);
              if (!event.shiftKey) setActive((index + 1) % results.length);
            }
          }}
        />
        {count === undefined ? null : (
          <span role="status" {...stylex.props(styles.status)}>
            {count}
          </span>
        )}
        <IconButton aria-label={t('search.close')} size="inline" tone="subtle" onClick={onClose}>
          <IconCloseOutlineRegular size={14} />
        </IconButton>
      </div>
      {error !== undefined ? (
        <div role="alert" {...stylex.props(styles.note)}>
          {t('search.failed', { error })}
        </div>
      ) : submitted !== '' && results.length === 0 && !loading ? (
        <div {...stylex.props(styles.note)}>{t('search.empty')}</div>
      ) : null}
      {results.length === 0 ? null : (
        <ul
          id={listId}
          role="listbox"
          aria-label={t('search.label')}
          {...stylex.props(styles.list)}
        >
          {results.map((message, index) => {
            const snippet = searchSnippet(message.body, submitted);
            return (
              <li
                key={message.id}
                id={optionId(index)}
                role="option"
                aria-selected={index === active}
                data-search-result={message.id}
                {...stylex.props(styles.option, index === active && styles.optionActive)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => jump(index)}
              >
                <span {...stylex.props(styles.meta)}>
                  <span {...stylex.props(styles.author)}>{label(message)}</span>
                  <time dateTime={message.at}>{time(message.at)}</time>
                </span>
                <span {...stylex.props(styles.snippet)}>
                  {snippet.before}
                  {snippet.match === '' ? null : (
                    <mark {...stylex.props(styles.mark)}>{snippet.match}</mark>
                  )}
                  {snippet.after}
                </span>
              </li>
            );
          })}
          {nextCursor === undefined ? null : (
            <li role="presentation">
              <button
                type="button"
                disabled={loading}
                {...stylex.props(styles.more)}
                onClick={() => void run(submitted, nextCursor)}
              >
                {t('search.more')}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
