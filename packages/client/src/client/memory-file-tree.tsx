import { useState, type KeyboardEvent, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  FileTypeIcon,
  IconEllipsisOutlineRegular,
  Tag,
  Tooltip,
  IconChevronDownOutlineRegular,
  IconFolderCloseRegular,
  IconFolderOpenRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { useMemoryFileMenu, type MemoryFileCommands } from './memory-file-actions.js';
import type { MemoryStandingUsage } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';
import { memoryFileTree, type MemoryFileNode } from './memory-file-tree-model.js';
import { IconButton } from './ds/icon-button.js';
import { border, color, radius, size, space, text } from './ds/tokens.stylex.js';

const styles = stylex.create({
  tree: { display: 'flex', flexDirection: 'column', gap: space.x1, minWidth: 0 },
  directory: { minWidth: 0 },
  item: {
    display: 'flex',
    alignItems: 'center',
    minWidth: 0,
    borderRadius: radius.sm,
    backgroundColor: { default: 'transparent', ':hover': color.hover },
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x2,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    width: '100%',
    minWidth: 0,
    minHeight: size.inlineIcon,
    paddingBlock: space.x1,
    paddingInline: space.x3,
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: radius.sm,
    backgroundColor: { default: 'transparent', ':hover': color.hover },
    color: color.fg,
    fontFamily: 'inherit',
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    textAlign: 'start',
    cursor: 'pointer',
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
    outlineOffset: '-2px',
  },
  selected: {
    backgroundColor: { default: color.navSelected, ':hover': color.navSelected },
  },
  chevron: {
    display: 'inline-flex',
    flexShrink: 0,
    width: '14px',
    transition: 'transform 150ms var(--ds-ease-in-out, ease)',
  },
  collapsed: { transform: 'rotate(-90deg)' },
  name: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  fixedName: { flexShrink: 0 },
  group: {
    marginInlineStart: space.x3,
    paddingInlineStart: space.x3,
    borderInlineStartWidth: border.hairline,
    borderInlineStartStyle: 'solid',
    borderInlineStartColor: color.divider,
  },
  more: {
    marginInlineEnd: space.x2,
    opacity: {
      default: 0,
      [stylex.when.ancestor(':hover')]: 1,
      [stylex.when.ancestor(':focus-within')]: 1,
      '@media (hover: none)': 1,
    },
  },
  standing: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: space.x2,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    minWidth: 0,
    color: color.subtle,
    fontSize: text.metaSize,
    fontVariantNumeric: 'tabular-nums',
  },
  standingTag: { display: 'inline-flex', flexShrink: 0 },
  usage: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  over: { color: color.danger },
});

function withSelectedAncestors(
  open: ReadonlySet<string>,
  selectedPath: string | undefined,
): Set<string> {
  const next = new Set(open);
  const parts = selectedPath?.split('/') ?? [];
  for (let index = 1; index < parts.length; index += 1) {
    next.add(parts.slice(0, index).join('/'));
  }
  return next;
}

function StandingBadge({
  usage,
  t,
}: {
  usage: MemoryStandingUsage;
  t: BotHarnessTranslate;
}): ReactElement {
  const over = usage.chars > usage.limit;
  const counts = {
    percent: Math.round((usage.chars / usage.limit) * 100),
    chars: usage.chars.toLocaleString('en-US'),
    limit: usage.limit.toLocaleString('en-US'),
  };
  return (
    <span
      data-standing={over ? 'over' : 'within'}
      title={t(usage.role === 'soul' ? 'standing.soulTitle' : 'standing.coreMemoryTitle')}
      {...stylex.props(styles.standing)}
    >
      <span {...stylex.props(styles.standingTag)}>
        <Tag tone="neutral">{t('standing.badge')}</Tag>
      </span>
      <span
        data-standing-usage=""
        title={t('standing.usageTitle', counts)}
        {...stylex.props(styles.usage, over && styles.over)}
      >
        {t('standing.usage', counts)}
      </span>
    </span>
  );
}

