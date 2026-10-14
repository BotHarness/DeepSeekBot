import { toBlob } from 'html-to-image';

const SNAPSHOT_STRIP =
  '.bh-bubble-check, .bh-bubble-side, .bh-bubble-failed-action, [data-message-fold-toggle]';

function snapshotGroup(group: Element, selected: ReadonlySet<string>): HTMLElement | undefined {
  const copy = group.cloneNode(true) as HTMLElement;
  let kept = 0;
  for (const wrap of Array.from(copy.querySelectorAll<HTMLElement>('.bh-bubble-wrap'))) {
    const id = wrap.dataset['messageId'];
    if (id === undefined || !selected.has(id)) {
      wrap.remove();
      continue;
    }
    kept += 1;
    wrap.classList.remove('bh-bubble-selecting', 'bh-bubble-focused');
    for (const name of ['role', 'aria-checked', 'tabindex', 'data-selected'])
      wrap.removeAttribute(name);
  }
  if (kept === 0) return undefined;
  for (const node of Array.from(copy.querySelectorAll(SNAPSHOT_STRIP))) node.remove();
  for (const fold of Array.from(copy.querySelectorAll<HTMLElement>('[data-message-fold]'))) {
    fold.style.maxHeight = 'none';
    fold.style.overflow = 'visible';
    fold.style.maskImage = 'none';
  }
  return copy;
}

export function buildMessageSnapshot(
  timeline: Element,
  ids: readonly string[],
  title: string,
  caption: string,
): HTMLElement | undefined {
  const selected = new Set(ids);
  const groups = Array.from(timeline.querySelectorAll('.bh-message-group')).flatMap((group) => {
    const copy = snapshotGroup(group, selected);
    return copy === undefined ? [] : [copy];
  });
  if (groups.length === 0) return undefined;
  const sheet = document.createElement('div');
  sheet.className = 'bh-snapshot';
  sheet.dataset['messageSnapshot'] = '';
  sheet.style.width = `${Math.max(360, Math.min(timeline.clientWidth, 880))}px`;
  const header = document.createElement('div');
  header.className = 'bh-snapshot-header';
  const name = document.createElement('strong');
  name.textContent = title;
  const note = document.createElement('span');
  note.textContent = caption;
  header.append(name, note);
  const body = document.createElement('div');
  body.className = 'bh-snapshot-body';
  body.append(...groups);
  sheet.append(header, body);
  return sheet;
}

export async function renderMessageSnapshot(
  host: Element,
  sheet: HTMLElement,
): Promise<Blob | undefined> {
  host.append(sheet);
  try {
    const background = getComputedStyle(sheet).backgroundColor;
    return (
      (await toBlob(sheet, {
        pixelRatio: Math.min(Math.max(window.devicePixelRatio, 2), 3),
        backgroundColor: background,
        skipFonts: true,
        cacheBust: false,
        style: { position: 'static', left: 'auto', top: 'auto', margin: '0' },
      })) ?? undefined
    );
  } finally {
    sheet.remove();
  }
}
