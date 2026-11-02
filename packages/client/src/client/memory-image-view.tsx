import { useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { MemoryImage, MemoryImageComparison } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { SingleImageGallery } from './message-image-gallery.js';
import { border, color, radius, space, text } from './ds/tokens.stylex.js';

const styles = stylex.create({
  comparison: {
    display: 'grid',
    gridTemplateColumns: { default: '1fr 1fr', '@media (max-width: 760px)': '1fr' },
    gap: space.x5,
    padding: space.x5,
    minWidth: 0,
  },
  figure: {
    margin: 0,
    padding: space.x4,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: space.x3,
  },
  caption: { color: color.muted, fontSize: text.bodySize, lineHeight: text.bodyLine },
  button: {
    display: 'block',
    width: '100%',
    padding: 0,
    borderStyle: 'none',
    backgroundColor: color.well,
    borderRadius: radius.sm,
    cursor: 'zoom-in',
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
    outlineOffset: space.x1,
  },
  image: {
    display: 'block',
    width: '100%',
    height: 'auto',
    maxHeight: '60vh',
    objectFit: 'contain',
  },
  link: { color: color.fg, fontSize: text.bodySize },
});
export function memoryImageUrl(slug: string, path: string, image: MemoryImage): string {
  return (
    './api/botharness/memory/image?' +
    new URLSearchParams({ slug, path, source: image.source, revision: image.revision ?? '' })
  );
}
function ImageContent({
  slug,
  path,
  image,
  t,
}: {
  slug: string;
  path: string;
  image: MemoryImage;
  t: BotHarnessTranslate;
}): ReactElement {
  const [visible, setVisible] = useState(false);
  const observe = useMountedResource<HTMLDivElement>((node) => {
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setVisible(true);
      observer.disconnect();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  if (image.status !== 'ready' || failed)
    return (
      <div role="status" className="bh-note">
        {failed
          ? t('memory.image.loadFailed')
          : image.status === 'ready'
            ? null
            : t(`memory.image.${image.status}`)}
      </div>
    );
  const src = memoryImageUrl(slug, path, image);
  return (
    <div ref={observe}>
      {!loaded ? (
        <span role="status" {...stylex.props(styles.caption)}>
          {t('memory.loading')}
        </span>
      ) : null}
      {visible ? (
        <SingleImageGallery t={t}>
          {(open) => (
            <button
              type="button"
              {...stylex.props(styles.button)}
              aria-label={t('message.image.open', { name: path })}
              onClick={() => open({ key: src, src, alt: path })}
            >
              <img
                src={src}
                alt={path}
                width={image.width}
                height={image.height}
                loading="lazy"
                {...stylex.props(styles.image)}
                onLoad={() => setLoaded(true)}
                onError={() => setFailed(true)}
              />
            </button>
          )}
        </SingleImageGallery>
      ) : null}
      <a href={src} download={path.split('/').at(-1)} {...stylex.props(styles.link)}>
        {t('fileAction.download')}
      </a>
    </div>
  );
}
export function MemoryImageView({
  slug,
  path,
  image,
  t,
}: {
  slug: string;
  path: string;
  image: MemoryImage;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <div {...stylex.props(styles.figure)}>
      <ImageContent
        key={`${slug}:${path}:${image.source}:${image.revision ?? image.status}`}
        slug={slug}
        path={path}
        image={image}
        t={t}
      />
    </div>
  );
}
export function MemoryImageDiff({
  slug,
  path,
  images,
  t,
}: {
  slug: string;
  path: string;
  images: MemoryImageComparison;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <div {...stylex.props(styles.comparison)}>
      {(['before', 'after'] as const).map((side) => (
        <figure key={side} {...stylex.props(styles.figure)}>
          <figcaption {...stylex.props(styles.caption)}>{t(`memory.image.${side}`)}</figcaption>
          {images[side] === undefined ? (
            <span {...stylex.props(styles.caption)}>{t('memory.image.absent')}</span>
          ) : (
            <ImageContent
              key={`${slug}:${path}:${images[side].source}:${images[side].revision ?? images[side].status}`}
              slug={slug}
              path={path}
              image={images[side]}
              t={t}
            />
          )}
        </figure>
      ))}
    </div>
  );
}
