import { useState, type ReactElement, type ReactNode } from 'react';

import * as stylex from '@stylexjs/stylex';

import type { SessionToolDetail } from './bridge.js';
import { Icon } from './ds/icon.js';
import { IconButton } from './ds/icon-button.js';
import { Tooltip } from './ds/tooltip.js';
import { font, status } from './ds/tobs.stylex.js';
import { color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { diffLines } from './session-transcript-view.js';

const styles = stylex.create({
  card: {
    marginInlineStart: space.x6,
    marginBlock: space.x2,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    overflow: 'hidden',
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  cardHead: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    paddingBlock: space.x2,
    paddingInline: space.x4,
    color: color.muted,
    fontFamily: font.familyMono,
    overflowWrap: 'anywhere',
  },
  headText: { flexGrow: 1, minWidth: 0 },
  wrapOn: { color: color.fg, backgroundColor: color.hover },
  code: {
    margin: 0,
    paddingBlock: space.x3,
    paddingInline: space.x4,
    maxHeight: '320px',
    overflow: 'auto',
    fontFamily: font.familyMono,
    whiteSpace: 'pre',
    color: color.fg,
  },
  codeWrap: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
  codeLine: { display: 'block', minWidth: 'max-content' },
  codeLineWrap: { minWidth: 0 },
  lineAdd: { backgroundColor: status.successTint },
  lineRemove: { backgroundColor: status.dangerTint },
  gutter: {
    display: 'inline-block',
    minWidth: space.x6,
    marginInlineEnd: space.x3,
    color: color.subtle,
    textAlign: 'end',
    userSelect: 'none',
  },
  links: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x2,
    paddingBlock: space.x3,
    paddingInline: space.x4,
  },
  link: {
    color: color.accentText,
    overflowWrap: 'anywhere',
    textDecoration: { default: 'none', ':hover': 'underline' },
  },
  meta: {
    flexShrink: 0,
    color: color.subtle,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
  stat: { display: 'inline-flex', gap: space.x2, flexShrink: 0 },
  add: { color: color.success },
  remove: { color: color.danger },
  bad: { color: color.danger },
});

export function DiffStat({
  added,
  removed,
}: {
  added?: number | undefined;
  removed?: number | undefined;
}): ReactNode {
  if (added === undefined && removed === undefined) return null;
  return (
    <span {...stylex.props(styles.meta, styles.stat)}>
      <span {...stylex.props(styles.add)}>+{added ?? 0}</span>
      <span {...stylex.props(styles.remove)}>−{removed ?? 0}</span>
    </span>
  );
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }): ReactElement {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" {...stylex.props(styles.link)}>
      {children}
    </a>
  );
}

function WrapToggle({
  wrap,
  onToggle,
  t,
}: {
  wrap: boolean;
  onToggle: () => void;
  t: BotHarnessTranslate;
}): ReactElement {
  const label = t('sessions.detail.tool.wrap');
  return (
    <Tooltip label={label} side="top" portal delayMs={400}>
      <IconButton
        size="inline"
        tone="subtle"
        data-tool-detail-wrap=""
        aria-label={label}
        aria-pressed={wrap}
        xstyle={wrap ? styles.wrapOn : undefined}
        onClick={onToggle}
      >
        <Icon name="wrap-text" size={14} />
      </IconButton>
    </Tooltip>
  );
}

interface WrapControl {
  wrap: boolean;
  onToggle: () => void;
  t: BotHarnessTranslate;
}

function CardHead({
  wrap,
  meta,
  children,
}: {
  wrap?: WrapControl | undefined;
  meta?: ReactNode;
  children?: ReactNode;
}): ReactElement {
  return (
    <div {...stylex.props(styles.cardHead)}>
      <span {...stylex.props(styles.headText)}>{children}</span>
      {meta}
      {wrap === undefined ? null : <WrapToggle {...wrap} />}
    </div>
  );
}

function CodeBlock({
  lines,
  wrap,
}: {
  lines: { text: string; gutter?: number | string; kind?: 'add' | 'remove' }[];
  wrap: boolean;
}): ReactElement {
  return (
    <pre data-wrap={wrap} {...stylex.props(styles.code, wrap && styles.codeWrap)}>
      {lines.map((line, index) => (
        <span
          key={index}
          {...stylex.props(
            styles.codeLine,
            wrap && styles.codeLineWrap,
            line.kind === 'add' && styles.lineAdd,
            line.kind === 'remove' && styles.lineRemove,
          )}
        >
          {line.gutter === undefined ? null : (
            <span {...stylex.props(styles.gutter)}>{line.gutter}</span>
          )}
          {line.text === '' ? ' ' : line.text}
        </span>
      ))}
    </pre>
  );
}

function textLines(value: string): { text: string }[] {
  return value.split('\n').map((line) => ({ text: line }));
}

