import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  return {
    IconChevronDownOutline14: stub,
    IconFolderOpenOutline16: stub,
    Menu: stub,
    Switch: stub,
  };
});

import {
  ComputerSettingsPrefs,
  ExportDirRejectedError,
  createComputerSettingsFace,
  displayExportDir,
  type ComputerSettingsScope,
} from '../src/client/settings-rows.js';
import { PHASE_LABEL } from '../src/client/locale.js';

type FakeSettings = { exportDir: string; idleStopMinutes: number; autoAllowActions: boolean };

function fakeScope(value: Partial<FakeSettings> | undefined): {
  scope: ComputerSettingsScope;
  writes: { field: string; value: unknown }[];
  push: (next: Partial<FakeSettings> | undefined) => void;
} {
  const writes: { field: string; value: unknown }[] = [];
  let listener: (() => void) | undefined;
  let current: FakeSettings | undefined =
    value === undefined
      ? undefined
      : {
          exportDir: value.exportDir ?? '',
          idleStopMinutes: value.idleStopMinutes ?? 30,
          autoAllowActions: value.autoAllowActions ?? false,
        };
  return {
    writes,
    scope: {
      getSnapshot: () => ({ status: 'ready', value: current, writable: true }),
      subscribe: (next: () => void) => {
        listener = next;
        return () => {
          listener = undefined;
        };
      },
      set: async (field: string, next: unknown) => {
        writes.push({ field, value: next });
      },
    },
    push: (next) => {
      if (next === undefined) {
        current = undefined;
      } else {
        const base = current ?? { exportDir: '', idleStopMinutes: 30, autoAllowActions: false };
        current = {
          exportDir: next.exportDir ?? base.exportDir,
          idleStopMinutes: next.idleStopMinutes ?? base.idleStopMinutes,
          autoAllowActions: next.autoAllowActions ?? base.autoAllowActions,
        };
      }
      listener?.();
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('computer settings prefs', () => {
  it('changes target only after the durable scope accepts it, and keeps it on refusal', async () => {
    let target: 'local' | 'container' = 'container';
    const prefs = new ComputerSettingsPrefs();
    const set = vi.fn(async (_field, next) => {
      target = next;
    });
    prefs.attach({
      getSnapshot: () => ({
        status: 'ready',
        writable: true,
        value: { target, exportDir: '', idleStopMinutes: 30, autoAllowActions: false },
      }),
      subscribe: () => () => undefined,
      set,
    });
    await prefs.setTarget('local');
    expect(set).toHaveBeenCalledWith('target', 'local');
    expect(prefs.getSnapshot().target).toBe('local');
    set.mockRejectedValue(new Error('refused'));
    await expect(prefs.setTarget('container')).rejects.toThrow('refused');
    expect(prefs.getSnapshot().target).toBe('local');
  });

  it('adopts the scope values and publishes writes optimistically', async () => {
    const fake = fakeScope({ exportDir: '/exports', idleStopMinutes: 60 });
    const prefs = new ComputerSettingsPrefs();
    const seen: string[] = [];
    prefs.subscribe(() => seen.push(prefs.getSnapshot().exportDir));
    prefs.attach(fake.scope);

    expect(prefs.getSnapshot()).toMatchObject({
      exportDir: '/exports',
      idleStopMinutes: 60,
      status: 'ready',
      writable: true,
    });

    await prefs.setExportDir('/other');
    expect(prefs.getSnapshot().exportDir).toBe('/other');
    expect(fake.writes).toEqual([{ field: 'exportDir', value: '/other' }]);

    fake.push({ exportDir: '/adopted', idleStopMinutes: 15 });
    expect(prefs.getSnapshot()).toMatchObject({ exportDir: '/adopted', idleStopMinutes: 15 });
    expect(seen.length).toBeGreaterThan(0);
  });

  it('rejects setExportDir when the scope write fails, so the row can show the error', async () => {
    const fake = fakeScope({ exportDir: '/exports', idleStopMinutes: 30 });
    fake.scope.set = async () => {
      throw new Error('scope refused');
    };
    const prefs = new ComputerSettingsPrefs();
    prefs.attach(fake.scope);

    await expect(prefs.setExportDir('/other')).rejects.toThrow('scope refused');
    expect(prefs.getSnapshot().exportDir).toBe('/exports');
  });

  it('rejects setExportDir when the Host silently recovers to the previous value', async () => {
    const fake = fakeScope({ exportDir: '/exports', idleStopMinutes: 30 });
    const prefs = new ComputerSettingsPrefs();
    prefs.attach(fake.scope);
    fake.scope.set = async () => {
      fake.push({ exportDir: '/exports', idleStopMinutes: 30 });
    };

    await expect(prefs.setExportDir('/other')).rejects.toThrow(ExportDirRejectedError);
    expect(prefs.getSnapshot().exportDir).toBe('/exports');
  });

  it('adopts and optimistically writes the auto-allow switch', () => {
    const fake = fakeScope({
      exportDir: '/exports',
      idleStopMinutes: 30,
      autoAllowActions: true,
    });
    const prefs = new ComputerSettingsPrefs();
    prefs.attach(fake.scope);

    expect(prefs.getSnapshot().autoAllowActions).toBe(true);

    prefs.setAutoAllowActions(false);
    expect(prefs.getSnapshot().autoAllowActions).toBe(false);
    expect(fake.writes).toEqual([{ field: 'autoAllowActions', value: false }]);

    fake.push({ autoAllowActions: true });
    expect(prefs.getSnapshot().autoAllowActions).toBe(true);
  });

  it('rolls the auto-allow switch back when the scope rejects the write', async () => {
    const fake = fakeScope({
      exportDir: '/exports',
      idleStopMinutes: 30,
      autoAllowActions: false,
    });
    fake.scope.set = async () => {
      throw new Error('scope refused');
    };
    const prefs = new ComputerSettingsPrefs();
    prefs.attach(fake.scope);

    prefs.setAutoAllowActions(true);
    expect(prefs.getSnapshot().autoAllowActions).toBe(true);
    await vi.waitFor(() => {
      expect(prefs.getSnapshot().autoAllowActions).toBe(false);
    });
  });
});

describe('displayExportDir', () => {
  it('prefers the configured scope value', () => {
    expect(displayExportDir('/configured', '/host-resolved')).toBe('/configured');
  });

  it('falls back to the Host-resolved path while the scope is empty', () => {
    expect(displayExportDir('', '/Users/me/Desktop/BotHarness Exports')).toBe(
      '/Users/me/Desktop/BotHarness Exports',
    );
    expect(displayExportDir('', undefined)).toBe('');
  });
});

describe('computer settings face', () => {
  it('authorizes export and import and reads the archive list', async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const body =
        url === './api/computer/export'
          ? { ok: true, archive: '/exports/a.tar', downloadToken: 'dl-1' }
          : url === './api/computer/exports'
            ? { ok: true, files: ['a.tar'] }
            : url === './api/computer/status'
              ? { exportDir: '/exports' }
              : { ok: true };
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });
    const prefs = new ComputerSettingsPrefs();
    const face = createComputerSettingsFace({ prefs });

    expect(await face.exportArchive()).toEqual({
      archive: '/exports/a.tar',
      downloadToken: 'dl-1',
    });
    expect(face.downloadUrl('t 1/2')).toBe('./api/computer/download?token=t%201%2F2');
    await face.importArchive('a.tar');
    expect(await face.listArchives()).toEqual(['a.tar']);
    expect(await face.hostExportDir()).toBe('/exports');
    expect(await face.pickDirectory()).toBeNull();

    const exportCall = calls.find((call) => call.url === './api/computer/export');
    expect(JSON.parse(String(exportCall?.init?.body))).toEqual({ authorize: true });
    const importCall = calls.find((call) => call.url === './api/computer/import');
    expect(JSON.parse(String(importCall?.init?.body))).toEqual({
      authorize: true,
      file: 'a.tar',
    });
  });

  it('uses the injected picker when one is available', async () => {
    const face = createComputerSettingsFace({
      prefs: new ComputerSettingsPrefs(),
      pickDirectory: async () => '/picked',
    });
    expect(face.pickerAvailable).toBe(true);
    expect(await face.pickDirectory()).toBe('/picked');
  });

  it('exports into an explicit directory and opens folders', async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true, archive: '/target/a.tar' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });
    const prefs = new ComputerSettingsPrefs();
    const fake = fakeScope({ exportDir: '/old' });
    prefs.attach(fake.scope);
    const face = createComputerSettingsFace({ prefs });

    expect(await face.exportArchive('/target')).toEqual({ archive: '/target/a.tar' });
    expect(fake.writes).toEqual([{ field: 'exportDir', value: '/target' }]);
    expect(prefs.getSnapshot().exportDir).toBe('/target');
    await face.openDirectory('/target');

    const exportCall = calls.find((call) => call.url === './api/computer/export');
    expect(JSON.parse(String(exportCall?.init?.body))).toEqual({
      authorize: true,
      dir: '/target',
    });
    const openCall = calls.find((call) => call.url === './api/computer/open-dir');
    expect(JSON.parse(String(openCall?.init?.body))).toEqual({ authorize: true, dir: '/target' });
    expect(face.pickerAvailable).toBe(false);
  });

  it('does not export when the chosen directory cannot be saved', async () => {
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    const prefs = new ComputerSettingsPrefs();
    const fake = fakeScope({ exportDir: '/old' });
    fake.scope.set = async () => {
      throw new Error('settings refused');
    };
    prefs.attach(fake.scope);
    const face = createComputerSettingsFace({ prefs });
    await expect(face.exportArchive('/target')).rejects.toThrow('settings refused');
    expect(prefs.getSnapshot().exportDir).toBe('/old');
    expect(request).not.toHaveBeenCalled();
  });

  it('requests an upload token and streams the file bytes by token', async () => {
    const uploaded: { url: string; file: unknown }[] = [];
    const xhr = {
      headers: {} as Record<string, string>,
      withCredentials: false,
      status: 200,
      responseText: '{"ok":true}',
      onload: null as (() => void) | null,
      onerror: null as (() => void) | null,
      open(method: string, url: string): void {
        expect(method).toBe('POST');
        expect(url).toBe('./api/computer/upload-content?token=up-1');
      },
      setRequestHeader(name: string, value: string): void {
        xhr.headers[name] = value;
      },
      send(file: unknown): void {
        uploaded.push({ url: './api/computer/upload-content?token=up-1', file });
        xhr.onload?.();
      },
    };
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
      expect(url).toBe('./api/computer/upload');
      expect(JSON.parse(String(init?.body))).toEqual({ authorize: true, file: 'a.tar' });
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true, uploadToken: 'up-1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });
    const face = createComputerSettingsFace({
      prefs: new ComputerSettingsPrefs(),
      createXhr: () => xhr as unknown as XMLHttpRequest,
    });

    expect(await face.requestUpload('a.tar')).toBe('up-1');
    const file = new File(['chunk-1', 'chunk-2'], 'a.tar');
    await face.sendUploadBytes('up-1', file);
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0]?.file).toBe(file);
    expect(xhr.headers['content-type']).toBe('application/octet-stream');
    expect(xhr.withCredentials).toBe(true);
  });

  class FakeXhr {
    withCredentials = false;
    status = 200;
    responseText = '';
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    headers: Record<string, string> = {};
    sent: unknown[] = [];
    opened = { method: '', url: '' };

    open(method: string, url: string): void {
      this.opened = { method, url };
    }

    setRequestHeader(name: string, value: string): void {
      this.headers[name] = value;
    }

    send(file: unknown): void {
      this.sent.push(file);
    }

    respond(status: number, text: string): void {
      this.status = status;
      this.responseText = text;
      this.onload?.();
    }

    abort(): void {
      this.onerror?.();
    }
  }

  function fakeXhr(): {
    xhr: unknown;
    sent: unknown[];
    respond: (status: number, text: string) => void;
    abort: () => void;
  } {
    const fake = new FakeXhr();
    return {
      xhr: fake,
      sent: fake.sent,
      respond: (status, text) => fake.respond(status, text),
      abort: () => fake.abort(),
    };
  }

  it('surfaces transport and server failures', async () => {
    const broken = fakeXhr();
    const faceBroken = createComputerSettingsFace({
      prefs: new ComputerSettingsPrefs(),
      createXhr: () => broken.xhr as XMLHttpRequest,
    });
    const sending = faceBroken.sendUploadBytes('up-1', new File(['x'], 'a.tar'));
    broken.abort();
    await expect(sending).rejects.toThrow(/transport failed/);

    const denied = fakeXhr();
    const faceDenied = createComputerSettingsFace({
      prefs: new ComputerSettingsPrefs(),
      createXhr: () => denied.xhr as XMLHttpRequest,
    });
    const deniedSending = faceDenied.sendUploadBytes('up-1', new File(['x'], 'a.tar'));
    denied.respond(200, '{"ok":false,"error":"nope"}');
    await expect(deniedSending).rejects.toThrow(/nope/);
  });
});

describe('transfer phase labels', () => {
  it('labels every transfer phase the Host can report', () => {
    expect(PHASE_LABEL.exporting).toBe('entry.phase.exporting');
    expect(PHASE_LABEL.importing).toBe('entry.phase.importing');
    expect(PHASE_LABEL.stopping).toBe('entry.phase.stopping');
    expect(PHASE_LABEL.starting).toBe('entry.phase.starting');
    expect(PHASE_LABEL.pulling).toBe('entry.phase.pulling');
    expect(PHASE_LABEL.unknown).toBeUndefined();
  });
});
