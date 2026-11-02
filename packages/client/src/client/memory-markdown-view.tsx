import { useMemo, useState, type ReactElement } from 'react';
import Markdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import * as stylex from '@stylexjs/stylex';
import type { MemoryMarkdown, MemoryMarkdownComparison } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { SingleImageGallery } from './message-image-gallery.js';
import { border, color, radius, space, text } from './ds/tokens.stylex.js';

const styles = stylex.create({
  document: {
    padding: space.x5,
    color: color.fg,
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    overflowWrap: 'anywhere',
    minWidth: 0,
  },
  heading: {
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    fontWeight: text.strong,
    marginTop: space.x6,
    marginBottom: space.x3,
  },
  paragraph: { marginTop: space.x3, marginBottom: space.x4 },
  code: {
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    backgroundColor: color.well,
    padding: space.x3,
    borderRadius: radius.sm,
  },
  quote: {
    marginInline: 0,
    paddingInlineStart: space.x4,
    borderInlineStart: `${border.hairline} solid ${color.border}`,
    color: color.muted,
  },
  table: { display: 'block', overflowX: 'auto', borderCollapse: 'collapse', maxWidth: '100%' },
  cell: {
    border: `${border.hairline} solid ${color.border}`,
    padding: space.x3,
    textAlign: 'start',
  },
  link: { color: color.accent },
  pending: { aspectRatio: '16 / 9', maxHeight: '60vh', width: '100%' },
  imageBlock: { display: 'block', minHeight: space.x6, marginBlock: space.x4 },
  image: {
    display: 'block',
    maxWidth: '100%',
    width: 'auto',
    height: 'auto',
    maxHeight: '60vh',
    objectFit: 'contain',
  },
  imageButton: {
    appearance: 'none',
    display: 'block',
    maxWidth: '100%',
    backgroundColor: color.well,
    padding: 0,
    borderStyle: 'none',
    cursor: 'zoom-in',
    borderRadius: radius.sm,
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
  },
  control: {
    appearance: 'none',
    color: color.fg,
    backgroundColor: color.surface,
    border: `${border.hairline} solid ${color.border}`,
    borderRadius: radius.sm,
    paddingBlock: space.x2,
    paddingInline: space.x3,
    cursor: 'pointer',
    fontSize: text.bodySize,
    ':hover': { backgroundColor: color.hover },
    ':focus-visible': { outline: `${border.focus} solid ${color.accent}` },
  },
  muted: { display: 'block', color: color.muted, fontSize: text.bodySize, marginBlock: space.x2 },
  comparison: {
    display: 'grid',
    gridTemplateColumns: {
      default: 'minmax(0, 1fr) minmax(0, 1fr)',
      '@media (max-width: 760px)': 'minmax(0, 1fr)',
    },
    minWidth: 0,
  },
  side: { margin: 0, minWidth: 0 },
  caption: { padding: space.x4, color: color.muted, fontSize: text.bodySize },
});

