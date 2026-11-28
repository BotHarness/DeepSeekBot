import * as stylex from '@stylexjs/stylex';
import { useState, type ReactElement } from 'react';

import type { ConnectorRequestView } from '@botharness/host-client/shared/connector-request';
import { MaskedEmail } from './account-quota.js';
import { hooked } from './ds/hooked.js';
import { requestCardStyles as styles } from './ds/request-card.js';
import { Tag } from './ds/tag.js';
import { space } from './ds/tobs.stylex.js';
import type { ConnectorActions } from './features/connectors/bridge.js';
import { ConnectorLogo } from './features/connectors/logos.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import type { ToolApprovalRequestCard } from './store.js';

const local = stylex.create({
  title: { display: 'flex', alignItems: 'center', gap: space.x2, minWidth: 0 },
  account: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.x2,
  },
  who: { display: 'grid', gap: space.x1, minWidth: 0 },
  tags: { display: 'flex', flexWrap: 'wrap', gap: space.x1 },
});

type Account = NonNullable<ConnectorRequestView['account']>;

export function connectorRequestOf(
  request: Pick<ToolApprovalRequestCard, 'toolName' | 'input' | 'connectorRequest'>,
): ConnectorRequestView | undefined {
  if (request.toolName !== 'connector_request') return undefined;
  if (request.connectorRequest !== undefined) return request.connectorRequest;
  let args: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(request.input);
    if (typeof parsed === 'object' && parsed !== null) args = parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
  const service = typeof args['service'] === 'string' ? args['service'] : '';
  const accountId = typeof args['account_id'] === 'string' ? args['account_id'] : undefined;
  return {
    service,
    name: service,
    access: args['access'] === 'write' ? 'write' : 'read',
    reason: typeof args['reason'] === 'string' ? args['reason'] : '',
    ...(accountId === undefined
      ? {}
      : { account: { accountId, label: '', holder: 'shared' as const } }),
  };
}

export function ConnectorRequestSubject({
  request,
  live,
  actions,
  onReady,
  t,
}: {
  request: ConnectorRequestView;
  live: boolean;
  actions: Pick<ConnectorActions, 'connectors' | 'connectorLogos'>;
  onReady: (ready: boolean) => void;
  t: BotHarnessTranslate;
}): ReactElement {
  const [found, setFound] = useState<Account | undefined>();
  const account = request.account ?? found;
  const watch = useMountedResource<HTMLDivElement>(() => {
    if (request.account !== undefined || !live || actions.connectors === undefined) return;
    let active = true;
    const check = () => {
      actions.connectors?.().then(
        (view) => {
          if (!active) return;
          const matches = view.accounts.filter(
            (entry) => entry.service === request.service && entry.status === 'active',
          );
          const only = matches.length === 1 ? matches[0]! : undefined;
          setFound(
            only === undefined
              ? undefined
              : {
                  accountId: only.accountId,
                  label: only.label,
                  ...(only.identity === undefined ? {} : { identity: only.identity }),
                  holder: 'shared',
                },
          );
          onReady(only !== undefined);
        },
        () => undefined,
      );
    };
    check();
    window.addEventListener('focus', check);
    return () => {
      active = false;
      window.removeEventListener('focus', check);
    };
  }, [actions, live, request.account, request.service]);
  const name = request.name === '' ? t('approval.category.connector') : request.name;
  return (
    <div ref={watch} {...hooked('bh-request-summary', styles.group)} data-connector-request="">
      <span {...hooked('bh-tool-approval-sentence', styles.prompt, local.title)}>
        {request.service === '' ? null : (
          <ConnectorLogo service={request.service} size={20} logos={actions.connectorLogos} />
        )}
        {t(account === undefined ? 'approval.connector.connect' : 'approval.connector.use', {
          name,
        })}
      </span>
      {account === undefined || account.label === '' ? null : (
        <div {...hooked('bh-connector-request-account', styles.well, local.account)}>
          <span {...stylex.props(local.who)}>
            <span {...stylex.props(styles.preview)}>{account.label}</span>
            {account.identity === undefined ? null : (
              <span {...stylex.props(styles.caption)}>
                {account.identity.includes('@') ? (
                  <MaskedEmail email={account.identity} t={t} />
                ) : (
                  account.identity
                )}
              </span>
            )}
          </span>
          <span {...stylex.props(local.tags)}>
            <Tag tone={request.access === 'write' ? 'warning' : 'neutral'}>
              {t(
                request.access === 'write' ? 'approval.connector.write' : 'approval.connector.read',
              )}
            </Tag>
            <Tag tone="quiet">
              {t(
                account.holder === 'bot'
                  ? 'approval.connector.botOwn'
                  : 'approval.connector.shared',
              )}
            </Tag>
          </span>
        </div>
      )}
      {request.reason === '' ? null : (
        <span {...hooked('bh-connector-request-reason', styles.caption)}>{request.reason}</span>
      )}
    </div>
  );
}
