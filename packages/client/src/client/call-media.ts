import {
  CallMediaFailure,
  type CallClientMedia,
  type CallMediaCode,
  type CallMediaState,
} from '../../../core/src/voice/call-client.js';

import {
  ComputerSoundMissing,
  mixSound,
  openComputerSound,
  type ComputerSound,
  type SoundMix,
} from './computer-sound.js';
import { openMicrophone } from './mic-device.js';
import { levelDbfs, meterFraction } from './voice-level.js';

export { CALL_AUDIO_CONSTRAINTS } from './mic-device.js';

const GATHER_LIMIT_MS = 4_000;
const GATHER_SETTLE_MS = 1_000;

const MICROPHONE_MESSAGE = {
  'microphone-denied': 'Microphone access is blocked for this page.',
  'microphone-missing': 'No microphone could be opened for the call.',
} as const;

export class CallMicrophoneError extends CallMediaFailure {
  constructor(override readonly code: 'microphone-denied' | 'microphone-missing') {
    super(code, MICROPHONE_MESSAGE[code]);
  }
}

function gathered(peer: RTCPeerConnection): Promise<void> {
  return new Promise((done) => {
    if (peer.iceGatheringState === 'complete') return done();
    let settle: ReturnType<typeof setTimeout> | undefined;
    const limit = setTimeout(finish, GATHER_LIMIT_MS);
    function finish(): void {
      clearTimeout(limit);
      clearTimeout(settle);
      peer.removeEventListener('icegatheringstatechange', state);
      peer.removeEventListener('icecandidate', candidate);
      done();
    }
    function state(): void {
      if (peer.iceGatheringState === 'complete') finish();
    }
    function candidate(event: RTCPeerConnectionIceEvent): void {
      if (event.candidate === null) finish();
      else if (settle === undefined) settle = setTimeout(finish, GATHER_SETTLE_MS);
    }
    peer.addEventListener('icegatheringstatechange', state);
    peer.addEventListener('icecandidate', candidate);
  });
}

export interface BrowserCallMedia extends CallClientMedia {
  level(): number;
  computerSound(on: boolean): Promise<boolean>;
  onComputerSound(listener: (on: boolean) => void): () => void;
}

interface MicMeter {
  read(): number;
  close(): void;
}

function meterMicrophone(stream: MediaStream): MicMeter | undefined {
  if (typeof AudioContext !== 'function') return undefined;
  try {
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    context.createMediaStreamSource(stream).connect(analyser);
    void context.resume().catch(() => undefined);
    const samples = new Float32Array(analyser.fftSize);
    return {
      read() {
        analyser.getFloatTimeDomainData(samples);
        return meterFraction(levelDbfs(samples));
      },
      close: () => void context.close().catch(() => undefined),
    };
  } catch {
    return undefined;
  }
}

