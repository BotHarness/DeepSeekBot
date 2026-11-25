import type {
  HostSessionRow,
  HostSessionSort,
  HostSessionSource,
} from '@botharness/host-protocol/host-sessions';
import { modelBrand, type ModelBrand } from '@botharness/host-client/shared/model-brand';
import { materialDrawer } from '../../ui/design/tokens';
import { folderColorIndex, folderMonogram, type SessionQueryRow } from './session-query-model';

export const SESSION_DRAWER_GROUPS = ['today', 'yesterday', 'earlier'] as const;
export type SessionDrawerGroup = (typeof SESSION_DRAWER_GROUPS)[number];

const DRAG_START = 24;
const VERTICAL_FAIL = 12;
const SETTLE_SHARE = 0.4;
const FLING = 500;

export function sessionDrawerWidth(windowWidth: number): number {
  return Math.max(0, windowWidth - materialDrawer.scrimGutter);
}

export const sessionDrawerSwipe = { activeX: DRAG_START, failY: VERTICAL_FAIL } as const;

export function settleSessionDrawer(progress: number, velocityX: number): boolean {
  'worklet';
  if (velocityX > FLING) return true;
  if (velocityX < -FLING) return false;
  return progress > SETTLE_SHARE;
}

function dayStart(now: number): number {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function rowTime(row: HostSessionRow, sort: HostSessionSort): number {
  if (row.sortedAt !== undefined) return row.sortedAt;
  return sort === 'last-human-turn' ? (row.lastPromptAt ?? row.updatedAt) : row.updatedAt;
}

export function sessionDrawerSections<Row extends HostSessionRow>(
  rows: readonly Row[],
  sort: HostSessionSort,
  now: number,
): { group: SessionDrawerGroup; data: Row[] }[] {
  const today = dayStart(now);
  const yesterday = dayStart(today - 1);
  const sections: { group: SessionDrawerGroup; data: Row[] }[] = [];
  let floor = 0;
  for (const row of rows) {
    const time = rowTime(row, sort);
    const own = time >= today ? 0 : time >= yesterday ? 1 : 2;
    floor = Math.max(floor, own);
    const group = SESSION_DRAWER_GROUPS[floor]!;
    const last = sections.at(-1);
    if (last?.group === group) last.data.push(row);
    else sections.push({ group, data: [row] });
  }
  return sections;
}

export function preselectedComputer(
  scope: string,
  computers: readonly { hostId: string; key: string }[],
  recent: string | undefined,
): string | undefined {
  return (
    computers.find((computer) => computer.key === scope)?.hostId ??
    computers.find((computer) => computer.hostId === recent)?.hostId ??
    computers[0]?.hostId
  );
}

export type SessionRowIdentity = {
  host?: { hostId: string; hostName: string };
  bot?: Extract<HostSessionSource, { kind: 'bot' }>;
  folder?: { name: string; monogram: string; colorIndex: number; path?: string };
  model?: { provider: string; model: string; brand?: ModelBrand };
};

export function sessionRowIdentity(
  row: SessionQueryRow,
  showHost: boolean,
  colorCount: number,
): SessionRowIdentity {
  const brand = row.model === undefined ? undefined : modelBrand(row.model);
  return {
    ...(showHost ? { host: { hostId: row.hostId, hostName: row.hostName } } : {}),
    ...(row.source.kind === 'bot' ? { bot: row.source } : {}),
    ...(row.folderName === undefined || row.folderName === ''
      ? {}
      : {
          folder: {
            name: row.folderName,
            monogram: folderMonogram(row.folderName),
            colorIndex: folderColorIndex(row.folderName, colorCount),
            ...(row.cwd === undefined ? {} : { path: row.cwd }),
          },
        }),
    ...(row.model === undefined
      ? {}
      : { model: { ...row.model, ...(brand === undefined ? {} : { brand }) } }),
  };
}
