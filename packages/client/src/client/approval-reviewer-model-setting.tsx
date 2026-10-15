import { useState, type ReactElement } from 'react';

import type { BridgeActions } from './actions.js';
import type { ApprovalReviewerModelView, ModelCatalogEntryView, ModelRouteView } from './bridge.js';
import { errorMessage } from './bridge.js';
import { Callout } from './ds/callout.js';
import { Note } from './ds/note.js';
import { Select } from './ds/select.js';
import { SettingsRow } from './ds/settings-row.js';
import type { BotHarnessTranslate } from './locale.js';
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
  const options = [
    { value: BOT, label: t('autoApproval.reviewerModel.followBot') },
    ...(current !== null && !known
      ? [
          {
            value: routeKey(current),
            label: t('autoApproval.reviewerModel.missing', {
              model: `${current.provider} / ${current.model}`,
            }),
          },
        ]
      : []),
    ...models.map((model) => ({
      value: routeKey(model),
      label:
        `${model.providerName} / ${model.modelName}` +
        (model.credential ? ' · ' + t('onboarding.needsKey') : ''),
    })),
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
        description={t('autoApproval.reviewerModel.description')}
        control={
          <Select
            label={t('autoApproval.reviewerModel.title')}
            value={current === null ? BOT : routeKey(current)}
            disabled={busy || view === undefined}
            options={options}
            onChange={choose}
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
