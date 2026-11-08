import type { Plugin } from 'vitest/config';

interface AssetIdentity {
  bytes: number;
  sha256: string;
}

export declare function buildGenuiRuntimeAssets(): Promise<{
  rendererSource: string;
  clientModuleSource: string;
  metadata: {
    renderer: AssetIdentity;
    worker: AssetIdentity;
    library: AssetIdentity;
    wasm: AssetIdentity;
  };
  inputs: string[];
}>;

export declare function genuiRuntimeAssetsPlugin(target: 'client' | 'core'): Plugin;