export function MemoryFileTree({
  paths,
  standing = [],
  actions,
  botSlug,
  selectedPath,
  onSelect,
  t,
}: {
  paths: readonly string[];
  standing?: readonly MemoryStandingUsage[];
  actions?: MemoryFileCommands;
  botSlug?: string | undefined;
  selectedPath: string | undefined;
  onSelect: ((path: string) => void) | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const menu = useMemoryFileMenu(actions, botSlug, t);
  const [selection, setSelection] = useState<{
    path: string | undefined;
    open: ReadonlySet<string>;
  }>({ path: selectedPath, open: withSelectedAncestors(new Set(), selectedPath) });
  let openPaths = selection.open;
  if (selection.path !== selectedPath) {
    const next = withSelectedAncestors(openPaths, selectedPath);
    openPaths = next;
    setSelection({ path: selectedPath, open: next });
  }

  const toggle = (path: string): void => {
    setSelection((current) => {
      const next = new Set(current.open);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return { ...current, open: next };
    });
  };
  const onTreeKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="treeitem"]')];
    const index = items.indexOf(target);
    if (index < 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      items[index + (event.key === 'ArrowDown' ? 1 : -1)]?.focus();
      return;
    }
    const path = target.dataset['path'];
    if (path === undefined) return;
    if (event.key === 'ArrowRight' && target.dataset['folder'] === 'true') {
      event.preventDefault();
      if (!openPaths.has(path)) toggle(path);
      else items[index + 1]?.focus();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (target.dataset['folder'] === 'true' && openPaths.has(path)) toggle(path);
      else {
        const parent = path.split('/').slice(0, -1).join('/');
        items.find((item) => item.dataset['path'] === parent)?.focus();
      }
    }
  };
  const more = (path: string): ReactElement | null =>
    actions === undefined || botSlug === undefined ? null : (
      <Tooltip label={t('fileAction.menu')} side="bottom" delayMs={500}>
        <IconButton
          size="inline"
          xstyle={styles.more}
          aria-label={t('fileAction.menu') + ': ' + path}
          aria-haspopup="menu"
          aria-expanded={menu.openPath === path}
          onClick={(event) => menu.open(path, event)}
        >
          <IconEllipsisOutlineRegular size={16} />
        </IconButton>
      </Tooltip>
    );
  const usageByPath = new Map(standing.map((usage) => [usage.path, usage]));
  const render = (nodes: readonly MemoryFileNode[]): ReactElement[] =>
    nodes.map((node) => {
      if (node.kind === 'file') {
        return (
          <div
            key={node.path}
            {...stylex.props(stylex.defaultMarker(), styles.item)}
            onContextMenu={(event) => menu.open(node.path, event)}
            onKeyDown={(event) => menu.onKey(node.path, event)}
          >
            <button
              type="button"
              role="treeitem"
              data-path={node.path}
              {...stylex.props(styles.row, selectedPath === node.path && styles.selected)}
              aria-selected={selectedPath === node.path}
              title={node.path}
              onClick={() => onSelect?.(node.path)}
            >
              <span aria-hidden="true" {...stylex.props(styles.chevron)} />
              <FileTypeIcon path={node.path} size={16} />
              <span {...stylex.props(styles.name, usageByPath.has(node.path) && styles.fixedName)}>
                {node.name}
              </span>
              {usageByPath.has(node.path) ? (
                <StandingBadge usage={usageByPath.get(node.path)!} t={t} />
              ) : null}
            </button>
            {more(node.path)}
          </div>
        );
      }
      const open = openPaths.has(node.path);
      return (
        <div key={node.path} {...stylex.props(styles.directory)}>
          <div
            {...stylex.props(stylex.defaultMarker(), styles.item)}
            onContextMenu={(event) => menu.open(node.path, event)}
            onKeyDown={(event) => menu.onKey(node.path, event)}
          >
            <button
              type="button"
              role="treeitem"
              data-path={node.path}
              data-folder="true"
              {...stylex.props(styles.row)}
              aria-expanded={open}
              title={node.path}
              onClick={() => toggle(node.path)}
            >
              <span
                aria-hidden="true"
                data-panel-chevron=""
                {...stylex.props(styles.chevron, !open && styles.collapsed)}
              >
                <IconChevronDownOutlineRegular size={14} />
              </span>
              {open ? <IconFolderOpenRegular size={16} /> : <IconFolderCloseRegular size={16} />}
              <span {...stylex.props(styles.name)}>{node.name}</span>
            </button>
            {more(node.path)}
          </div>
          {open ? (
            <div role="group" {...stylex.props(styles.group)}>
              {render(node.children)}
            </div>
          ) : null}
        </div>
      );
    });

  return (
    <div
      {...stylex.props(styles.tree)}
      role="tree"
      aria-label={t('entry.memoryFiles')}
      onKeyDown={onTreeKeyDown}
    >
      {render(
        memoryFileTree(
          paths,
          standing.map((usage) => usage.path),
        ),
      )}
      {menu.menu}
      {menu.feedback}
    </div>
  );
}
