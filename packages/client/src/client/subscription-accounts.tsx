import {
  ENGINE_IDS,
  isEngineId,
  type EngineId,
} from '@botharness/host-protocol/subscription-engine';
import { useMemo, useRef, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import { bridgeHost, BridgeCallError, type BridgeCall } from './bridge.js';
import { Button } from './ds/button.js';
import { IconButton } from './ds/icon-button.js';
import { Menu } from './ds/menu.js';
import { ConfirmDialog, FormDialog } from './ds/form-dialog.js';
import { Input } from './ds/input.js';
import { Note } from './ds/note.js';
import { ReadFailure } from './ds/read-failure.js';
import { PreviewChoices } from './ds/preview-choice.js';
import { SettingsRow, SettingsRows, SettingsSection } from './ds/settings-row.js';
import { space } from './ds/tokens.stylex.js';
import { Icon } from './ds/icon.js';
import { ink, radius, size, status as statusColor, type as typeScale } from './ds/tobs.stylex.js';
import {
  engineApi,
  engineModelKey,
  parseEngines,
  useSubscriptionEngines,
  type EngineStatusView,
} from './engine-choice.js';
import type { BotHarnessTranslate } from './locale.js';
import { EngineBrandIcon } from './model-brand.js';
import { engineAccountTitle, engineName, engineQuotaText } from './session-engine.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';
import { roleLabel } from './team-roles.js';
import { roleAllowsEngineAccount, type TeamRole } from './team-roles-bridge.js';

const styles = stylex.create({
  actions: { display: 'flex', justifyContent: 'end', flexWrap: 'wrap', gap: space.x2 },
  codeForm: { display: 'grid', gap: space.x2 },
  codeControls: { display: 'flex', flexWrap: 'wrap', gap: space.x2 },
  codeInput: { flexGrow: 1 },
  signInDetail: { display: 'grid', gap: space.x3 },
  signInLinks: { display: 'flex', flexWrap: 'wrap', gap: space.x2 },
  status: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x2,
    fontSize: typeScale.captionSize,
    lineHeight: typeScale.captionLine,
    fontWeight: typeScale.captionWeight,
    color: ink.secondary,
    whiteSpace: 'nowrap',
  },
  rowMain: { minHeight: size.rowMedium, alignItems: 'center' },
  titleLine: { display: 'flex', alignItems: 'center', gap: space.x3, minWidth: 0 },
  titleText: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  dot: {
    width: `calc(${space.x2} + ${space.x1})`,
    height: `calc(${space.x2} + ${space.x1})`,
    flexShrink: 0,
    borderRadius: radius.full,
  },
  success: { backgroundColor: statusColor.successBase },
  warning: { backgroundColor: statusColor.warningBase },
  danger: { backgroundColor: statusColor.dangerBase },
  neutral: { backgroundColor: ink.tertiary },
});

type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';

function StatusLabel({ tone, label }: { tone: StatusTone; label: string }): ReactElement {
  return (
    <span {...stylex.props(styles.status)} data-account-status={tone}>
      <span aria-hidden {...stylex.props(styles.dot, styles[tone])} />
      {label}
    </span>
  );
}

function AccountMenu({
  label,
  renameLabel,
  removeLabel,
  onRename,
  onRemove,
}: {
  label: string;
  renameLabel: string;
  removeLabel: string;
  onRename(): void;
  onRemove(): void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <Menu
      open={open}
      portal
      dense
      align="end"
      anchor={
        <IconButton
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <Icon name="ellipsis-vertical" />
        </IconButton>
      }
      items={[
        { id: 'rename', label: renameLabel },
        { id: 'remove', label: removeLabel, danger: true },
      ]}
      onSelect={(id) => {
        setOpen(false);
        if (id === 'rename') onRename();
        else onRemove();
      }}
      onClose={() => setOpen(false)}
    />
  );
}

function CopyLinkButton({ url, t }: { url: string; t: BotHarnessTranslate }): ReactElement {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const copy = () => {
    clearTimeout(timer.current);
    void navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true);
        timer.current = setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => setCopied(false));
  };
  return (
    <Button size="sm" variant="outline" onClick={copy}>
      {copied ? t('modelProviders.linkCopied') : t('modelProviders.copySignInLink')}
    </Button>
  );
}

