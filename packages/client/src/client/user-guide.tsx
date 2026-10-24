import { store } from './store.js';
import { useState, useSyncExternalStore, type ReactElement } from 'react';
import {
  Button,
  Input,
  IconChevronDownOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { ClientHelpService, HelpText } from '../help-api.js';
import type { DockPanel, DockPanelHost } from './dock-panels.js';
import { Note } from './ds/note.js';
import { Select } from './ds/select.js';
import type { BotHarnessTranslate } from './locale.js';

export const USER_GUIDE_PANEL = 'user-guide';
export const helpText = (value: HelpText, t: BotHarnessTranslate): string =>
  t('guide.language') === 'zh' ? (value.zh ?? value.en) : value.en;

export function createUserGuidePanel(
  help: ClientHelpService,
  panels: DockPanelHost,
  t: BotHarnessTranslate,
): DockPanel {
  return {
    id: USER_GUIDE_PANEL,
    title: t('guide.title'),
    icon: 'info',
    scope: 'global',
    order: 900,
    defaultPosition: { zone: 'right' },
    component: () => <UserGuide help={help} panels={panels} t={t} />,
  };
}
function UserGuide({
  help,
  panels,
  t,
}: {
  help: ClientHelpService;
  panels: DockPanelHost;
  t: BotHarnessTranslate;
}): ReactElement {
  useSyncExternalStore(store.subscribe, store.getSnapshot);
  const topics = useSyncExternalStore(help.subscribe, help.topics);
  const state = useSyncExternalStore(help.subscribe, help.state);
  const registered = useSyncExternalStore(panels.subscribe, panels.panels);
  const [query, setQuery] = useState('');
  const [topicId, setTopic] = useState('');
  const [selected, select] = useState<string>();
  const [notice, setNotice] = useState('');
  const [target, setTarget] = useState('');
  const [preserved, setPreserved] = useState(false);
  const [busy, setBusy] = useState(false);
  const topic = topics.find((item) => item.id === topicId);
  const questions = help
    .search(query)
    .filter((q) => !topicId || topic?.questions.some((item) => item.id === q.id));
  const answer = topics.flatMap((item) => item.questions).find((q) => q.id === selected);
  const availability = answer ? help.availability(answer.id) : undefined;
  const run = (action: () => Promise<void>) => {
    setBusy(true);
    setNotice('');
    void action()
      .catch(() => setNotice(t('guide.failed')))
      .finally(() => setBusy(false));
  };
  return (
    <section className="bh-guide" aria-label={t('guide.title')}>
      <Input
        className="bh-settings-search-input"
        aria-label={t('guide.search')}
        placeholder={t('guide.search')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <Select
        label={t('guide.topics')}
        value={topicId}
        options={[
          { value: '', label: t('guide.common') },
          ...topics.map((item) => ({ value: item.id, label: helpText(item.title, t) })),
          ...registered
            .filter(
              (p) =>
                p.id !== USER_GUIDE_PANEL &&
                !p.id.startsWith('instance:') &&
                !topics.some((item) => item.panelId === p.id),
            )
            .map((p) => ({ value: 'panel:' + p.id, label: p.title })),
        ]}
        onChange={(value) => {
          setTopic(value);
          select(undefined);
          setNotice('');
          setPreserved(false);
        }}
      />
      {topic && <Note>{helpText(topic.overview, t)}</Note>}
      <div className="bh-guide-questions">
        {questions.length ? (
          questions.map((q) => (
            <article className="bh-guide-item" key={q.id}>
              <h3>
                <button
                  type="button"
                  className="bh-guide-question"
                  aria-expanded={selected === q.id}
                  aria-controls={`help-answer-${q.id}`}
                  id={`help-question-${q.id}`}
                  onClick={() => {
                    select(selected === q.id ? undefined : q.id);
                    setTarget('');
                    setNotice('');
                    setPreserved(false);
                  }}
                >
                  <span>{helpText(q.title, t)}</span>
                  <IconChevronDownOutlineRegular size={16} />
                </button>
              </h3>
              {answer?.id === q.id && (
                <div
                  className="bh-guide-answer"
                  id={`help-answer-${q.id}`}
                  role="region"
                  aria-labelledby={`help-question-${q.id}`}
                >
                  <p>{helpText(answer.answer, t)}</p>
                  {availability?.status === 'unavailable' && answer.guide && (
                    <Note>{helpText(availability.reason, t)}</Note>
                  )}
                  {availability?.status === 'select' && (
                    <Select
                      label={t('guide.target')}
                      value={target}
                      options={[
                        { value: '', label: t('guide.target') },
                        ...availability.targets.map((item) => ({
                          value: item.id,
                          label: item.label,
                        })),
                      ]}
                      onChange={setTarget}
                    />
                  )}
                  <div className="bh-guide-actions">
                    {answer.guide && (
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={
                          busy ||
                          availability?.status === 'unavailable' ||
                          (availability?.status === 'select' && !target)
                        }
                        onClick={() => run(() => help.start(answer.id, target || undefined))}
                      >
                        {t('guide.start')}
                      </Button>
                    )}
                    {answer.askTob && (
                      <Button
                        disabled={
                          busy || (!!answer.guide && availability?.status === 'unavailable')
                        }
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          run(async () => {
                            help.cancel('ask-tob');
                            setPreserved((await answer.askTob!()) === 'preserved');
                            setNotice(t('guide.draft'));
                          })
                        }
                      >
                        {t('guide.ask')}
                      </Button>
                    )}
                    {preserved && answer.insertQuestion && (
                      <Button
                        disabled={busy}
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          run(async () => {
                            await answer.insertQuestion!();
                            setPreserved(false);
                            setNotice(t('guide.draft'));
                          })
                        }
                      >
                        {t('guide.insert')}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </article>
          ))
        ) : (
          <Note>{t('guide.empty')}</Note>
        )}
      </div>
      {state.phase !== 'idle' && (
        <Button variant="ghost" onClick={() => help.cancel()}>
          {t('guide.exit')}
        </Button>
      )}
      {notice && <p role="status">{notice}</p>}
      {state.reason && !['closed', 'replaced', 'ask-tob'].includes(state.reason) && (
        <p role="status">
          {t(state.reason === 'completed' ? 'guide.completed' : 'guide.interrupted')}
        </p>
      )}
    </section>
  );
}
