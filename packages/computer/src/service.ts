import type { SelkiesWebRtcContainer } from '../../core/src/http/selkies-webrtc.js';
import type { ComputerProvider, ComputerRuntimeProbe, ComputerStatus } from './provider.js';

export interface ComputerService {
  readonly providerName: string | undefined;
  registerProvider(provider: ComputerProvider): () => void;
  probe(): Promise<ComputerRuntimeProbe>;
  status(): Promise<ComputerStatus>;
  start(): Promise<void>;
  stop(): Promise<void>;
  upstream(): URL | undefined;
  webrtc(): SelkiesWebRtcContainer | undefined;
  exportTo(destDir: string): Promise<string>;
  importFrom(archive: string): Promise<void>;
}

export function createComputerService(): ComputerService {
  let registration: { provider: ComputerProvider; token: symbol } | undefined;

  const requireProvider = (): ComputerProvider => {
    if (registration === undefined) {
      throw new Error('botharness computer: no provider is registered');
    }
    return registration.provider;
  };

  return {
    get providerName(): string | undefined {
      return registration?.provider.name;
    },
    registerProvider(provider: ComputerProvider): () => void {
      if (registration !== undefined) {
        throw new Error(
          `botharness computer: provider "${registration.provider.name}" is already registered`,
        );
      }
      const token = Symbol(provider.name);
      registration = { provider, token };
      return () => {
        if (registration?.token === token) registration = undefined;
      };
    },
    probe: async () => requireProvider().probe(),
    status: async () => requireProvider().status(),
    start: async () => {
      await requireProvider().start();
    },
    stop: async () => {
      await requireProvider().stop();
    },
    upstream: () => registration?.provider.upstream(),
    webrtc: () => registration?.provider.webrtc,
    exportTo: async (destDir: string) => {
      const provider = requireProvider();
      if (provider.exportTo === undefined) {
        throw new Error(`botharness computer: provider "${provider.name}" cannot export`);
      }
      return provider.exportTo(destDir);
    },
    importFrom: async (archive: string) => {
      const provider = requireProvider();
      if (provider.importFrom === undefined) {
        throw new Error(`botharness computer: provider "${provider.name}" cannot import`);
      }
      await provider.importFrom(archive);
    },
  };
}
