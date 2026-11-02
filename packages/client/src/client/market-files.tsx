import { useState, type ReactElement } from 'react';

import {
  IconChevronLeftOutlineRegular,
  MarkdownText,
  Tag,
  type MarkdownLabels,
} from '@deepseek-ai/dsh-client-ui-primitives';

import type {
  MarketplaceFile,
  MarketplaceFileSummary,
  MarketplaceFileType,
  MarketplaceFileView,
} from '../../../core/src/marketplace/client.js';
import type { BridgeActions } from './actions.js';
import { IconButton } from './ds/icon-button.js';
import { ReadFailure } from './ds/read-failure.js';
import type { BotHarnessKey, BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const TYPE_LABEL: Record<MarketplaceFileType, BotHarnessKey> = {
  markdown: 'market.files.type.markdown',
  text: 'market.files.type.text',
  data: 'market.files.type.data',
  script: 'market.files.type.script',
  image: 'market.files.type.image',
};

function FileBreakdown({
  summary,
  t,
}: {
  summary: MarketplaceFileSummary;
  t: BotHarnessTranslate;
}): ReactElement | null {
  if (summary.types.length === 0) return null;
  return (
    <div className="bh-market-file-breakdown" data-market-breakdown>
      <div className="bh-market-file-bar" aria-hidden="true">
        {summary.types.map((entry) => (
          <i key={entry.type} data-type={entry.type} style={{ flexGrow: entry.size }} />
        ))}
      </div>
      <ul className="bh-market-file-legend">
        {summary.types.map((entry) => (
          <li key={entry.type} data-market-type={entry.type}>
            <i data-type={entry.type} />
            <span>{t(TYPE_LABEL[entry.type])}</span>
            <strong>{entry.count}</strong>
            <span className="bh-market-file-size">{fileSize(entry.size)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface FileFolder {
  folders: Map<string, FileFolder>;
  files: MarketplaceFile[];
}

function fileTree(files: readonly MarketplaceFile[]): FileFolder {
  const root: FileFolder = { folders: new Map(), files: [] };
  for (const file of files) {
    const parts = file.path.split('/');
    let folder = root;
    for (const part of parts.slice(0, -1)) {
      let next = folder.folders.get(part);
      if (next === undefined) {
        next = { folders: new Map(), files: [] };
        folder.folders.set(part, next);
      }
      folder = next;
    }
    folder.files.push(file);
  }
  return root;
}

function FileRow({
  file,
  t,
  onOpen,
}: {
  file: MarketplaceFile;
  t: BotHarnessTranslate;
  onOpen?: (file: MarketplaceFile) => void;
}): ReactElement {
  const content = (
    <>
      <span className="bh-market-file-name">{file.path.split('/').at(-1)}</span>
      {file.kind === 'script' ? <Tag tone="outline">{t('market.files.script')}</Tag> : null}
      <span className="bh-market-file-size">{fileSize(file.size)}</span>
    </>
  );
  return onOpen === undefined || file.kind === 'image' ? (
    <li className="bh-market-file" data-market-file={file.path}>
      {content}
    </li>
  ) : (
    <li data-market-file={file.path}>
      <button
        type="button"
        className="bh-market-file"
        aria-label={t('market.files.open', { path: file.path })}
        onClick={() => onOpen(file)}
      >
        {content}
      </button>
    </li>
  );
}

function FileFolderList({
  folder,
  t,
  onOpen,
}: {
  folder: FileFolder;
  t: BotHarnessTranslate;
  onOpen?: (file: MarketplaceFile) => void;
}): ReactElement {
  const folders = [...folder.folders.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return (
    <ul className="bh-market-file-list">
      {folders.map(([name, child]) => (
        <li key={`${name}/`} data-market-folder={name}>
          <span className="bh-market-file-folder">{name}/</span>
          <FileFolderList folder={child} t={t} {...(onOpen === undefined ? {} : { onOpen })} />
        </li>
      ))}
      {folder.files.map((file) => (
        <FileRow key={file.path} file={file} t={t} {...(onOpen === undefined ? {} : { onOpen })} />
      ))}
    </ul>
  );
}

export function MarketplaceFileTree({
  files,
  summary,
  t,
  onOpen,
}: {
  files: readonly MarketplaceFile[];
  summary?: MarketplaceFileSummary;
  t: BotHarnessTranslate;
  onOpen?: (file: MarketplaceFile) => void;
}): ReactElement {
  const scripts = files.filter((file) => file.kind === 'script').length;
  return (
    <section className="bh-market-files" data-market-files={files.length}>
      <header className="bh-market-files-head">
        <strong>{t('market.files.title', { count: String(files.length) })}</strong>
        {summary === undefined ? null : (
          <span className="bh-market-file-size">{fileSize(summary.size)}</span>
        )}
      </header>
      {summary === undefined ? null : <FileBreakdown summary={summary} t={t} />}
      {scripts === 0 ? null : (
        <span className="bh-market-hint" data-market-scripts={scripts}>
          {t('market.files.scripts', { count: String(scripts) })}
        </span>
      )}
      <FileFolderList
        folder={fileTree(files)}
        t={t}
        {...(onOpen === undefined ? {} : { onOpen })}
      />
    </section>
  );
}

type ReaderState =
  | { status: 'loading' }
  | { status: 'error'; cause: unknown }
  | { status: 'ready'; file: MarketplaceFileView };

export function MarketplaceFileReader({
  actions,
  botId,
  file,
  labels,
  t,
  describeError,
  onBack,
}: {
  actions: Pick<BridgeActions, 'marketplaceFile'>;
  botId: string;
  file: MarketplaceFile;
  labels: MarkdownLabels;
  t: BotHarnessTranslate;
  describeError: (cause: unknown) => string;
  onBack: () => void;
}): ReactElement {
  const [state, setState] = useState<ReaderState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const section = useMountedResource<HTMLElement>(
    (node) => {
      node.scrollIntoView?.({ block: 'nearest' });
      let live = true;
      setState({ status: 'loading' });
      void actions.marketplaceFile(botId, file.path).then(
        (loaded) => {
          if (live) setState({ status: 'ready', file: loaded });
        },
        (cause: unknown) => {
          if (live) setState({ status: 'error', cause });
        },
      );
      return () => {
        live = false;
      };
    },
    [actions, botId, file.path, attempt],
  );
  return (
    <section ref={section} className="bh-market-reader" data-market-reader={file.path}>
      <header className="bh-market-reader-head">
        <IconButton aria-label={t('market.files.back')} onClick={onBack}>
          <IconChevronLeftOutlineRegular size={16} />
        </IconButton>
        <strong className="bh-market-reader-path" title={file.path}>
          {file.path}
        </strong>
        {file.kind === 'script' ? <Tag tone="outline">{t('market.files.script')}</Tag> : null}
        <span className="bh-market-file-size">{fileSize(file.size)}</span>
      </header>
      {state.status === 'loading' ? (
        <div className="bh-market-state" role="status">
          {t('market.detail.loading')}
        </div>
      ) : null}
      {state.status === 'error' ? (
        <ReadFailure retryLabel={t('market.retry')} onRetry={() => setAttempt((n) => n + 1)}>
          {describeError(state.cause)}
        </ReadFailure>
      ) : null}
      {state.status === 'ready' && state.file.type === 'markdown' ? (
        <div className="bh-market-readme" data-market-reader-body="markdown">
          <MarkdownText text={state.file.text} labels={labels} />
        </div>
      ) : null}
      {state.status === 'ready' && state.file.type !== 'markdown' ? (
        <pre className="bh-market-reader-code" data-market-reader-body={state.file.type}>
          {state.file.text}
        </pre>
      ) : null}
    </section>
  );
}