export function ToolDetailView({
  detail,
  t,
}: {
  detail: SessionToolDetail;
  t: BotHarnessTranslate;
}): ReactElement {
  const [wrap, setWrap] = useState(false);
  const control: WrapControl = { wrap, onToggle: () => setWrap((value) => !value), t };
  switch (detail.card) {
    case 'terminal':
      return (
        <div data-tool-detail="terminal" {...stylex.props(styles.card)}>
          <CardHead wrap={control}>
            {detail.command === undefined ? null : `$ ${detail.command}`}
          </CardHead>
          <CodeBlock
            wrap={wrap}
            lines={textLines(
              detail.output === '' ? t('sessions.detail.tool.empty') : detail.output,
            )}
          />
          {detail.exitCode === undefined || detail.exitCode === 0 ? null : (
            <div {...stylex.props(styles.cardHead, styles.bad)}>
              {t('sessions.detail.tool.exit', { code: detail.exitCode })}
            </div>
          )}
        </div>
      );
    case 'diff':
      return (
        <div data-tool-detail="diff">
          {detail.files.map((file, index) => (
            <div key={`${file.path}-${index}`} {...stylex.props(styles.card)}>
              <CardHead wrap={control}>{file.path}</CardHead>
              <CodeBlock
                wrap={wrap}
                lines={diffLines(file.oldText, file.newText).map((line) => ({
                  text: line.text,
                  gutter: line.kind === 'add' ? '+' : line.kind === 'remove' ? '−' : '',
                  ...(line.kind === 'same' ? {} : { kind: line.kind }),
                }))}
              />
            </div>
          ))}
        </div>
      );
    case 'read': {
      const from = detail.lines[0]?.number ?? detail.offset;
      const to = detail.lines.at(-1)?.number ?? from;
      return (
        <div data-tool-detail="read" {...stylex.props(styles.card)}>
          <CardHead
            wrap={control}
            meta={
              <span {...stylex.props(styles.meta)}>
                {t('sessions.detail.tool.lines', { from, to, total: detail.totalLines })}
              </span>
            }
          >
            {detail.path}
          </CardHead>
          <CodeBlock
            wrap={wrap}
            lines={detail.lines.map((line) => ({ text: line.text, gutter: line.number }))}
          />
        </div>
      );
    }
    case 'search':
      return (
        <div data-tool-detail="search" {...stylex.props(styles.card)}>
          <CardHead
            wrap={control}
            meta={
              detail.truncated ? (
                <span {...stylex.props(styles.meta)}>{t('sessions.detail.tool.truncated')}</span>
              ) : null
            }
          >
            {t('sessions.detail.tool.matches', { count: detail.total })}
          </CardHead>
          <CodeBlock
            wrap={wrap}
            lines={[
              ...detail.files.flatMap((file) => [
                { text: file.path },
                ...file.matches.map((match) => ({ text: match.line, gutter: match.lineNumber })),
              ]),
              ...detail.paths.map((path) => ({ text: path })),
            ]}
          />
        </div>
      );
    case 'web':
      return (
        <div data-tool-detail="web" {...stylex.props(styles.card)}>
          {detail.url === undefined && detail.output === '' ? null : (
            <CardHead
              wrap={detail.output === '' ? undefined : control}
              meta={
                detail.statusCode === undefined ? null : (
                  <span {...stylex.props(styles.meta)}>
                    {t('sessions.detail.tool.status', { code: detail.statusCode })}
                  </span>
                )
              }
            >
              {detail.url === undefined ? (
                t('sessions.detail.tool.output')
              ) : (
                <ExternalLink href={detail.url}>{detail.url}</ExternalLink>
              )}
            </CardHead>
          )}
          {detail.sources.length === 0 ? null : (
            <div {...stylex.props(styles.links)}>
              {detail.sources.map((source) => (
                <ExternalLink key={source.url} href={source.url}>
                  {source.title ?? source.url}
                </ExternalLink>
              ))}
            </div>
          )}
          {detail.output === '' ? null : <CodeBlock wrap={wrap} lines={textLines(detail.output)} />}
        </div>
      );
    case 'text':
      return (
        <div data-tool-detail="text">
          {detail.input === undefined ? null : (
            <div {...stylex.props(styles.card)}>
              <CardHead wrap={control}>{t('sessions.detail.tool.input')}</CardHead>
              <CodeBlock wrap={wrap} lines={textLines(detail.input)} />
            </div>
          )}
          <div {...stylex.props(styles.card)}>
            <CardHead wrap={control}>{t('sessions.detail.tool.output')}</CardHead>
            <CodeBlock
              wrap={wrap}
              lines={textLines(
                detail.output === '' ? t('sessions.detail.tool.empty') : detail.output,
              )}
            />
          </div>
        </div>
      );
  }
}
