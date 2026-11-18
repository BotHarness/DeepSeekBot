import { describe, expect, it } from 'vitest';

import {
  addedToBaseline,
  checkHostReaders,
  duplicated,
  hostMethods,
  readersByMethod,
} from '../check-host-readers.mjs';

describe('host readers', () => {
  it('finds the Host method in each call shape', () => {
    const source = `
      await client.call<{ bots: Array<Bot> }>('list');
      call('channels', {});
      invoke<Usage>(
        'overviewUsage', {});
      unwrap(call, 'storageUsage', {}, signal);
      rpc('modelCatalog', {});
      fn.call(this, value);
    `;
    expect([...hostMethods(source)].sort()).toEqual([
      'channels',
      'list',
      'modelCatalog',
      'overviewUsage',
      'storageUsage',
    ]);
  });

  it('reads double-quoted and template method names the same as single-quoted', () => {
    const source = 'call("channels"); unwrap(call, "storageUsage", {}); rpc(`list`);';
    expect([...hostMethods(source)].sort()).toEqual(['channels', 'list', 'storageUsage']);
  });

  it('reads deep generics, and ignores comments and other callees', () => {
    const source = `
      await client.call<Result<Page<Usage>>>('overviewUsage');
      // call('commented');
      /* rpc('blocked'); */
      const text = "call('inString')";
      format('notHost');
      host.rpc(\`channels\`, {});
    `;
    expect([...hostMethods(source)].sort()).toEqual(['channels', 'overviewUsage']);
  });

  it('flags a mobile reader beside the shared one', () => {
    const readers = readersByMethod({
      'packages/host-client/src/storage.ts': "host.call('storageUsage')",
      'apps/mobile/src/ui/storage.tsx': "client.call('storageUsage')",
      'packages/client/src/client/storage-settings.tsx': 'loadStorageUsage(bridgeHost(call))',
    });
    expect(duplicated(readers)).toEqual(['storageUsage']);
  });

  it('refuses baseline entries that the base does not list', () => {
    expect(addedToBaseline(['a', 'b'], ['a'])).toEqual(['b']);
    expect(addedToBaseline(['a'], undefined)).toEqual([]);
  });

  it('flags a method read on desktop and on mobile, not one read on a single side', () => {
    const readers = readersByMethod({
      'packages/client/src/client/bridge.ts':
        "unwrap(call, 'modelCatalog', {}); invoke('tobHome', {})",
      'packages/host-client/src/bot-settings.ts': "client.call('modelCatalog', {})",
      'apps/mobile/src/host/routines.ts': "client.call('scheduleList', {})",
      'packages/core/src/bridge/rpc.ts': "rpc('tobHome', {})",
    });
    expect(duplicated(readers)).toEqual(['modelCatalog']);
    expect(checkHostReaders(readers, [])).toEqual([
      expect.stringContaining(
        "Host method 'modelCatalog' is read separately on desktop (packages/client/src/client/bridge.ts) and shared (packages/host-client/src/bot-settings.ts)",
      ),
    ]);
    expect(checkHostReaders(readers, ['modelCatalog'])).toEqual([]);
  });

  it('asks to lower the baseline once a method has one reader', () => {
    const readers = readersByMethod({
      'packages/host-client/src/storage.ts': "host.call('storageUsage')",
      'packages/client/src/client/storage-settings.tsx': 'loadStorageUsage(bridgeHost(call))',
    });
    expect(checkHostReaders(readers, ['storageUsage'])).toEqual([
      expect.stringContaining('still lists storageUsage'),
    ]);
  });
});
