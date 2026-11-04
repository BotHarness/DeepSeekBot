import type { CallClientMedia, CallMediaState } from '../../../core/src/voice/call-client.js';

export const CALL_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
};

const GATHER_LIMIT_MS = 4_000;
const GATHER_SETTLE_MS = 1_000;

export class CallMicrophoneError extends Error {
  constructor(readonly code: 'microphone-denied' | 'microphone-missing') {
    super(code);
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

export function createBrowserCallMedia(
  devices: () => MediaDevices | undefined = () => globalThis.navigator?.mediaDevices,
): CallClientMedia {
  const listeners = new Set<(state: CallMediaState, code?: string) => void>();
  let peer: RTCPeerConnection | undefined;
  let stream: MediaStream | undefined;
  let speaker: HTMLAudioElement | undefined;
  let muted = false;
  const emit = (state: CallMediaState, code?: string) => {
    for (const listener of [...listeners]) listener(state, code);
  };
  const release = () => {
    const current = peer;
    peer = undefined;
    if (current !== undefined) {
      current.onconnectionstatechange = null;
      current.ontrack = null;
      current.close();
    }
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
      try {
        stream = await media.getUserMedia({ audio: CALL_AUDIO_CONSTRAINTS, video: false });
      } catch (error) {
        const name = (error as { name?: unknown } | undefined)?.name;
        throw new CallMicrophoneError(
          name === 'NotAllowedError' || name === 'SecurityError'
            ? 'microphone-denied'
            : 'microphone-missing',
        );
      }
      const track = stream.getAudioTracks()[0];
      if (track === undefined) throw new CallMicrophoneError('microphone-missing');
      track.enabled = !muted;
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
      if (transceiver === undefined) current.addTrack(track, stream);
      else {
        await transceiver.sender.replaceTrack(track);
        transceiver.direction = 'sendrecv';
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
    onState(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
