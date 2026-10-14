import { useCallback, useRef, useState, useSyncExternalStore, type ReactElement } from 'react';
import { useMountedResource } from './mounted-resource.js';

import * as stylex from '@stylexjs/stylex';
import {
  IconChevronDownOutlineRegular,
  IconFolderOpenOutlineRegular,
  Input,
  Menu,
  Switch,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';

import {
  COMPUTER_TARGET_FIELD,
  COMPUTER_AUTO_ALLOW_FIELD,
  COMPUTER_EXPORT_DIR_FIELD,
  COMPUTER_IDLE_STOP_FIELD,
  type ComputerSettings,
} from '../settings.js';
import { Note } from '../../../client/src/client/ds/note.js';
import { PillButton, PillFileButton } from '../../../client/src/client/ds/pill-button.js';
import { Select } from '../../../client/src/client/ds/select.js';
import { SettingsRow, SettingsRows } from '../../../client/src/client/ds/settings-row.js';
import { color, space, text } from '../../../client/src/client/ds/tokens.stylex.js';
import { LocalComputerStatus } from './local-computer.js';
import type { ComputerTarget } from '../target.js';

import { PHASE_LABEL, type ComputerTranslate } from './locale.js';

export interface ComputerSettingsSnapshot {
  target: ComputerTarget;
  exportDir: string;
  idleStopMinutes: number;
  autoAllowActions: boolean;
  status: 'loading' | 'ready' | 'unavailable';
  writable: boolean;
}

export interface ComputerSettingsScope {
  getSnapshot(): {
    status: 'loading' | 'ready' | 'unavailable';
    value: ComputerSettings | undefined;
    writable: boolean;
  };
  subscribe(listener: () => void): () => void;
  set(field: string, value: unknown): Promise<void>;
}

export class ExportDirRejectedError extends Error {
  constructor() {
    super('the Host did not accept the export directory');
    this.name = 'ExportDirRejectedError';
  }
}

export function displayExportDir(configured: string, hostDir: string | undefined): string {
  return configured !== '' ? configured : (hostDir ?? '');
}

export class ComputerSettingsPrefs {
  private snapshot: ComputerSettingsSnapshot = {
    target: 'container',
    exportDir: '',
    idleStopMinutes: 30,
    autoAllowActions: false,
    status: 'loading',
    writable: false,
  };

  private readonly listeners = new Set<() => void>();

  private scope: ComputerSettingsScope | undefined;

  private detach: (() => void) | undefined;

  attach(scope: ComputerSettingsScope): () => void {
    this.detach?.();
    this.scope = scope;
    this.detach = scope.subscribe(() => {
      this.sync();
    });
    this.sync();
    return () => {
      this.detach?.();
      this.detach = undefined;
      this.scope = undefined;
    };
  }

  getSnapshot = (): ComputerSettingsSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  async setTarget(target: ComputerTarget): Promise<void> {
    if (this.scope === undefined) throw new Error('Computer settings are unavailable');
    await this.scope.set(COMPUTER_TARGET_FIELD, target);
    this.sync();
    if (this.snapshot.target !== target) throw new Error('Computer Target was not saved');
  }

  async setExportDir(exportDir: string): Promise<void> {
    if (this.scope === undefined) throw new ExportDirRejectedError();
    this.publish({ exportDir });
    try {
      await this.scope.set(COMPUTER_EXPORT_DIR_FIELD, exportDir);
    } catch (error) {
      this.sync();
      throw error;
    }
    if (this.snapshot.exportDir !== exportDir) throw new ExportDirRejectedError();
  }

  setIdleStopMinutes(idleStopMinutes: number): void {
    this.publish({ idleStopMinutes });
    void this.scope?.set(COMPUTER_IDLE_STOP_FIELD, idleStopMinutes).catch(() => undefined);
  }

  setAutoAllowActions(autoAllowActions: boolean): void {
    const previous = this.snapshot.autoAllowActions;
    this.publish({ autoAllowActions });
    void this.scope?.set(COMPUTER_AUTO_ALLOW_FIELD, autoAllowActions).catch(() => {
      this.publish({ autoAllowActions: previous });
    });
  }

  private publish(patch: Partial<ComputerSettingsSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  private sync(): void {
    const scope = this.scope;
    if (scope === undefined) return;
    const next = scope.getSnapshot();
    const value = next.value;
    this.snapshot = {
      target: value?.target ?? 'container',
      exportDir: value?.exportDir ?? '',
      idleStopMinutes: value?.idleStopMinutes ?? 30,
      autoAllowActions: value?.autoAllowActions ?? false,
      status: next.status,
      writable: next.writable,
    };
    for (const listener of this.listeners) listener();
  }
}

export interface ComputerSettingsFace {
  prefs: ComputerSettingsPrefs;
  pickerAvailable: boolean;
  pickDirectory: () => Promise<string | null>;
  openDirectory: (dir: string) => Promise<void>;
  exportArchive: (dir?: string) => Promise<{ archive: string; downloadToken?: string }>;
  downloadUrl: (downloadToken: string) => string;
  importArchive: (file: string) => Promise<void>;
  requestUpload: (file: string) => Promise<string>;
  sendUploadBytes: (uploadToken: string, file: File) => Promise<void>;
  listArchives: () => Promise<string[]>;
  hostExportDir: () => Promise<string>;
}

const IDLE_OPTIONS = [15, 30, 60, 120, 240] as const;

const styles = stylex.create({
  intro: {
    margin: 0,
    paddingTop: space.x5,
    paddingBottom: space.x2,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  chevron: {
    display: 'inline-flex',
    flexShrink: 0,
    color: color.muted,
  },
  manual: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x4,
    minWidth: 0,
    paddingBlock: space.x4,
    borderBottomWidth: '0.5px',
    borderBottomStyle: 'solid',
    borderBottomColor: color.border,
  },
  manualInput: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  file: {
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
});

const EXPORT_ENDPOINT = '/api/computer/export';
const IMPORT_ENDPOINT = '/api/computer/import';
const EXPORTS_ENDPOINT = '/api/computer/exports';
const STATUS_ENDPOINT = '/api/computer/status';
const OPEN_DIR_ENDPOINT = '/api/computer/open-dir';
const DOWNLOAD_ENDPOINT = '/api/computer/download';
const UPLOAD_ENDPOINT = '/api/computer/upload';
const UPLOAD_CONTENT_ENDPOINT = '/api/computer/upload-content';

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', ...init });
  if (!response.ok) throw new Error(`${String(response.status)} ${await response.text()}`);
  return (await response.json()) as T;
}

async function postAuthorized(url: string, body: Record<string, unknown> = {}): Promise<void> {
  await requestJson(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ authorize: true, ...body }),
  });
}