function MarkdownImage({
  slug,
  path,
  document,
  reference,
  alt,
  t,
}: {
  slug: string;
  path: string;
  document: MemoryMarkdown;
  reference: string;
  alt: string;
  t: BotHarnessTranslate;
}): ReactElement {
  const remote = /^https:\/\//iu.test(reference);
  const invalid =
    !reference ||
    reference.startsWith('//') ||
    /[\\\u0000-\u001f\u007f]/u.test(reference) ||
    (!remote && /^[a-z][a-z0-9+.-]*:/iu.test(reference));
  const [allowed, setAllowed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [src, setSrc] = useState<string>();
  const [loaded, setLoaded] = useState(false);
  const [failure, setFailure] = useState<string>();
  const enabled = !invalid && (!remote || allowed);
  const observe = useMountedResource<HTMLSpanElement>(
    (node) => {
      if (!enabled) return;
      let active = true;
      let objectUrl: string | undefined;
      const controller = new AbortController();
      setSrc(undefined);
      setFailure(undefined);
      setLoaded(false);
      const load = async () => {
        if (remote) {
          if (active) setSrc(reference);
          return;
        }
        try {
          const query = new URLSearchParams({
            slug,
            path,
            source: document.source,
            revision: document.revision ?? '',
            reference,
          });
          const response = await fetch('./api/botharness/memory/image?' + query, {
            signal: controller.signal,
            credentials: 'same-origin',
          });
          if (!response.ok) {
            const result: unknown = await response.json();
            const code = (result as { error?: { code?: string } }).error?.code;
            throw new Error(
              code?.startsWith('memory-image-') ? code.slice('memory-image-'.length) : 'loadFailed',
            );
          }
          const blob = await response.blob();
          if (!active) return;
          objectUrl = URL.createObjectURL(blob);
          setSrc(objectUrl);
        } catch (error) {
          if (active) setFailure(error instanceof Error ? error.message : 'loadFailed');
        }
      };
      let observer: IntersectionObserver | undefined;
      if (typeof IntersectionObserver === 'undefined') void load();
      else {
        observer = new IntersectionObserver((entries) => {
          if (!entries.some((e) => e.isIntersecting)) return;
          observer?.disconnect();
          void load();
        });
        observer.observe(node);
      }
      return () => {
        active = false;
        controller.abort();
        observer?.disconnect();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
    },
    [enabled, remote, reference, slug, path, document.source, document.revision, attempt],
  );
  const label = alt || reference;
  return (
    <span
      ref={observe}
      {...stylex.props(
        styles.imageBlock,
        enabled && !loaded && failure === undefined && styles.pending,
      )}
    >
      {invalid ? (
        <span role="status" {...stylex.props(styles.muted)}>
          {t('memory.markdown.invalidImage')} · {label}
        </span>
      ) : remote && !allowed ? (
        <button type="button" {...stylex.props(styles.control)} onClick={() => setAllowed(true)}>
          {t('memory.markdown.loadExternal', { name: label })}
        </button>
      ) : failure !== undefined ? (
        <span role="status" {...stylex.props(styles.muted)}>
          {t(
            failure === 'missing' ||
              failure === 'unsupported' ||
              failure === 'too-large' ||
              failure === 'stale'
              ? `memory.image.${failure}`
              : 'memory.image.loadFailed',
          )}{' '}
          · {label}{' '}
          <button
            type="button"
            {...stylex.props(styles.control)}
            onClick={() => setAttempt((v) => v + 1)}
          >
            {t('memory.markdown.retry')}
          </button>
        </span>
      ) : (
        <>
          {!loaded ? (
            <span role="status" {...stylex.props(styles.muted)}>
              {t('memory.loading')} · {label}
            </span>
          ) : null}
          {src === undefined ? null : (
            <SingleImageGallery t={t}>
              {(open) => (
                <button
                  type="button"
                  {...stylex.props(styles.imageButton)}
                  aria-label={t('message.image.open', { name: label })}
                  onClick={() => open({ key: src, src, alt: label })}
                >
                  <img
                    src={src}
                    alt={label}
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    crossOrigin={remote ? 'anonymous' : undefined}
                    {...stylex.props(styles.image)}
                    onLoad={() => setLoaded(true)}
                    onError={() => setFailure('loadFailed')}
                  />
                </button>
              )}
            </SingleImageGallery>
          )}
        </>
      )}
      {!remote && src !== undefined && loaded && failure === undefined ? (
        <a
          href={src}
          download={reference.split('/').at(-1)?.split(/[?#]/u)[0]}
          aria-label={`${t('fileAction.download')} ${label}`}
          {...stylex.props(styles.link)}
        >
          {t('fileAction.download')}
        </a>
      ) : null}
      {remote ? (
        <span {...stylex.props(styles.muted)}>{t('memory.markdown.externalNote')}</span>
      ) : null}
    </span>
  );
}

export function MemoryMarkdownView({
  slug,
  path,
  document,
  t,
}: {
  slug: string;
  path: string;
  document: MemoryMarkdown;
  t: BotHarnessTranslate;
}): ReactElement {
  return useMemo(() => {
    if (document.status !== 'ready')
      return (
        <div className="bh-note" role="status">
          {t('memory.markdown.unavailable')}
        </div>
      );
    return (
      <div
        {...stylex.props(styles.document)}
        className={`bh-memory-markdown ${stylex.props(styles.document).className}`}
      >
        <Markdown
          remarkPlugins={[remarkGfm]}
          urlTransform={(url, key) => (key === 'src' ? url : defaultUrlTransform(url))}
          components={{
            img: ({ src, alt }) => (
              <MarkdownImage
                key={`${slug}:${path}:${document.source}:${document.revision}:${src}`}
                slug={slug}
                path={path}
                document={document}
                reference={src ?? ''}
                alt={alt ?? ''}
                t={t}
              />
            ),
            a: ({ href, children, node }) =>
              href &&
              /^https?:\/\//iu.test(href) &&
              !node?.children.some((c) => c.type === 'element' && c.tagName === 'img') ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  {...stylex.props(styles.link)}
                >
                  {children}
                </a>
              ) : (
                <span>{children}</span>
              ),
            h1: ({ children }) => <h1 {...stylex.props(styles.heading)}>{children}</h1>,
            h2: ({ children }) => <h2 {...stylex.props(styles.heading)}>{children}</h2>,
            h3: ({ children }) => <h3 {...stylex.props(styles.heading)}>{children}</h3>,
            h4: ({ children }) => <h4 {...stylex.props(styles.heading)}>{children}</h4>,
            h5: ({ children }) => <h5 {...stylex.props(styles.heading)}>{children}</h5>,
            h6: ({ children }) => <h6 {...stylex.props(styles.heading)}>{children}</h6>,
            p: ({ children }) => <p {...stylex.props(styles.paragraph)}>{children}</p>,
            pre: ({ children }) => <pre {...stylex.props(styles.code)}>{children}</pre>,
            blockquote: ({ children }) => (
              <blockquote {...stylex.props(styles.quote)}>{children}</blockquote>
            ),
            table: ({ children }) => <table {...stylex.props(styles.table)}>{children}</table>,
            td: ({ children }) => <td {...stylex.props(styles.cell)}>{children}</td>,
            th: ({ children }) => <th {...stylex.props(styles.cell)}>{children}</th>,
          }}
        >
          {document.body}
        </Markdown>
      </div>
    );
  }, [slug, path, document.source, document.revision, document.status, document.body, t]);
}

export function MemoryMarkdownDiff({
  slug,
  path,
  markdown,
  t,
}: {
  slug: string;
  path: string;
  markdown: MemoryMarkdownComparison;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <div {...stylex.props(styles.comparison)}>
      {(['before', 'after'] as const).map((side) => (
        <figure key={side} {...stylex.props(styles.side)}>
          <figcaption {...stylex.props(styles.caption)}>{t(`memory.image.${side}`)}</figcaption>
          {markdown[side] === undefined ? (
            <div className="bh-note">{t('memory.image.absent')}</div>
          ) : (
            <MemoryMarkdownView slug={slug} path={path} document={markdown[side]} t={t} />
          )}
        </figure>
      ))}
    </div>
  );
}
export function MemoryMarkdownToggle({
  preview,
  onToggle,
  diff,
  t,
}: {
  preview: boolean;
  onToggle: () => void;
  diff?: boolean;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <button
      type="button"
      {...stylex.props(styles.control)}
      aria-pressed={preview}
      onClick={onToggle}
    >
      {t(
        preview
          ? diff
            ? 'memory.markdown.lineDiff'
            : 'memory.markdown.source'
          : 'memory.markdown.preview',
      )}
    </button>
  );
}
