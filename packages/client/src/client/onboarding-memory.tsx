import {
  createContext,
  useContext,
  useId,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from 'react';
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives';
import type { BridgeActions } from './actions.js';
import type { MemoryWorkingChange } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';
import { MemoryEntry } from './memory-entry.js';
import { MemoryFilesEntry } from './memory-files-entry.js';
import { Modal } from './modal.js';
import { onboardingFor } from './onboarding.js';
import { useMountedResource } from './mounted-resource.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';
import { store } from './store.js';

export const OnboardingMemoryNavigation = createContext<
  | {
      file(path: string): void;
      commit(sha: string): void;
      working(change: MemoryWorkingChange): void;
    }
  | undefined
>(undefined);

export function OnboardingMemory({
  actions,
  channelId,
  t,
}: {
  actions: BridgeActions;
  channelId: string;
  t: BotHarnessTranslate;
}): ReactElement | null {
  const navigation = useContext(OnboardingMemoryNavigation);
  const controller = onboardingFor(actions);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<'overview' | 'files' | 'changes' | 'preference'>('overview');
  const [preference, setPreference] = useState('');
  const inputId = useId();
  const client = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const channel = client.conversation.channel;
  const experienceMount = useMountedResource<HTMLSpanElement>(() => {
    if (!controller.consumeExperience('memory')) return;
    setPreference('');
    setPage('preference');
    setOpen(true);
  }, [state.experience]);
  if (
    !navigation ||
    !state.receipt?.completed ||
    channel?.id !== channelId ||
    channel.type !== 'dm' ||
    !channel.botSlug ||
    !client.bots.some((bot) => bot.slug === channel.botSlug && !bot.paused && !bot.deleted)
  )
    return null;
  const close = (): void => setOpen(false);
  const entry = {
    scope: 'personabot' as const,
    channelId,
    botSlug: channel.botSlug,
    actions,
    t,
    onMemoryFileSelect: (path: string): void => {
      close();
      navigation.file(path);
    },
    onMemoryCommitSelect: (sha: string): void => {
      close();
      navigation.commit(sha);
    },
    onMemoryWorkingSelect: (change: MemoryWorkingChange): void => {
      close();
      navigation.working(change);
    },
  };
  return (
    <>
      <span ref={experienceMount} hidden />
      <Button
        variant="outline"
        onClick={() => {
          controller.pauseGuide();
          setPage('overview');
          setOpen(true);
        }}
      >
        {t('onboarding.memory.explore')}
      </Button>
      {open ? (
        <Modal
          open
          title={t('onboarding.memory.title')}
          closeLabel={t('common.close')}
          onClose={close}
          footer={
            <>
              {page === 'overview' ? null : (
                <Button variant="ghost" onClick={() => setPage('overview')}>
                  {t('onboarding.memory.back')}
                </Button>
              )}
              <Button variant="outline" onClick={close}>
                {t('onboarding.memory.notNow')}
              </Button>
              {page === 'preference' ? (
                <Button
                  variant="primary"
                  disabled={!preference.trim() || state.busy || client.conversation.sending}
                  onClick={() => {
                    const body = t('onboarding.memory.request', { preference: preference.trim() });
                    close();
                    void controller.request(channelId, body);
                  }}
                >
                  {t('onboarding.memory.send')}
                </Button>
              ) : null}
            </>
          }
        >
          <div className="bh-root bh-onboarding-model-form">
            <p className="bh-note">{t('onboarding.memory.truth')}</p>
            {page === 'overview' ? (
              <>
                <p>{t('onboarding.memory.description')}</p>
                <SidebarCardList label={t('onboarding.memory.title')}>
                  <SidebarCardRow
                    icon="files"
                    title={t('entry.memoryFiles')}
                    meta={t('onboarding.memory.filesHint')}
                    onClick={() => setPage('files')}
                  />
                  <SidebarCardRow
                    icon="messages-square"
                    title={t('onboarding.memory.preference')}
                    meta={t('onboarding.memory.preferenceHint')}
                    onClick={() => setPage('preference')}
                  />
                  <SidebarCardRow
                    icon="git-branch"
                    title={t('onboarding.memory.changes')}
                    meta={t('onboarding.memory.changesHint')}
                    onClick={() => setPage('changes')}
                  />
                </SidebarCardList>
              </>
            ) : page === 'files' ? (
              <MemoryFilesEntry {...entry} showLimits={false} />
            ) : page === 'changes' ? (
              <MemoryEntry {...entry} showFiles={false} />
            ) : (
              <>
                <label htmlFor={inputId}>{t('onboarding.memory.preference')}</label>
                <Input
                  id={inputId}
                  value={preference}
                  placeholder={t('onboarding.memory.example')}
                  onChange={(event) => setPreference(event.target.value)}
                />
                <p className="bh-note">{t('onboarding.memory.sendHint')}</p>
              </>
            )}
          </div>
        </Modal>
      ) : null}
    </>
  );
}
