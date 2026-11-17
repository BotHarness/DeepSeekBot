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
  const { name } = currentModel(model.value);
  if (name !== undefined) return name;
  return model.value.repair === undefined ? t.noModel : t.contextUnavailable;
}

export function workspaceLabel(grants: Loadable<WorkspaceGrant[]>): string {
  if (grants.status === 'loading') return t.contextLoading;
  if (grants.status === 'failed') return t.contextUnavailable;
  return t.folderCount(grants.value.length);
}

export interface HeaderModel {
  brand: ModelBrand | undefined;
  short: string;
  name: string;
}

export function headerModel(model: Loadable<BotModel>): HeaderModel | undefined {
  if (model.status !== 'ready') return undefined;
  const { route, name } = currentModel(model.value);
  if (route === undefined || name === undefined) return undefined;
  const brand = modelBrand({ provider: route.provider, model: route.model, name });
  return { brand, short: modelShortName(name, brand), name };
}
