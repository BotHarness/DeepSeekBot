import { useState, type ReactElement } from 'react';

import type { BridgeActions } from './actions.js';
import type { ApprovalReviewerModelView, ModelCatalogEntryView, ModelRouteView } from './bridge.js';
import { errorMessage } from './bridge.js';
import { Callout } from './ds/callout.js';
import { Icon } from './ds/icon.js';
import { Note } from './ds/note.js';
import { SettingsRow } from './ds/settings-row.js';
import type { BotHarnessTranslate } from './locale.js';
import { catalogMenuItems, type ModelMenuItem } from './model-menu.js';
import { ModelTrigger } from './model-trigger.js';
import { useMountedResource } from './mounted-resource.js';

const BOT = 'bot';

function routeKey(route: Pick<ModelRouteView, 'provider' | 'model'>): string {
  return JSON.stringify([route.provider, route.model]);
}

export function ApprovalReviewerModelSetting({
  actions,
  t,
}: {
  actions: Pick<
    BridgeActions,
    'approvalReviewerModel' | 'setApprovalReviewerModel' | 'modelCatalog'
  >;
  t: BotHarnessTranslate;
}): ReactElement | null {
  const [view, setView] = useState<ApprovalReviewerModelView>();
  const [models, setModels] = useState<ModelCatalogEntryView[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const mount = useMountedResource<HTMLDivElement>(() => {
    if (actions.approvalReviewerModel === undefined) return;
    void Promise.all([actions.approvalReviewerModel(), actions.modelCatalog()])
      .then(([next, catalog]) => {
        setView(next);
        setModels(catalog.models);
      })
      .catch((cause: unknown) => setError(errorMessage(cause)));
  }, [actions]);
  if (actions.approvalReviewerModel === undefined || actions.setApprovalReviewerModel === undefined)
    return null;
  const set = actions.setApprovalReviewerModel;
  const current = view?.model ?? null;
  const known = current !== null && models.some((model) => routeKey(model) === routeKey(current));
  const items: ModelMenuItem[] = [
    {
      value: BOT,
      label: t('autoApproval.reviewerModel.followBot'),
      brand: undefined,
      name: t('autoApproval.reviewerModel.followBot'),
    },
    ...(current !== null && !known
      ? [
          {
            value: routeKey(current),
            label: t('autoApproval.reviewerModel.missing', {
              model: `${current.provider} / ${current.model}`,
            }),
            name: `${current.provider} / ${current.model}`,
            brand: undefined,
          },
        ]
      : []),
    ...catalogMenuItems(models, t),
  ];
  const choose = (value: string): void => {
    if (busy) return;
    const [provider, model] = value === BOT ? [] : (JSON.parse(value) as [string, string]);
    setBusy(true);
    setError(undefined);
    void set(provider === undefined || model === undefined ? null : { provider, model })
      .then(setView)
      .catch((cause: unknown) => setError(errorMessage(cause)))
      .finally(() => setBusy(false));
  };
  return (
    <>
      <SettingsRow
        rootRef={mount}
        data={{ 'data-approval-reviewer-model': '' }}
        title={t('autoApproval.reviewerModel.title')}
        icon={<Icon name="shield-check" />}
        description={t('autoApproval.reviewerModel.description')}
        control={
          <ModelTrigger
            label={t('autoApproval.reviewerModel.title')}
            items={items}
            value={current === null ? BOT : routeKey(current)}
            placeholder={t('autoApproval.reviewerModel.followBot')}
            disabled={busy || view === undefined}
            onSelect={choose}
            t={t}
          />
        }
      />
      {view?.follows === 'invalid' || view?.available === false ? (
        <Callout tone="warning" role="status" title={t('autoApproval.reviewerModel.unavailable')}>
          {view.unavailableReason ?? null}
        </Callout>
      ) : null}
      {error === undefined ? null : (
        <Note tone="danger" inset>
          {error}
        </Note>
      )}
    </>
  );
}
