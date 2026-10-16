import {
  Children,
  isValidElement,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import { Menu, type MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives';
import { border, color, space, size, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import {
  defaultFooterPreferences,
  FOOTER_ITEMS,
  moveFooterItem,
  saveFooterPreferences,
  toggleFooterItem,
  useFooterPreferences,
  type FooterItem,
  type FooterSide,
} from './composer-footer-preferences.js';

const styles = stylex.create({
  bar: {
    display: { default: 'flex', ':is([hidden])': 'none' },
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.x3,
    minWidth: 0,
    minHeight: size.icon,
    paddingTop: space.x2,
    paddingInline: space.x2,
    paddingBottom: 0,
  },
  side: {
    display: 'flex',
    flexWrap: 'nowrap',
    gap: space.x2,
    minWidth: 0,
    flexShrink: 1,
    alignItems: 'center',
  },
  leading: { flexGrow: 1, flexBasis: '0%' },
  trailing: { justifyContent: 'flex-end', maxWidth: '55%' },
  item: { display: 'flex', flexShrink: 1, minWidth: 0, maxWidth: '100%', position: 'relative' },
  editing: {
    outline: `${border.hairline} dashed ${color.borderStrong}`,
    outlineOffset: space.x1,
    cursor: 'grab',
    touchAction: 'none',
  },
  dropEnd: { boxShadow: `inset calc(-1 * ${border.focus}) 0 ${color.accent}` },
  drop: { boxShadow: `inset ${border.focus} 0 ${color.accent}` },
  editingSide: {
    minHeight: size.row,
    minWidth: size.row,
    flexGrow: 1,
    flexBasis: '0%',
    outline: `${border.hairline} dashed ${color.border}`,
  },
  hint: {
    color: color.muted,
    fontSize: text.metaSize,
    paddingInline: space.x2,
    whiteSpace: 'nowrap',
  },
});

const labels = {
  model: 'entry.model',
  workspace: 'entry.workspaceGrants',
  usage: 'footer.usage',
  'avg-perf': 'footer.speed',
} as const;

export function ComposerContextBar({
  label,
  hidden = false,
  trailing,
  children,
  t,
  compact = false,
  available = FOOTER_ITEMS,
}: {
  readonly label: string;
  readonly hidden?: boolean;
  readonly trailing?: ReactNode;
  readonly children: ReactNode;
  readonly t?: BotHarnessTranslate;
  readonly compact?: boolean;
  readonly available?: readonly FooterItem[];
}): ReactElement {
  const preferences = useFooterPreferences();
  const root = useRef<HTMLDivElement | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number }>();
  const [editing, setEditing] = useState(false);
  const drag = useRef<FooterItem | undefined>(undefined);
  const [drop, setDrop] = useState<{ side: FooterSide; before?: FooterItem }>();
  const dropRef = useRef<typeof drop>(undefined);
  const configurable = t !== undefined && !compact;
  const editMount = useMountedResource<HTMLSpanElement>(() => {
    if (!editing) return;
    const end = () => {
      setEditing(false);
      setDrop(undefined);
      drag.current = undefined;
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        end();
        root.current?.focus();
      }
    };
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) end();
    };
    document.addEventListener('keydown', key);
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('keydown', key);
      document.removeEventListener('pointerdown', outside);
    };
  }, [editing]);
  const nodes = new Map<FooterItem, ReactNode>();
  for (const child of [...Children.toArray(children), ...Children.toArray(trailing)]) {
    if (isValidElement<{ 'data-composer-chip'?: FooterItem }>(child)) {
      const id = child.props['data-composer-chip'];
      if (id !== undefined) nodes.set(id, child);
    }
  }
  const side = (position: FooterSide) => {
    const ids = preferences[position].filter((id) => nodes.has(id));
    return (
      <div
        data-footer-side={position}
        data-composer-context-leading={position === 'left' ? '' : undefined}
        {...stylex.props(
          styles.side,
          position === 'left' ? styles.leading : styles.trailing,
          editing && styles.editingSide,
          drop?.side === position && drop.before === undefined && styles.dropEnd,
        )}
      >
        {ids.map((id) => (
          <span
            key={id}
            data-footer-item={id}
            tabIndex={editing ? 0 : undefined}
            role={editing ? 'button' : undefined}
            aria-label={editing ? `${t?.(labels[id])} · ${t?.('footer.moveHint')}` : undefined}
            {...stylex.props(
              styles.item,
              editing && styles.editing,
              drop?.side === position && drop.before === id && styles.drop,
            )}
            onClickCapture={(event) => {
              if (editing) {
                event.preventDefault();
                event.stopPropagation();
                event.currentTarget.focus();
              }
            }}
            onPointerDown={(event) => {
              if (!editing || event.button !== 0) return;
              event.preventDefault();
              event.stopPropagation();
              event.currentTarget.focus();
              drag.current = id;
              dropRef.current = undefined;
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (drag.current === undefined) return;
              const sides = root.current?.querySelectorAll<HTMLElement>('[data-footer-side]');
              let next: typeof drop;
              for (const zone of sides ?? []) {
                const rect = zone.getBoundingClientRect();
                if (
                  event.clientX < rect.left ||
                  event.clientX > rect.right ||
                  event.clientY < rect.top ||
                  event.clientY > rect.bottom
                )
                  continue;
                const side = zone.dataset.footerSide as FooterSide;
                const before = [...zone.querySelectorAll<HTMLElement>('[data-footer-item]')].find(
                  (item) => {
                    const box = item.getBoundingClientRect();
                    return event.clientX < box.left + box.width / 2;
                  },
                )?.dataset.footerItem as FooterItem | undefined;
                next = { side, ...(before === undefined ? {} : { before }) };
              }
              dropRef.current = next;
              setDrop(next);
            }}
            onPointerUp={(event) => {
              if (drag.current === undefined) return;
              event.stopPropagation();
              const destination = dropRef.current;
              if (destination !== undefined)
                saveFooterPreferences(
                  moveFooterItem(preferences, drag.current, destination.side, destination.before),
                );
              drag.current = undefined;
              dropRef.current = undefined;
              setDrop(undefined);
              event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onLostPointerCapture={() => {
              drag.current = undefined;
              dropRef.current = undefined;
              setDrop(undefined);
            }}
            onKeyDown={(event) => {
              if (!editing || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
              event.preventDefault();
              const nextSide =
                event.ctrlKey || event.metaKey
                  ? event.key === 'ArrowLeft'
                    ? 'left'
                    : 'right'
                  : position;
              const all = preferences[position];
              const index = all.indexOf(id);
              const before =
                nextSide !== position
                  ? undefined
                  : event.key === 'ArrowLeft'
                    ? all[Math.max(0, index - 1)]
                    : all[index + 2];
              saveFooterPreferences(moveFooterItem(preferences, id, nextSide, before));
              requestAnimationFrame(() =>
                root.current?.querySelector<HTMLElement>(`[data-footer-item="${id}"]`)?.focus(),
              );
            }}
          >
            {nodes.get(id)}
          </span>
        ))}
        {editing && ids.length === 0 ? (
          <span {...stylex.props(styles.hint)}>
            {t?.(position === 'left' ? 'footer.left' : 'footer.right')}
          </span>
        ) : null}
      </div>
    );
  };
  const items: MenuEntry[] = configurable
    ? [
        ...available.map((id) => ({ id, label: t(labels[id]) })),
        { id: 'layout', label: t(editing ? 'footer.done' : 'footer.layout') },
        { id: 'reset', label: t('footer.reset') },
      ]
    : [];
  return (
    <>
      <span ref={editMount} hidden />
      <div
        ref={root}
        role="group"
        aria-label={label}
        tabIndex={configurable ? 0 : undefined}
        hidden={hidden}
        title={configurable ? t(editing ? 'footer.moveHint' : 'footer.customizeHint') : undefined}
        data-composer-context=""
        data-footer-editing={editing || undefined}
        {...stylex.props(styles.bar)}
        onContextMenu={(event) => {
          if (!configurable) return;
          event.preventDefault();
          setMenu({ x: event.clientX, y: event.clientY });
        }}
        onKeyDown={(event) => {
          if (
            configurable &&
            (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))
          ) {
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            setMenu({ x: rect.left, y: rect.top });
          }
        }}
      >
        {configurable ? (
          <>
            {side('left')}
            {side('right')}
          </>
        ) : (
          <>
            <div data-composer-context-leading="" {...stylex.props(styles.side, styles.leading)}>
              {children}
            </div>
            {trailing}
          </>
        )}
      </div>
      {menu === undefined ? null : (
        <Menu
          open
          portal
          dense
          autoFocus
          anchor={<span />}
          getAnchorRect={() => new DOMRect(menu.x, menu.y, 0, 0)}
          items={items}
          selectedIds={FOOTER_ITEMS.filter((id) => !preferences.hidden.includes(id))}
          onClose={() => {
            setMenu(undefined);
            root.current?.focus();
          }}
          onSelect={(id) => {
            setMenu(undefined);
            if (id === 'layout') setEditing((value) => !value);
            else if (id === 'reset') {
              saveFooterPreferences(defaultFooterPreferences());
              setEditing(false);
            } else if (FOOTER_ITEMS.includes(id as FooterItem))
              saveFooterPreferences(toggleFooterItem(preferences, id as FooterItem));
            root.current?.focus();
          }}
        />
      )}
    </>
  );
}