export function createComputerSettingsFace(options: {
  prefs: ComputerSettingsPrefs;
  pickDirectory?: (() => Promise<string | null>) | undefined;
  createXhr?: (() => XMLHttpRequest) | undefined;
}): ComputerSettingsFace {
  const { prefs } = options;
  return {
    prefs,
    pickerAvailable: options.pickDirectory !== undefined,
    pickDirectory: async () =>
      options.pickDirectory === undefined ? null : options.pickDirectory(),
    openDirectory: async (dir) => {
      await postAuthorized(OPEN_DIR_ENDPOINT, dir === '' ? {} : { dir });
    },
    exportArchive: async (dir) => {
      if (dir !== undefined && dir !== '') await prefs.setExportDir(dir);
      const payload = await requestJson<{ archive?: string; downloadToken?: string }>(
        EXPORT_ENDPOINT,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(
            dir === undefined || dir === '' ? { authorize: true } : { authorize: true, dir },
          ),
        },
      );
      return {
        archive: payload.archive ?? '',
        ...(payload.downloadToken === undefined ? {} : { downloadToken: payload.downloadToken }),
      };
    },
    downloadUrl: (downloadToken) =>
      `${DOWNLOAD_ENDPOINT}?token=${encodeURIComponent(downloadToken)}`,
    importArchive: async (file) => {
      await postAuthorized(IMPORT_ENDPOINT, { file });
    },
    requestUpload: async (file) => {
      const payload = await requestJson<{ uploadToken?: string }>(UPLOAD_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ authorize: true, file }),
      });
      if (payload.uploadToken === undefined) throw new Error('upload not accepted');
      return payload.uploadToken;
    },
    sendUploadBytes: (uploadToken, file) =>
      new Promise<void>((resolve, reject) => {
        const createXhr = options.createXhr ?? (() => new XMLHttpRequest());
        const xhr = createXhr();
        xhr.open('POST', `${UPLOAD_CONTENT_ENDPOINT}?token=${encodeURIComponent(uploadToken)}`);
        xhr.withCredentials = true;
        xhr.setRequestHeader('content-type', 'application/octet-stream');
        xhr.onload = () => {
          if (xhr.status !== 200) {
            reject(new Error(`upload failed: HTTP ${String(xhr.status)}`));
            return;
          }
          try {
            const payload = JSON.parse(xhr.responseText) as {
              ok?: unknown;
              error?: unknown;
            };
            if (payload.ok === true) resolve();
            else
              reject(
                new Error(typeof payload.error === 'string' ? payload.error : 'upload failed'),
              );
          } catch (error: unknown) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        };
        xhr.onerror = () => reject(new Error('upload transport failed'));
        xhr.send(file);
      }),
    listArchives: async () => {
      const payload = await requestJson<{ files?: string[] }>(EXPORTS_ENDPOINT);
      return payload.files ?? [];
    },
    hostExportDir: async () => {
      const payload = await requestJson<{ exportDir?: string }>(STATUS_ENDPOINT);
      return payload.exportDir ?? '';
    },
  };
}

