import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { DockDirection } from './channel-dock-layout.js';
import {
  CHANNEL_LEAVES,
  MESSAGE_LEAF,
  moveChannelSplit,
  resizeChannelSplit,
  splitPanels,
  type ChannelSplit,
} from './channel-split-layout.js';

const DRAG_TYPE = 'application/x-bh-channel-subpanel';

export function ChannelWorkspace({
  channelId,
  tree,
  setTree,
  panels,
}: {
  channelId: string | undefined;
  tree: ChannelSplit;
  setTree(next: ChannelSplit): void;
  panels: Readonly<Record<string, { label: string; header?: ReactNode; content: ReactNode }>>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const drag = useRef<{ channel: string; panel: string } | undefined>(undefined);
  const [drop, setDrop] = useState<{ target: string; direction: DockDirection }>();
  const [containers] = useState(
    () =>
      new Map(
        CHANNEL_LEAVES.map((id) => {
          const node = document.createElement('div');
          node.className = 'bh-channel-leaf-content';
          return [id, node];
        }),
      ),
  );
  useLayoutEffect(() => {
    for (const [id, container] of containers) {
      const slot = host.current?.querySelector(`[data-channel-leaf="${id}"]`);
      if (slot && container.parentElement !== slot) slot.append(container);
      else if (!slot) container.remove();
    }
  });
  const directionAt = (node: HTMLElement, x: number, y: number): DockDirection => {
    const box = node.getBoundingClientRect();
    const dx = (x - box.left) / box.width,
      dy = (y - box.top) / box.height;
    return Math.min(dx, 1 - dx) < Math.min(dy, 1 - dy)
      ? dx < 0.5
        ? 'left'
        : 'right'
      : dy < 0.5
        ? 'above'
        : 'below';
  };
  const visible = (node: ChannelSplit): boolean =>
    splitPanels(node).some((id) => panels[id] !== undefined);
  function render(node: ChannelSplit, path: string): ReactNode {
    if ('panel' in node) {
      if (!panels[node.panel]) return null;
      return (
        <div className="bh-channel-leaf" data-channel-leaf={node.panel}>
          {drop?.target === node.panel && (
            <div
              className="bh-channel-drop-preview"
              data-drop-side={drop.direction}
              aria-hidden="true"
            />
          )}
        </div>
      );
    }
    const firstVisible = visible(node.first),
      secondVisible = visible(node.second);
    if (!firstVisible) return render(node.second, path + '1');
    if (!secondVisible) return render(node.first, path + '0');
    const vertical = node.axis === 'vertical';
    return (
      <div
        className="bh-channel-workspace"
        data-workspace-split={path}
        data-split-axis={node.axis}
        style={{ flexDirection: vertical ? 'column' : 'row' }}
      >
        <div className="bh-channel-branch" style={{ flex: `${node.ratio} 1 0` }}>
          {render(node.first, path + '0')}
        </div>
        <div
          className="bh-channel-session-divider"
          role="separator"
          tabIndex={0}
          aria-label={splitPanels(node.second)
            .filter((id) => panels[id])
            .map((id) => panels[id]!.label)
            .join(', ')}
          aria-orientation={vertical ? 'horizontal' : 'vertical'}
          aria-valuemin={20}
          aria-valuemax={80}
          aria-valuenow={Math.round(node.ratio * 100)}
          onKeyDown={(event) => {
            const keys = vertical ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight'];
            if (!keys.includes(event.key)) return;
            event.preventDefault();
            setTree(
              resizeChannelSplit(tree, path, node.ratio + (event.key === keys[1] ? 0.02 : -0.02)),
            );
          }}
          onPointerDown={(event) => {
            if (event.button === 0) {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
            }
          }}
          onPointerMove={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
            const box = event.currentTarget.parentElement!.getBoundingClientRect();
            setTree(
              resizeChannelSplit(
                tree,
                path,
                vertical
                  ? (event.clientY - box.top) / box.height
                  : (event.clientX - box.left) / box.width,
              ),
            );
          }}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          }}
        />
        <div className="bh-channel-branch" style={{ flex: `${1 - node.ratio} 1 0` }}>
          {render(node.second, path + '1')}
        </div>
      </div>
    );
  }
  return (
    <div
      ref={host}
      className="bh-channel-workspace-root"
      data-channel-workspace={channelId}
      onDragOver={(event) => {
        const leaf = (event.target as Element).closest<HTMLElement>('[data-channel-leaf]');
        const target = leaf?.dataset.channelLeaf;
        if (
          !leaf ||
          !target ||
          !event.dataTransfer.types.includes(DRAG_TYPE) ||
          drag.current?.channel !== channelId ||
          drag.current?.panel === target
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'move';
        setDrop({ target, direction: directionAt(leaf, event.clientX, event.clientY) });
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDrop(undefined);
      }}
      onDrop={(event) => {
        const leaf = (event.target as Element).closest<HTMLElement>('[data-channel-leaf]');
        const target = leaf?.dataset.channelLeaf;
        if (
          !leaf ||
          !target ||
          drag.current?.channel !== channelId ||
          !drag.current ||
          event.dataTransfer.getData(DRAG_TYPE) !== drag.current.panel
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        setTree(
          moveChannelSplit(
            tree,
            drag.current.panel,
            target,
            directionAt(leaf, event.clientX, event.clientY),
          ),
        );
        drag.current = undefined;
        setDrop(undefined);
      }}
    >
      {render(tree, '')}
      {Object.entries(panels).map(([id, panel]) =>
        createPortal(
          id === MESSAGE_LEAF ? (
            panel.content
          ) : (
            <section
              className="bh-channel-session-host"
              aria-label={panel.label}
              data-channel-subpanel={id}
            >
              <div
                className="bh-channel-session-header"
                draggable={!!channelId}
                onDragStart={(event) => {
                  if (!channelId || (event.target as Element).closest('button, [role="tab"]')) {
                    event.preventDefault();
                    return;
                  }
                  event.stopPropagation();
                  drag.current = { channel: channelId, panel: id };
                  event.dataTransfer.setData(DRAG_TYPE, id);
                  event.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={() => {
                  drag.current = undefined;
                  setDrop(undefined);
                }}
              >
                {panel.header}
              </div>
              {panel.content}
            </section>
          ),
          containers.get(id)!,
          id,
        ),
      )}
    </div>
  );
}
