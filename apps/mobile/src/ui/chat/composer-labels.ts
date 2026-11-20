import { sessionHeaderTargetLabel } from '@botharness/host-client/turn-target';
import {
  currentModel,
  type BotModel,
  type Loadable,
  type WorkspaceGrant,
} from '@botharness/host-client/bot-settings';
import {
  modelBrand,
  modelShortName,
  type ModelBrand,
} from '@botharness/host-client/shared/model-brand';
import { t } from '../strings';

export function modelLabel(model: Loadable<BotModel>): string {
  if (model.status === 'loading') return t.contextLoading;
  if (model.status === 'failed') return t.contextUnavailable;
  const display = headerModel(model);
  if (display !== undefined) return display.name;
  return model.value.repair === undefined ? t.noModel : t.contextUnavailable;
}

export function workspaceLabel(grants: Loadable<WorkspaceGrant[]>): string {
  if (grants.status === 'loading') return t.contextLoading;
  if (grants.status === 'failed') return t.contextUnavailable;
  return t.folderCount(grants.value.length);
}

export type HeaderModel = { short: string; name: string } & (
  | { external: true; brand: ModelBrand }
  | { external?: false; brand: ModelBrand | undefined }
);

export function headerModel(model: Loadable<BotModel>): HeaderModel | undefined {
  if (model.status !== 'ready') return undefined;
  const { route, name, group } = currentModel(model.value);
  const target = model.value.currentTarget;
  if (target !== undefined && (target.kind === 'engine' || group !== undefined))
    return sessionHeaderTargetLabel(target, model.value.models);
  if (group !== undefined) {
    return { brand: undefined, short: group, name: group };
  }
  if (route === undefined || name === undefined) return undefined;
  const brand = modelBrand({ provider: route.provider, model: route.model, name });
  return { brand, short: modelShortName(name, brand), name };
}

export function modelEntryLabel(entry: {
  provider: string;
  model: string;
  modelName: string;
}): HeaderModel {
  const brand = modelBrand({ provider: entry.provider, model: entry.model, name: entry.modelName });
  return { brand, short: modelShortName(entry.modelName, brand), name: entry.modelName };
}

export function modelFamilyKey(entry: { provider: string; model: string; modelName: string }) {
  return modelEntryLabel(entry).brand ?? 'other';
}

function restTime(until: string): string {
  return new Date(until).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function restingLabel(until: string): string {
  return t.modelSettings.resting(restTime(until));
}

export function restingNotice(
  name: string,
  row: { restingUntil?: string | undefined; credential?: string | undefined },
): string | undefined {
  if (row.restingUntil === undefined || row.credential !== undefined) return undefined;
  return t.modelSettings.restingTap(name, restTime(row.restingUntil));
}
