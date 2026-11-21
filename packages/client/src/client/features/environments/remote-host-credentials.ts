import { secureRandom, keyHex, keyBytes } from '@botharness/host-client/encrypted-carrier';
import { noisePublicKey } from '@botharness/host-protocol/noise/xk';
import { withRemoteHostCredentialWrite } from '../../remote-host-storage-lock.js';
import type { HostCarrier } from '@botharness/host-protocol/carrier';
import { isCustodyHandle, serializeSavedHost, type SavedHost } from '@botharness/host-client/hosts';
import { revokePairing } from '@botharness/host-client/pairing';
import type { HostStorage, RemoteHostCustody } from './remote-host-types.js';
import {
  REMOTE_HOSTS_STORAGE_KEY,
  readReleaseQueue,
  updateReleaseQueue,
} from './remote-host-storage.js';

class SealOutdated extends Error {}

function devicePublicKey(host: SavedHost): string | undefined {
  const key = host.encryption?.deviceKey;
  if (key === undefined || isCustodyHandle(host.credential)) return key;
  return keyHex(noisePublicKey(keyBytes(key)));
}

export type ChoiceChange<AutomaticChoice> =
  | { kind: 'preserve' | 'suppress' }
  | { kind: 'clear'; expected: string | null }
  | { kind: 'restore'; choice: AutomaticChoice };

type AutomaticChoice = {
  kind: 'automatic-enrollment-suppressed';
  hostId: string;
  generation?: string | undefined;
  publicKey: string | null;
};