type AccountDialog =
  | { kind: 'add'; revision: number }
  | { kind: 'rename' | 'remove'; revision: number; id: string; name: string; title: string };

function signInStatus(
  status: EngineStatusView,
  label: string,
  t: BotHarnessTranslate,
): { tone: StatusTone; label: string } {
  if (status.available) return { tone: 'success', label: t('modelProviders.signedIn') };
  switch (status.reason) {
    case 'not-installed':
      return { tone: 'neutral', label: t('engine.notInstalled', { engine: label }) };
    case 'signed-out':
      return { tone: 'neutral', label: t('modelProviders.signedOut') };
    case 'not-subscription':
      return { tone: 'danger', label: t('engine.notSubscription') };
    case 'host-not-local':
    case 'login-unknown':
      return { tone: 'warning', label: t('engine.loginUnknown') };
  }
}

function accountError(error: unknown, t: BotHarnessTranslate): string {
  if (error instanceof BridgeCallError) {
    switch (error.code) {
      case 'engine-account-conflict':
        return t('modelProviders.accountConflict');
      case 'engine-account-in-use':
        return t('modelProviders.accountInUse', { references: error.message });
      case 'engine-account-busy':
        return t('modelProviders.accountBusy');
      case 'permission-required':
        return t('modelProviders.forbidden');
    }
  }
  return t('modelProviders.accountWriteFailed');
}

