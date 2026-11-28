import { useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import {
  readExternalContactAccess,
  type ExternalContactAccess,
  type HostExternalRole,
} from '@botharness/host-client/external-roles';
import { readMessagingSnapshot } from '@botharness/host-client/messaging';
import { bridgeHost, type BridgeCall } from '../bridge.js';
import { Button } from '../ds/button.js';
import { Icon } from '../ds/icon.js';
import { SettingsRow, SettingsSection } from '../ds/settings-row.js';
import { Tag } from '../ds/tag.js';
import { space } from '../ds/tobs.stylex.js';
import type { BotHarnessTranslate } from '../locale.js';
import { useMountedResource } from '../mounted-resource.js';
import { CONTACT_STATUS } from './external-role-model.js';
import type { BotEntry } from './external-roles-section.js';

const styles = stylex.create({
  tags: { display: 'flex', flexWrap: 'wrap', gap: space.x2, paddingBlockStart: space.x2 },
});

interface Holding {
  readonly slug: string;
  readonly access: ExternalContactAccess | undefined;
}

interface Contact {
  readonly key: string;
  readonly name: string;
  readonly account: string;
  readonly holdings: Holding[];
}

async function loadContacts(
  call: BridgeCall,
  role: HostExternalRole,
  slugs: readonly string[],
  signal: AbortSignal,
): Promise<Contact[]> {
  const host = bridgeHost(call, signal);
  const contacts = new Map<string, Contact>();
  await Promise.all(
    slugs.map(async (slug) => {
      const snapshot = await readMessagingSnapshot(host, slug, 'saved');
      const pairings = (snapshot.pairings ?? []).filter(
        (pairing) => pairing.roleId === role.id && pairing.status === 'approved',
      );
      await Promise.all(
        pairings.map(async (pairing) => {
          const access = await readExternalContactAccess(host, {
            slug,
            bindingId: pairing.bindingId,
            actorId: pairing.actorId,
          }).catch(() => undefined);
          const key = `${pairing.accountName}\u0000${pairing.actorId}`;
          const contact = contacts.get(key) ?? {
            key,
            name: pairing.actorName ?? pairing.actorId,
            account: pairing.accountName,
            holdings: [],
          };
          contact.holdings.push({ slug, access });
          contacts.set(key, contact);
        }),
      );
    }),
  );
  return [...contacts.values()].sort((left, right) => left.name.localeCompare(right.name));
}

export function ExternalRoleContacts({
  call,
  t,
  role,
  bots,
  botName,
}: {
  call: BridgeCall;
  t: BotHarnessTranslate;
  role: HostExternalRole;
  bots: readonly BotEntry[];
  botName: (slug: string) => string;
}): ReactElement {
  const [contacts, setContacts] = useState<readonly Contact[]>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const slugs = bots.map((bot) => bot.slug);
  const mount = useMountedResource<HTMLDivElement>(() => {
    const controller = new AbortController();
    void loadContacts(call, role, slugs, controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        setContacts(next);
        setFailed(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [call, role.id, role.revision, slugs.join('\u0000'), attempt]);
  return (
    <div ref={mount} data-external-role-contacts="">
      <SettingsSection
        title={t('team.externalRoles.contacts')}
        description={t('team.externalRoles.contactsHint')}
      >
        {failed ? (
          <SettingsRow
            title={t('team.error.load')}
            control={
              <Button size="sm" variant="outline" onClick={() => setAttempt((value) => value + 1)}>
                {t('team.workbench.retry')}
              </Button>
            }
          />
        ) : contacts === undefined ? (
          <SettingsRow title={t('team.workbench.loading')} />
        ) : contacts.length === 0 ? (
          <SettingsRow title={t('team.externalRoles.noContacts')} />
        ) : (
          contacts.map((contact) => (
            <SettingsRow
              key={contact.key}
              icon={<Icon name="user" />}
              title={contact.name}
              description={contact.account}
              data={{ 'data-external-role-contact': contact.name }}
            >
              <span {...stylex.props(styles.tags)}>
                {contact.holdings.map((holding) => {
                  const status = holding.access?.status ?? 'unavailable';
                  const look = CONTACT_STATUS[status];
                  return (
                    <Tag
                      key={holding.slug}
                      tone={look.tone}
                      data-external-role-contact-status={status}
                    >
                      {t('team.externalRoles.contactOnBot', {
                        bot: botName(holding.slug),
                        status: t(look.label),
                      })}
                    </Tag>
                  );
                })}
              </span>
            </SettingsRow>
          ))
        )}
      </SettingsSection>
    </div>
  );
}
