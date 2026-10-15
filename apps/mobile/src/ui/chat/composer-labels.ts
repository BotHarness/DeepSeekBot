import {
  currentModel,
  type BotModel,
  type Loadable,
  type WorkspaceGrant,
} from '../../host/bot-settings';
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