function ClaudeSignInCode({
  call,
  id,
  t,
}: {
  call: BridgeCall;
  id: string;
  t: BotHarnessTranslate;
}): ReactElement {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string>();
  const sending = useRef(false);

  const send = async () => {
    if (sending.current || submitted || code.trim() === '') return;
    sending.current = true;
    setBusy(true);
    setError(undefined);
    setCode('');
    try {
      await bridgeHost(call).call('engineAccountSubmitCode', { id, code: code.trim() });
      setSubmitted(true);
    } catch (cause) {
      const reason = cause instanceof BridgeCallError ? cause.code : undefined;
      setError(
        t(
          reason === 'engine-code-not-requested'
            ? 'modelProviders.codeUnavailable'
            : reason === 'engine-login-not-pending'
              ? 'modelProviders.codeExpired'
              : reason === 'invalid-input'
                ? 'modelProviders.codeInvalid'
                : reason === 'permission-required'
                  ? 'modelProviders.forbidden'
                  : 'modelProviders.codeFailed',
        ),
      );
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  return (
    <form
      {...stylex.props(styles.codeForm)}
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <div {...stylex.props(styles.codeControls)}>
        <Input
          className={stylex.props(styles.codeInput).className}
          type="password"
          aria-label={t('modelProviders.authorizationCode')}
          placeholder={t('modelProviders.authorizationCode')}
          autoComplete="off"
          spellCheck={false}
          value={code}
          onChange={(event) => setCode(event.currentTarget.value)}
          disabled={busy || submitted}
        />
        <Button type="submit" variant="outline" disabled={busy || submitted || code.trim() === ''}>
          {t('modelProviders.submitCode')}
        </Button>
      </div>
      {submitted ? <Note>{t('modelProviders.codeSubmitted')}</Note> : null}
      {error === undefined ? null : <Note tone="danger">{error}</Note>}
    </form>
  );
}

export function SubscriptionAccounts({
  call,
  roles = [],
  t,
}: {
  call: BridgeCall;
  roles?: readonly TeamRole[];
  t: BotHarnessTranslate;
}): ReactElement {
  const api = useMemo(
    () => ({
      ...engineApi,
      async read() {
        return parseEngines(await bridgeHost(call).call('engineAccounts', {}));
      },
      login: (engine: EngineStatusView['engine'], accountId?: string) =>
        bridgeHost(call).call<{ url?: string }>('engineAccountLogin', { id: accountId ?? engine }),
      async cancelLogin(engine: EngineStatusView['engine'], accountId?: string) {
        await bridgeHost(call).call('engineAccountLoginCancel', { id: accountId ?? engine });
      },
    }),
    [call],
  );
  const engines = useSubscriptionEngines(true, api, false, true);
  const [dialog, setDialog] = useState<AccountDialog>();
  const [selectedEngine, setSelectedEngine] = useState<EngineId>('codex');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const revision = engines.view?.revision;
  const labels = { cancel: t('common.cancel'), close: t('common.close') };

  const open = (next: AccountDialog) => {
    setError(undefined);
    if (next.kind === 'add') setSelectedEngine('codex');
    setName(next.kind === 'add' ? '' : next.name);
    setDialog(next);
  };

  const save = async (current: AccountDialog) => {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    const expectedRevision = current.revision;
    try {
      const host = bridgeHost(call);
      if (current.kind === 'add')
        await host.call('engineAccountAdd', {
          engine: selectedEngine,
          name: name.trim(),
          expectedRevision,
        });
      else if (current.kind === 'rename')
        await host.call('engineAccountRename', {
          id: current.id,
          name: name.trim(),
          expectedRevision,
        });
      else {
        const removed = await host.call<{ homeCleanupPending?: true }>('engineAccountRemove', {
          id: current.id,
          expectedRevision,
          confirm: true,
        });
        if (removed.homeCleanupPending) setNotice(t('modelProviders.accountCleanupPending'));
      }
      setDialog(undefined);
      await engines.refresh();
    } catch (cause) {
      setError(accountError(cause, t));
      if (cause instanceof BridgeCallError && cause.code === 'engine-account-conflict')
        await engines.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsSection
      title={t('modelProviders.subscriptions')}
      action={
        revision === undefined ? undefined : (
          <Button variant="primary" onClick={() => open({ kind: 'add', revision })}>
            {t('modelProviders.addAccount')}
          </Button>
        )
      }
    >
      <div ref={engines.mount}>
        {engines.loadFailed ? (
          <ReadFailure retryLabel={t('engine.reload')} onRetry={() => void engines.refresh()}>
            {t('engine.loadFailed')}
          </ReadFailure>
        ) : engines.view === undefined ? (
          <Note>{t('modelProviders.loadingAccounts')}</Note>
        ) : engines.view.engines.length === 0 ? (
          <Note>{t('engine.localOnly')}</Note>
        ) : (
          <SidebarCardList label={t('modelProviders.subscriptions')}>
            {engines.view.engines.map((status) => {
              const { engine, accountId } = status;
              const brand = engineName(engine);
              const title = engineAccountTitle(engine, status.accountName);
              const key = engineModelKey(engine, accountId);
              const canManage = accountId !== undefined && revision !== undefined;
              const canSignIn = status.installed && !status.available;
              const signingIn = engines.signingIn === key;
              const roleNames = roles
                .filter(
                  (role) => accountId !== undefined && roleAllowsEngineAccount(role, accountId),
                )
                .map((role) => roleLabel(t, role));
              const state = signingIn
                ? { tone: 'warning' as const, label: t('engine.signingIn') }
                : signInStatus(status, brand, t);
              const edit = (kind: 'rename' | 'remove') =>
                canManage
                  ? open({
                      kind,
                      id: accountId,
                      name: status.accountName ?? brand,
                      title,
                      revision,
                    })
                  : undefined;
              return (
                <SidebarCardRow
                  key={key}
                  mainClassName={stylex.props(styles.rowMain).className}
                  leading={
                    <EngineBrandIcon brand={engine === 'codex' ? 'openai' : 'claude'} size={20} />
                  }
                  title={
                    <span {...stylex.props(styles.titleLine)}>
                      <span {...stylex.props(styles.titleText)}>{title}</span>
                      <StatusLabel tone={state.tone} label={state.label} />
                    </span>
                  }
                  summary={
                    roleNames.length === 0
                      ? undefined
                      : t('modelProviders.rolesAllowed', {
                          roles: roleNames.join(t('modelProviders.roleSeparator')),
                        })
                  }
                  meta={status.available ? engineQuotaText(status.quota, t) : undefined}
                  detail={
                    signingIn ? (
                      <div {...stylex.props(styles.signInDetail)}>
                        {engines.loginUrl === undefined ? null : (
                          <div {...stylex.props(styles.signInLinks)}>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                window.open(engines.loginUrl, '_blank', 'noopener,noreferrer')
                              }
                            >
                              {t('engine.openSignIn')}
                            </Button>
                            <CopyLinkButton url={engines.loginUrl} t={t} />
                          </div>
                        )}
                        {engine === 'claude' ? (
                          <ClaudeSignInCode call={call} id={accountId ?? engine} t={t} />
                        ) : null}
                      </div>
                    ) : undefined
                  }
                  trailing={
                    canManage || canSignIn ? (
                      <div {...stylex.props(styles.actions)}>
                        {signingIn ? (
                          <Button variant="outline" onClick={() => engines.cancelSignIn()}>
                            {t('modelProviders.cancelSignIn')}
                          </Button>
                        ) : canSignIn ? (
                          <Button
                            variant="outline"
                            disabled={engines.signingIn !== undefined}
                            aria-label={t('engine.signInLabel', { engine: title })}
                            onClick={() => engines.signIn(engine, accountId)}
                          >
                            {t('modelProviders.signIn')}
                          </Button>
                        ) : null}
                        {canManage ? (
                          <AccountMenu
                            label={t('modelProviders.accountActions', { name: title })}
                            renameLabel={t('modelProviders.renameAccount')}
                            removeLabel={t('modelProviders.remove')}
                            onRename={() => edit('rename')}
                            onRemove={() => edit('remove')}
                          />
                        ) : null}
                      </div>
                    ) : undefined
                  }
                />
              );
            })}
          </SidebarCardList>
        )}
        {engines.error === undefined ? null : (
          <Note tone="danger">{t('modelProviders.signInFailed')}</Note>
        )}
        {notice === undefined ? null : <Note tone="warning">{notice}</Note>}
      </div>
      {dialog === undefined ? null : dialog.kind === 'remove' ? (
        <ConfirmDialog
          title={t('modelProviders.removeTitle', { name: dialog.title })}
          description={t('modelProviders.removeAccountWarning')}
          labels={labels}
          confirmLabel={t('modelProviders.remove')}
          busy={busy}
          error={error}
          onCancel={() => setDialog(undefined)}
          onConfirm={() => void save(dialog)}
        />
      ) : (
        <FormDialog
          title={
            dialog.kind === 'add'
              ? t('modelProviders.addAccount')
              : t('modelProviders.renameAccountTitle', { name: dialog.title })
          }
          labels={labels}
          submitLabel={t('modelProviders.save')}
          busy={busy}
          error={error}
          submitDisabled={
            name.trim() === '' || (dialog.kind === 'rename' && name.trim() === dialog.name)
          }
          onCancel={() => setDialog(undefined)}
          onSubmit={() => void save(dialog)}
        >
          <SettingsRows>
            {dialog.kind === 'add' ? (
              <SettingsRow title={t('modelProviders.accountEngine')}>
                <PreviewChoices
                  variant="icon"
                  label={t('modelProviders.accountEngine')}
                  value={selectedEngine}
                  disabled={busy}
                  options={ENGINE_IDS.map((engine) => ({
                    id: engine,
                    label: engineName(engine),
                    preview: (
                      <EngineBrandIcon brand={engine === 'codex' ? 'openai' : 'claude'} size={28} />
                    ),
                    data: { 'data-engine-choice': engine },
                  }))}
                  onChange={(engine) => {
                    if (isEngineId(engine)) setSelectedEngine(engine);
                  }}
                />
              </SettingsRow>
            ) : null}
            <SettingsRow
              title={t('modelProviders.name')}
              control={
                <Input
                  aria-label={t('modelProviders.name')}
                  value={name}
                  maxLength={80}
                  onChange={(event) => setName(event.target.value)}
                  disabled={busy}
                />
              }
            />
          </SettingsRows>
        </FormDialog>
      )}
    </SettingsSection>
  );
}
