import { useState, useSyncExternalStore, type ReactElement } from 'react';

import type { BridgeActions } from './actions.js';
import { PersonaBotAvatar } from './avatar.js';
import {
  resolveChannelSidebarContext,
  type ChannelSidebarEntry,
  type ChannelSidebarEntryProps,
  type ChannelSidebarRegistry,
} from './channel-sidebar.js';
import { channelSidebarPrefs, type ChannelSidebarPrefs } from './channel-sidebar-prefs.js';
import { SettingsDialog } from './ds/settings-dialog.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import type { ClientState } from './store.js';
import {
  channelSettings,
  channelSettingsSectionKey,
  channelSettingsSections,
  type ChannelSettings,
} from './channel-settings-state.js';

const noop = (): void => {};

export function ChannelSettingsDialog({
  registry,
  state,
  actions,
  t,
  controller = channelSettings,
  prefs = channelSidebarPrefs,
}: {
  registry: ChannelSidebarRegistry;
  state: ClientState;
  actions: BridgeActions;
  t: BotHarnessTranslate;
  controller?: ChannelSettings;
  prefs?: ChannelSidebarPrefs;
}): ReactElement | null {
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const context = resolveChannelSidebarContext(state);
  const scope = context?.scope ?? 'channel';
  const entries = useSyncExternalStore(
    registry.subscribe,
    () => registry.entries(scope),
    () => registry.entries(scope),
  );
  const prefSnapshot = useSyncExternalStore(prefs.subscribe, prefs.getSnapshot, prefs.getSnapshot);
  const [refreshRevision, setRefreshRevision] = useState(0);
  const channel = context?.channel;
  const attention = useSyncExternalStore(
    controller.subscribe,
    () => controller.attentionOf(channel?.id),
    () => controller.attentionOf(channel?.id),
  );
  if (!snapshot.open || context === undefined || channel === undefined) return null;
  const sections = channelSettingsSections(entries, state);
  if (sections.length === 0) return null;
  const remembered = prefSnapshot.selectedTabs[channelSettingsSectionKey(scope)];
  const active =
    sections.find((section) => section.id === snapshot.sectionId) ??
    sections.find((section) => section.id === remembered) ??
    sections[0]!;
  const select = (id: string): void => {
    controller.select(id);
    prefs.setSelectedTab(channelSettingsSectionKey(scope), id);
  };
  const close = (): void => {
    controller.close();
  };
  const entryProps: ChannelSidebarEntryProps = {
    scope,
    channelId: channel.id,
    conversationRevision: state.conversation.revision,
    refreshRevision,
    requestRefresh: () => setRefreshRevision((value) => value + 1),
    botSlug: context.botSlug,
    actions,
    t,
    expanded: true,
    setExpanded: noop,
    setExpandable: noop,
  };
  const title =
    scope === 'personabot'
      ? t('channelSettings.titleBot', { name: channel.name })
      : t('channelSettings.titleGroup', { name: channel.name });
  const bot =
    scope === 'personabot'
      ? state.bots.find((candidate) => candidate.slug === context.botSlug)
      : undefined;
  const caption = (
    <div className="bh-channel-settings-caption" aria-label={title}>
      <span className="bh-channel-settings-caption-avatar" aria-hidden="true">
        {scope === 'personabot' ? (
          <PersonaBotAvatar
            t={t}
            personaBotId={context.botSlug ?? channel.id}
            name={channel.name}
            src={bot?.avatar}
            appearance={bot?.appearance}
            avatarSeed={bot?.avatarSeed}
            state="idle"
            still
            size={28}
          />
        ) : channel.avatar ? (
          <img className="bh-group-avatar-image" src={channel.avatar} alt="" />
        ) : (
          '#'
        )}
      </span>
      <span className="bh-channel-settings-caption-text">
        <span className="bh-channel-settings-caption-title" title={channel.name}>
          {channel.name}
        </span>
        <span className="bh-channel-settings-caption-kind">
          {scope === 'personabot'
            ? t('channelSettings.captionBot')
            : t('channelSettings.captionGroup')}
        </span>
      </span>
    </div>
  );
  const Section = active.component;
  const HeaderAction = active.headerAction;
  return (
    <SettingsDialog
      title={title}
      caption={caption}
      sections={sections.map((section) => ({
        id: section.id,
        label: section.label,
        attention: attention.includes(section.id),
      }))}
      activeId={active.id}
      onSelect={select}
      onClose={close}
      headerAction={HeaderAction === undefined ? undefined : <HeaderAction {...entryProps} />}
      labels={{
        nav: title,
        close: t('common.close'),
        picker: (section) => t('botSettings.picker', { section }),
        attention: t('channelSettings.needsAttention'),
      }}
      className="bh-root bh-channel-settings"
    >
      <Section {...entryProps} />
    </SettingsDialog>
  );
}

function AttentionProbe({
  section,
  props,
  controller,
}: {
  section: ChannelSidebarEntry;
  props: ChannelSidebarEntryProps;
  controller: ChannelSettings;
}): ReactElement | null {
  const { channelId } = props;
  const mount = useMountedResource<HTMLSpanElement>(
    () => () => controller.reportAttention(channelId, section.id, false),
    [controller, channelId, section.id],
  );
  const Probe = section.attention;
  if (Probe === undefined) return null;
  return (
    <span hidden ref={mount}>
      <Probe {...props} report={(on) => controller.reportAttention(channelId, section.id, on)} />
    </span>
  );
}

export function ChannelSettingsAttention({
  registry,
  state,
  actions,
  t,
  controller = channelSettings,
}: {
  registry: ChannelSidebarRegistry;
  state: ClientState;
  actions: BridgeActions;
  t: BotHarnessTranslate;
  controller?: ChannelSettings;
}): ReactElement | null {
  const context = resolveChannelSidebarContext(state);
  const scope = context?.scope ?? 'channel';
  const entries = useSyncExternalStore(
    registry.subscribe,
    () => registry.entries(scope),
    () => registry.entries(scope),
  );
  const channel = context?.channel;
  if (context === undefined || channel === undefined) return null;
  const props: ChannelSidebarEntryProps = {
    scope,
    channelId: channel.id,
    conversationRevision: state.conversation.revision,
    botSlug: context.botSlug,
    actions,
    t,
  };
  return (
    <>
      {channelSettingsSections(entries, state)
        .filter((section) => section.attention !== undefined)
        .map((section) => (
          <AttentionProbe
            key={`${channel.id}:${section.id}`}
            section={section}
            props={props}
            controller={controller}
          />
        ))}
    </>
  );
}