export function createBrowserCallMedia(
  devices: () => MediaDevices | undefined = () => globalThis.navigator?.mediaDevices,
  options: { readonly computerSound?: () => Promise<ComputerSound> } = {},
): BrowserCallMedia {
  const listeners = new Set<(state: CallMediaState, code?: CallMediaCode) => void>();
  const soundListeners = new Set<(on: boolean) => void>();
  const openSound = options.computerSound ?? (() => openComputerSound(devices()));
  let peer: RTCPeerConnection | undefined;
  let sender: RTCRtpSender | undefined;
  let computer: { readonly sound: ComputerSound; readonly mix: SoundMix } | undefined;
  let opening: Promise<boolean> | undefined;
  let shareToken = 0;
  let stream: MediaStream | undefined;
  let speaker: HTMLAudioElement | undefined;
  let meter: MicMeter | undefined;
  let generation = 0;
  let muted = false;
  const emit = (state: CallMediaState, code?: CallMediaCode) => {
    for (const listener of [...listeners]) listener(state, code);
  };
  const emitSound = (on: boolean) => {
    for (const listener of [...soundListeners]) listener(on);
  };
  const dropComputer = () => {
    shareToken += 1;
    const owned = computer;
    computer = undefined;
    if (owned === undefined) return false;
    owned.mix.close();
    owned.sound.release();
    return true;
  };
  const unshare = async () => {
    const mic = stream?.getAudioTracks()[0];
    const owner = sender;
    if (!dropComputer()) return false;
    if (owner !== undefined && mic !== undefined)
      await owner.replaceTrack(mic).catch(() => undefined);
    emitSound(false);
    return false;
  };
  const share = async () => {
    const mic = stream?.getAudioTracks()[0];
    const owner = sender;
    if (mic === undefined || owner === undefined) throw new ComputerSoundMissing();
    const token = shareToken;
    const sound = await openSound();
    if (token !== shareToken || sender !== owner) {
      sound.release();
      return false;
    }
    let mix: SoundMix | undefined;
    try {
      mix = mixSound(mic, sound.track);
      await owner.replaceTrack(mix.track);
    } catch {
      mix?.close();
      sound.release();
      throw new ComputerSoundMissing();
    }
    if (token !== shareToken || sender !== owner) {
      mix.close();
      sound.release();
      return false;
    }
    const owned = { sound, mix };
    computer = owned;
    sound.onEnded(() => {
      if (computer === owned) void unshare();
    });
    emitSound(true);
    return true;
  };
  const release = () => {
    generation += 1;
    if (dropComputer()) emitSound(false);
    sender = undefined;
    const current = peer;
    peer = undefined;
    if (current !== undefined) {
      current.onconnectionstatechange = null;
      current.ontrack = null;
      current.close();
    }
    meter?.close();
    meter = undefined;
    for (const track of stream?.getTracks() ?? []) track.stop();
    stream = undefined;
    if (speaker !== undefined) {
      speaker.pause();
      speaker.srcObject = null;
      speaker = undefined;
    }
  };
  return {
    async start({ offer }) {
      release();
      const media = devices();
      if (media?.getUserMedia === undefined) throw new CallMicrophoneError('microphone-missing');
      const owned = generation;
      let acquired: MediaStream;
      try {
        acquired = (await openMicrophone(media)).stream;
      } catch (error) {
        const name = (error as { name?: unknown } | undefined)?.name;
        throw new CallMicrophoneError(
          name === 'NotAllowedError' || name === 'SecurityError'
            ? 'microphone-denied'
            : 'microphone-missing',
        );
      }
      if (owned !== generation) {
        for (const late of acquired.getTracks()) late.stop();
        throw new Error('call-stopped');
      }
      stream = acquired;
      const track = stream.getAudioTracks()[0];
      if (track === undefined) throw new CallMicrophoneError('microphone-missing');
      track.enabled = !muted;
      meter = meterMicrophone(stream);
      const current = new RTCPeerConnection({ iceServers: [] });
      peer = current;
      current.ontrack = (event) => {
        if (peer !== current) return;
        speaker ??= new Audio();
        speaker.autoplay = true;
        speaker.srcObject = new MediaStream([event.track]);
        void speaker.play().catch(() => undefined);
      };
      current.onconnectionstatechange = () => {
        if (peer !== current) return;
        if (current.connectionState === 'connected') emit('connected');
        else if (current.connectionState === 'failed') emit('failed', 'ice-failed');
      };
      await current.setRemoteDescription({ type: 'offer', sdp: offer });
      const transceiver = current
        .getTransceivers()
        .find((entry) => entry.receiver.track.kind === 'audio');
      if (transceiver === undefined) sender = current.addTrack(track, stream);
      else {
        await transceiver.sender.replaceTrack(track);
        transceiver.direction = 'sendrecv';
        sender = transceiver.sender;
      }
      await current.setLocalDescription(await current.createAnswer());
      await gathered(current);
      if (peer !== current || current.localDescription === null) throw new Error('call-stopped');
      return current.localDescription.sdp;
    },
    mute(next) {
      muted = next;
      for (const track of stream?.getAudioTracks() ?? []) track.enabled = !next;
    },
    stop() {
      release();
      muted = false;
    },
    level: () => (muted || meter === undefined ? 0 : meter.read()),
    computerSound(on) {
      if (!on) return unshare();
      if (computer !== undefined) return Promise.resolve(true);
      opening ??= share().finally(() => {
        opening = undefined;
      });
      return opening;
    },
    onComputerSound(listener) {
      soundListeners.add(listener);
      return () => soundListeners.delete(listener);
    },
    onState(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