function Selector({
  label,
  open,
  onToggle,
  disabled,
}: {
  readonly label: string;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly disabled?: boolean | undefined;
}): ReactElement {
  return (
    <PillButton
      aria-haspopup="menu"
      aria-expanded={open}
      disabled={disabled === true}
      onClick={onToggle}
    >
      {label}
      <span {...stylex.props(styles.chevron)}>
        <IconChevronDownOutlineRegular size={12} />
      </span>
    </PillButton>
  );
}

export function ComputerSettingsRows({
  t,
  prefs,
  pickerAvailable,
  pickDirectory,
  openDirectory,
  exportArchive,
  downloadUrl,
  importArchive,
  requestUpload,
  sendUploadBytes,
  listArchives,
  hostExportDir,
}: PropsLocale<'botharness-computer'> & InjectFace<ComputerSettingsFace>): ReactElement {
  const snapshot = useSyncExternalStore(prefs.subscribe, prefs.getSnapshot);
  const [targetError, setTargetError] = useState<string>();
  const [targetSaving, setTargetSaving] = useState(false);
  const [idleOpen, setIdleOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [archives, setArchives] = useState<readonly string[] | undefined>(undefined);
  const [busy, setBusy] = useState<'export' | 'import' | 'upload' | undefined>(undefined);
  const [confirming, setConfirming] = useState<'export' | 'import' | undefined>(undefined);
  const [exportTarget, setExportTarget] = useState<string | undefined>(undefined);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualPath, setManualPath] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirNote, setDirNote] = useState<string | undefined>(undefined);
  const [transferNote, setTransferNote] = useState<string | undefined>(undefined);
  const [download, setDownload] = useState<{ archive: string; token: string } | undefined>(
    undefined,
  );
  const [uploadName, setUploadName] = useState<string | undefined>(undefined);
  const uploadFile = useRef<File | null>(null);
  const [pickerBroken, setPickerBroken] = useState(false);
  const [hostDir, setHostDir] = useState<string | undefined>(undefined);
  const [livePhase, setLivePhase] = useState<string | undefined>(undefined);
  const [liveElapsed, setLiveElapsed] = useState(0);

  const hostDirResource = useMountedResource<HTMLSpanElement>(() => {
    if (snapshot.target === 'local') return;
    if (snapshot.status !== 'unavailable' && snapshot.exportDir !== '') return;
    let active = true;
    void hostExportDir()
      .then((dir) => {
        if (active) setHostDir(dir);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [hostExportDir, snapshot.status, snapshot.exportDir, snapshot.target]);

  const busyResource = useMountedResource<HTMLSpanElement>(() => {
    setLivePhase(undefined);
    setLiveElapsed(0);
    const startedAt = Date.now();
    const controller = new AbortController();
    let pending = false;
    const tick = async (): Promise<void> => {
      if (controller.signal.aborted) return;
      setLiveElapsed(Math.round((Date.now() - startedAt) / 1000));
      if (pending) return;
      pending = true;
      try {
        const payload = await requestJson<{ status?: { phase?: string } }>(STATUS_ENDPOINT, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
        });
        if (!controller.signal.aborted) setLivePhase(payload.status?.phase);
      } catch {
      } finally {
        pending = false;
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), 1000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [busy]);

  const phaseKey = livePhase === undefined ? undefined : PHASE_LABEL[livePhase];

  const exportDir = displayExportDir(snapshot.exportDir, hostDir);
  const hasDir = exportDir !== '';
  const writable = snapshot.status === 'ready' && snapshot.writable;
  const canAdjust = pickerAvailable && !pickerBroken;

  const pickDirectoryInto = useCallback(
    (apply: (dir: string) => void) => {
      void pickDirectory()
        .then((dir) => {
          if (dir !== null) apply(dir);
        })
        .catch(() => {
          setPickerBroken(true);
          setManualOpen(false);
          setDirNote(t('rows.pickerFallback', { dir: exportDir }));
        });
    },
    [exportDir, pickDirectory, t],
  );

  const pickExportDir = useCallback(() => {
    pickDirectoryInto((dir) => {
      setManualPath(dir);
      setDirNote(undefined);
      void prefs.setExportDir(dir).catch((error: unknown) => setDirNote(String(error)));
    });
  }, [pickDirectoryInto, prefs]);

  const startExport = useCallback(() => {
    if (!canAdjust) {
      setExportTarget(undefined);
      setConfirming('export');
      return;
    }
    pickDirectory()
      .then((dir) => {
        if (dir === null) return;
        setExportTarget(dir);
        setConfirming('export');
      })
      .catch(() => {
        setPickerBroken(true);
        setManualOpen(false);
        setDirNote(t('rows.pickerFallback', { dir: exportDir }));
        setExportTarget(undefined);
        setConfirming('export');
      });
  }, [canAdjust, exportDir, pickDirectory, t]);

  const saveManualPath = useCallback(() => {
    const dir = manualPath.trim();
    if (dir === '') return;
    if (!dir.startsWith('/') && !/^[A-Za-z]:[\\/]/u.test(dir)) {
      setDirNote(t('rows.exportDir.needsAbsolute'));
      return;
    }
    setSaving(true);
    setDirNote(undefined);
    void prefs
      .setExportDir(dir)
      .then(() => {
        setManualOpen(false);
        setDirNote(t('rows.exportDir.saved', { dir }));
      })
      .catch((error: unknown) =>
        setDirNote(
          error instanceof ExportDirRejectedError
            ? t('rows.exportDir.saveRejected')
            : String(error),
        ),
      )
      .finally(() => setSaving(false));
  }, [manualPath, prefs, t]);

  const runExport = useCallback(() => {
    const autoOpen = !canAdjust;
    setConfirming(undefined);
    setBusy('export');
    setTransferNote(undefined);
    setDownload(undefined);
    void exportArchive(exportTarget)
      .then(({ archive, downloadToken }) => {
        setTransferNote(archive === '' ? t('rows.exportedDone') : t('rows.exported', { archive }));
        if (archive !== '' && downloadToken !== undefined) {
          setDownload({ archive, token: downloadToken });
        }
        if (autoOpen) void openDirectory(exportDir).catch(() => undefined);
      })
      .catch((error: unknown) => setTransferNote(String(error)))
      .finally(() => setBusy(undefined));
  }, [canAdjust, exportArchive, exportDir, exportTarget, openDirectory, t]);

  const runImport = useCallback(
    (file: string) => {
      setImportOpen(false);
      setConfirming(undefined);
      setBusy('import');
      setTransferNote(undefined);
      void importArchive(file)
        .then(() => setTransferNote(t('rows.imported', { file })))
        .catch((error: unknown) => setTransferNote(String(error)))
        .finally(() => setBusy(undefined));
    },
    [importArchive, t],
  );

  const takeUploadFile = useCallback((file: File | null) => {
    if (file === null) return;
    uploadFile.current = file;
    setUploadName(file.name);
    setTransferNote(undefined);
  }, []);

  const runUpload = useCallback(() => {
    const file = uploadFile.current;
    const name = uploadName;
    if (file === null || name === undefined) return;
    setConfirming(undefined);
    setBusy('upload');
    setTransferNote(undefined);
    void requestUpload(name)
      .then((token) => sendUploadBytes(token, file))
      .then(() => importArchive(name))
      .then(() => {
        setTransferNote(t('rows.imported', { file: name }));
        setUploadName(undefined);
        uploadFile.current = null;
      })
      .catch((error: unknown) => setTransferNote(String(error)))
      .finally(() => setBusy(undefined));
  }, [uploadName, requestUpload, sendUploadBytes, importArchive, t]);

  const openImport = useCallback(() => {
    if (importOpen) {
      setImportOpen(false);
      return;
    }
    void listArchives()
      .then((files) => {
        setArchives(files);
        if (files.length === 0) {
          setImportOpen(false);
          setTransferNote(t('rows.noArchives'));
        } else {
          setImportOpen(true);
        }
      })
      .catch((error: unknown) => setTransferNote(String(error)));
  }, [importOpen, listArchives, t]);

  const openDir = useCallback(() => {
    void openDirectory(exportDir).catch((error: unknown) => setDirNote(String(error)));
  }, [exportDir, openDirectory]);

  const selectedFile = uploadName ?? (confirming === 'import' ? archives?.[0] : undefined);

  return (
    <SettingsRows>
      <span hidden ref={hostDirResource} />
      {busy === undefined ? null : <span hidden ref={busyResource} />}
      <p {...stylex.props(styles.intro)}>{t('section.description')}</p>
      <SettingsRow
        title={t('rows.target.title')}
        description={t('rows.target.description')}
        control={
          <Select
            label={t('rows.target.title')}
            value={snapshot.target}
            options={(['local', 'container'] as const).map((id) => ({
              value: id,
              label: t(`rows.target.${id}`),
            }))}
            disabled={!writable || targetSaving}
            onChange={(id) => {
              setTargetSaving(true);
              setTargetError(undefined);
              void prefs
                .setTarget(id)
                .catch((error: unknown) => setTargetError(String(error)))
                .finally(() => setTargetSaving(false));
            }}
          />
        }
      />
      {targetError === undefined ? null : <Note tone="danger">{targetError}</Note>}
      <SettingsRow
        title={t('rows.autoAllow.title')}
        description={t('rows.autoAllow.description')}
        control={
          <Switch
            checked={snapshot.autoAllowActions}
            disabled={!writable}
            onChange={(next) => {
              prefs.setAutoAllowActions(next);
            }}
            label={t('rows.autoAllow.title')}
          />
        }
      />
      {snapshot.target === 'local' ? (
        <LocalComputerStatus t={t as ComputerTranslate} />
      ) : (
        <>
          <SettingsRow
            title={t('rows.exportDir.title')}
            description={
              hasDir ? t('rows.exportDir.current', { dir: exportDir }) : t('rows.exportDir.empty')
            }
            control={
              <>
                {canAdjust ? (
                  <PillButton disabled={!writable} onClick={pickExportDir}>
                    <IconFolderOpenOutlineRegular size={14} />
                    {t('rows.exportDir.pick')}
                  </PillButton>
                ) : null}
                <PillButton disabled={!hasDir} onClick={openDir}>
                  {t('rows.exportDir.open')}
                </PillButton>
                <PillButton
                  disabled={!writable}
                  onClick={() => {
                    setManualOpen((value) => !value);
                    setManualPath(exportDir);
                  }}
                >
                  {t('rows.exportDir.manual')}
                </PillButton>
              </>
            }
          />

          {manualOpen ? (
            <div {...stylex.props(styles.manual)}>
              <Input
                className={stylex.props(styles.manualInput).className ?? ''}
                value={manualPath}
                placeholder="/absolute/path"
                aria-label={t('rows.exportDir.manual')}
                onChange={(event) => {
                  setManualPath(event.target.value);
                }}
              />
              <PillButton
                disabled={!writable || saving || manualPath.trim() === ''}
                onClick={saveManualPath}
              >
                {saving ? t('rows.exportDir.saving') : t('rows.exportDir.save')}
              </PillButton>
            </div>
          ) : null}
          {dirNote === undefined ? null : <Note>{dirNote}</Note>}

          <SettingsRow
            title={t('rows.idle.title')}
            description={t('rows.idle.description')}
            control={
              <Menu
                open={idleOpen}
                portal
                align="end"
                items={IDLE_OPTIONS.map((minutes) => ({
                  id: String(minutes),
                  label: t('rows.idle.minutes', { minutes }),
                }))}
                selectedId={String(snapshot.idleStopMinutes)}
                onSelect={(id) => {
                  setIdleOpen(false);
                  prefs.setIdleStopMinutes(Number(id));
                }}
                onClose={() => {
                  setIdleOpen(false);
                }}
                anchor={
                  <Selector
                    label={t('rows.idle.minutes', { minutes: snapshot.idleStopMinutes })}
                    open={idleOpen}
                    disabled={!writable}
                    onToggle={() => {
                      setIdleOpen((value) => !value);
                    }}
                  />
                }
              />
            }
          />

          <SettingsRow
            title={t('rows.exportSection.title')}
            description={t('rows.exportSection.description')}
            control={
              <>
                {confirming === 'export' ? (
                  <>
                    <PillButton
                      onClick={() => {
                        setConfirming(undefined);
                      }}
                    >
                      {t('entry.cancel')}
                    </PillButton>
                    <PillButton onClick={runExport}>{t('rows.authorizeExport')}</PillButton>
                  </>
                ) : (
                  <PillButton
                    disabled={(!hasDir && !canAdjust) || busy !== undefined}
                    onClick={startExport}
                  >
                    {busy === 'export'
                      ? t('rows.exporting')
                      : canAdjust
                        ? t('rows.exportTo')
                        : t('rows.export')}
                  </PillButton>
                )}
                {download === undefined ? null : (
                  <PillButton
                    onClick={() => {
                      globalThis.location?.assign(downloadUrl(download.token));
                    }}
                  >
                    {t('rows.download')}
                  </PillButton>
                )}
              </>
            }
          />

          {confirming === 'export' ? (
            <Note>{t('rows.exportTarget', { dir: exportTarget ?? exportDir })}</Note>
          ) : null}

          <SettingsRow
            title={t('rows.importSection.title')}
            description={t('rows.importSection.description')}
            control={
              <>
                {uploadName !== undefined ? null : confirming === 'import' ? (
                  <PillButton
                    onClick={() => {
                      setConfirming(undefined);
                    }}
                  >
                    {t('rows.cancelImport')}
                  </PillButton>
                ) : (
                  <Menu
                    open={importOpen}
                    portal
                    align="end"
                    items={(archives ?? []).map((file) => ({ id: file, label: file }))}
                    onSelect={(id) => {
                      setConfirming('import');
                      setArchives([id]);
                    }}
                    onClose={() => {
                      setImportOpen(false);
                    }}
                    anchor={
                      <Selector
                        label={busy === 'import' ? t('rows.importing') : t('rows.import')}
                        open={importOpen}
                        disabled={!hasDir || busy !== undefined}
                        onToggle={openImport}
                      />
                    }
                  />
                )}
                {uploadName === undefined &&
                confirming === 'import' &&
                archives?.[0] !== undefined ? (
                  <PillButton
                    disabled={busy !== undefined}
                    onClick={() => {
                      const file = archives[0];
                      if (file !== undefined) runImport(file);
                    }}
                  >
                    {t('rows.authorizeImportConfirm')}
                  </PillButton>
                ) : null}
                {uploadName !== undefined || confirming === 'import' ? null : (
                  <PillFileButton
                    accept=".tar,application/x-tar"
                    disabled={busy !== undefined}
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      event.target.value = '';
                      takeUploadFile(file);
                    }}
                  >
                    {t('rows.chooseFile')}
                  </PillFileButton>
                )}
                {uploadName === undefined ? null : (
                  <>
                    <PillButton
                      onClick={() => {
                        setUploadName(undefined);
                        uploadFile.current = null;
                      }}
                    >
                      {t('entry.cancel')}
                    </PillButton>
                    <PillButton disabled={busy !== undefined} onClick={runUpload}>
                      {busy === 'upload' ? t('rows.importing') : t('rows.authorizeImportConfirm')}
                    </PillButton>
                  </>
                )}
              </>
            }
          />

          {selectedFile === undefined ? null : <p {...stylex.props(styles.file)}>{selectedFile}</p>}

          {busy !== undefined && phaseKey !== undefined ? (
            <Note>{`${t(phaseKey)} · ${t('entry.elapsed', { seconds: liveElapsed })}`}</Note>
          ) : null}
        </>
      )}
      {snapshot.status === 'unavailable' ? <Note>{t('rows.noSettings')}</Note> : null}
      {snapshot.target !== 'container' || transferNote === undefined ? null : (
        <Note>{transferNote}</Note>
      )}
    </SettingsRows>
  );
}