export function createRemoteHostCredentials<Choice extends AutomaticChoice>(options: {
  storage: HostStorage | undefined;
  custody: RemoteHostCustody | undefined;
  carrier: HostCarrier;
  readHosts: (storage: HostStorage | undefined) => SavedHost[];
  readAutomaticChoices: (storage: HostStorage | undefined) => Choice[];
  choiceSnapshot: (choice: Choice | undefined) => string | null;
  preserveEnrollment: (next: SavedHost, sealed: SavedHost) => SavedHost;
}) {
  const {
    storage,
    custody,
    carrier,
    readHosts,
    readAutomaticChoices,
    choiceSnapshot,
    preserveEnrollment,
  } = options;
  const sealedHandles = new Map<string, string>();
  const forgetHandle = async (handle: string, raw?: string): Promise<void> => {
    if (!custody) return;
    updateReleaseQueue(storage, (handles) => [...handles, handle]);
    if (readHosts(storage).some((saved) => saved.credential === handle)) return;
    try {
      await custody.forget(handle);
      updateReleaseQueue(storage, (handles) => handles.filter((item) => item !== handle));
      if (raw !== undefined) sealedHandles.delete(raw);
    } catch {}
  };
  const releasePending = async (): Promise<void> => {
    for (const handle of readReleaseQueue(storage)) await forgetHandle(handle);
  };
  const sameCredential = (a: SavedHost, b: SavedHost): boolean =>
    a.hostId === b.hostId &&
    a.deviceId === b.deviceId &&
    (isCustodyHandle(a.credential) === isCustodyHandle(b.credential)
      ? a.credential === b.credential
      : (sealedHandles.get(a.credential) ?? a.credential) ===
        (sealedHandles.get(b.credential) ?? b.credential)) &&
    a.encryption?.hostKey === b.encryption?.hostKey &&
    devicePublicKey(a) === devicePublicKey(b) &&
    a.relationshipId === b.relationshipId;
  const releaseCustody = async (host: SavedHost): Promise<void> => {
    if (!custody) return;
    const handle = isCustodyHandle(host.credential)
      ? host.credential
      : sealedHandles.get(host.credential);
    if (handle === undefined) return;
    await forgetHandle(handle, isCustodyHandle(host.credential) ? undefined : host.credential);
  };
  const revoke = async (host: SavedHost) => {
    try {
      return await revokePairing({ host, carrier });
    } finally {
      await releaseCustody(host);
    }
  };
  const sealFor = async (next: SavedHost): Promise<SavedHost> => {
    if (!custody) return next;
    const sealed = await custody.seal(next);
    if (!isCustodyHandle(next.credential)) sealedHandles.set(next.credential, sealed.credential);
    return preserveEnrollment(next, sealed);
  };
  const persistCredential = async (
    hostId: string,
    expected: SavedHost | undefined,
    change: (current: SavedHost | undefined) => SavedHost | undefined,
    choiceChange: ChoiceChange<Choice> = { kind: 'preserve' },
  ): Promise<SavedHost | undefined> => {
    if (!storage) throw new Error('storage-unavailable');
    for (let attempt = 0; ; attempt += 1) {
      let preview: SavedHost | undefined;
      let sealed: SavedHost | undefined;
      let storedBefore: string | undefined;
      if (custody) {
        const stored = readHosts(storage).find((host) => host.hostId === hostId);
        if (expected ? !stored || !sameCredential(stored, expected) : stored !== undefined)
          throw new Error('connection-host-changed');
        storedBefore = JSON.stringify(stored);
        preview = change(stored);
        if (preview) sealed = await sealFor(preview);
      }
      try {
        const written = await writeCredential(
          hostId,
          expected,
          (stored) => {
            const next = change(stored);
            if (!custody || !next) return next;
            if (
              JSON.stringify(stored) !== storedBefore ||
              JSON.stringify(next) !== JSON.stringify(preview)
            )
              throw new SealOutdated();
            return sealed;
          },
          choiceChange,
        );
        await releasePending();
        return written;
      } catch (error) {
        if (sealed && preview && !isCustodyHandle(preview.credential)) {
          if (sealedHandles.get(preview.credential) === sealed.credential)
            sealedHandles.delete(preview.credential);
          await forgetHandle(sealed.credential);
        }
        if (!(error instanceof SealOutdated) || attempt >= 2)
          throw error instanceof SealOutdated ? new Error('connection-host-changed') : error;
      }
    }
  };
  const writeCredential = async (
    hostId: string,
    expected: SavedHost | undefined,
    change: (current: SavedHost | undefined) => SavedHost | undefined,
    choiceChange: ChoiceChange<Choice>,
  ): Promise<SavedHost | undefined> => {
    if (!storage) throw new Error('storage-unavailable');
    return withRemoteHostCredentialWrite({
      storage,
      run: () => {
        const current = readHosts(storage);
        const stored = current.find((host) => host.hostId === hostId);
        if (expected ? !stored || !sameCredential(stored, expected) : stored !== undefined)
          throw new Error('connection-host-changed');
        const next = change(stored);
        const currentChoices = readAutomaticChoices(storage);
        if (
          choiceChange.kind === 'clear' &&
          choiceSnapshot(currentChoices.find((choice) => choice.hostId === hostId)) !==
            choiceChange.expected
        )
          throw new Error('client-automatic-choice-changed');
        const hosts = current.filter((host) => host.hostId !== hostId);
        if (next) hosts.push(next);
        const clearChoice = choiceChange.kind === 'clear';
        const choices: AutomaticChoice[] = currentChoices.filter(
          (choice) =>
            choice.hostId !== hostId || (!clearChoice && choiceChange.kind !== 'suppress'),
        );
        if (choiceChange.kind === 'restore' && !choices.some((choice) => choice.hostId === hostId))
          choices.push(choiceChange.choice);
        if (choiceChange.kind === 'suppress' && expected) {
          if (choices.length >= 256) throw new Error('client-automatic-choice-limit');
          choices.push({
            kind: 'automatic-enrollment-suppressed',
            hostId,
            generation: keyHex(secureRandom(carrier)),
            publicKey: expected.encryption?.hostKey ?? null,
          });
        }
        storage.setItem(
          REMOTE_HOSTS_STORAGE_KEY,
          JSON.stringify([...hosts.map(serializeSavedHost), ...choices]),
        );
        try {
          storage.removeItem('botharness.computers.v1');
        } catch {}
        return next;
      },
    });
  };

  return { releasePending, sameCredential, releaseCustody, revoke, persistCredential };
}
