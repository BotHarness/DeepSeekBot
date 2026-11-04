const FRAME = 1600;
let peer;
let captureContext;
let playContext;
let destination;
let remoteAudio;
let tap;
let answered = false;
let stopped = false;
let connectedSent = false;
let disconnectTimer;
let framesSent = 0;
const parts = new Map();
const playing = new Map();

const WORKLET = `
class PcmTap extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) this.port.postMessage(channel.slice(0));
    return true;
  }
}
registerProcessor('pcm-tap', PcmTap);
`;

function stop() {
  if (stopped) return;
  stopped = true;
  clearTimeout(disconnectTimer);
  for (const source of playing.values()) {
    try {
      source.stop();
    } catch {}
  }
  playing.clear();
  parts.clear();
  peer?.close();
  tap?.disconnect();
  void captureContext?.close().catch(() => undefined);
  void playContext?.close().catch(() => undefined);
  if (remoteAudio) remoteAudio.srcObject = null;
}

function fail() {
  if (stopped) return;
  stop();
  window.callBridge.state('failed');
}

window.addEventListener('beforeunload', stop);

function base64(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

async function startCapture(stream) {
  remoteAudio = new Audio();
  remoteAudio.muted = true;
  remoteAudio.srcObject = stream;
  void remoteAudio.play().catch(() => undefined);
  captureContext = new AudioContext({ sampleRate: 16000 });
  const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));
  await captureContext.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);
  const source = captureContext.createMediaStreamSource(stream);
  tap = new AudioWorkletNode(captureContext, 'pcm-tap', { numberOfInputs: 1, numberOfOutputs: 0 });
  let pending = new Int16Array(FRAME);
  let filled = 0;
  tap.port.onmessage = (event) => {
    if (stopped) return;
    const samples = event.data;
    for (let index = 0; index < samples.length; index += 1) {
      const value = Math.max(-1, Math.min(1, samples[index]));
      pending[filled] = value < 0 ? value * 32768 : value * 32767;
      filled += 1;
      if (filled === FRAME) {
        window.callBridge.pcm(base64(new Uint8Array(pending.buffer)));
        framesSent += 1;
        pending = new Int16Array(FRAME);
        filled = 0;
      }
    }
  };
  source.connect(tap);
  await captureContext.resume();
}

window.callStart = async () => {
  if (peer) throw new Error('Already started');
  try {
    playContext = new AudioContext({ sampleRate: 48000 });
    await playContext.resume();
    destination = playContext.createMediaStreamDestination();
    const outgoing = destination.stream.getAudioTracks()[0];
    peer = new RTCPeerConnection({
      iceServers: [],
      iceTransportPolicy: 'all',
      bundlePolicy: 'max-bundle',
    });
    peer.addEventListener('connectionstatechange', () => {
      const state = peer.connectionState;
      if (state === 'connected') {
        clearTimeout(disconnectTimer);
        if (!connectedSent) {
          connectedSent = true;
          window.callBridge.state('connected');
        }
      } else if (state === 'disconnected') {
        clearTimeout(disconnectTimer);
        disconnectTimer = setTimeout(fail, 5000);
      } else if (state === 'failed' || state === 'closed') fail();
    });
    peer.addEventListener('datachannel', (event) => {
      event.channel.close();
      fail();
    });
    peer.addEventListener('track', (event) => {
      if (event.track.kind !== 'audio' || tap) return fail();
      void startCapture(new MediaStream([event.track])).catch(fail);
    });
    const transceiver = peer.addTransceiver(outgoing, {
      direction: 'sendrecv',
      streams: [destination.stream],
    });
    const opus = RTCRtpSender.getCapabilities('audio').codecs.filter(
      (codec) => codec.mimeType.toLowerCase() === 'audio/opus',
    );
    if (!opus.length) throw new Error('Opus unavailable');
    transceiver.setCodecPreferences(opus);
    await peer.setLocalDescription(await peer.createOffer());
    await new Promise((resolve, reject) => {
      let candidates = 0;
      const finish = (error) => {
        clearTimeout(timer);
        clearTimeout(settle);
        peer.removeEventListener('icegatheringstatechange', complete);
        peer.removeEventListener('icecandidate', candidate);
        if (error) reject(error);
        else resolve();
      };
      const timer = setTimeout(() => finish(new Error('ICE timeout')), 7000);
      const settle = setTimeout(() => {
        if (candidates > 0) finish();
      }, 2500);
      function complete() {
        if (peer.iceGatheringState === 'complete') finish();
      }
      function candidate(event) {
        if (event.candidate) candidates += 1;
      }
      peer.addEventListener('icegatheringstatechange', complete);
      peer.addEventListener('icecandidate', candidate);
      complete();
    });
    return { offer: { type: 'offer', sdp: peer.localDescription.sdp } };
  } catch (error) {
    stop();
    throw error;
  }
};

window.callAnswer = async (sdp) => {
  if (!peer || answered) throw new Error('Stale answer');
  answered = true;
  await peer.setRemoteDescription({ type: 'answer', sdp });
  return null;
};

window.callAudio = (playback, data) => {
  if (stopped) throw new Error('Stopped');
  const list = parts.get(playback) ?? [];
  if (!parts.has(playback)) {
    if (parts.size >= 4) throw new Error('Too many pending playbacks');
    parts.set(playback, list);
  }
  list.push(data);
  return null;
};

window.callPlay = async (playback, _mime) => {
  const list = parts.get(playback);
  parts.delete(playback);
  if (!list || stopped || !playContext || !destination) throw new Error('No audio');
  const binary = atob(list.join(''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  let buffer;
  try {
    buffer = await playContext.decodeAudioData(bytes.buffer);
  } catch {
    window.callBridge.played(playback, false);
    return { started: false };
  }
  const source = playContext.createBufferSource();
  source.buffer = buffer;
  source.connect(destination);
  playing.set(playback, source);
  source.addEventListener('ended', () => {
    if (!playing.delete(playback)) return;
    window.callBridge.played(playback, true);
  });
  source.start();
  return { started: true, durationMs: Math.round(buffer.duration * 1000) };
};

window.callStop = (playback) => {
  parts.delete(playback);
  const source = playing.get(playback);
  playing.delete(playback);
  try {
    source?.stop();
  } catch {}
  return null;
};

window.callStats = async () => {
  const result = { state: peer?.connectionState ?? 'new', framesSent, path: 'unknown' };
  if (!peer) return result;
  const stats = await peer.getStats();
  for (const report of stats.values()) {
    if (
      report.type === 'candidate-pair' &&
      report.nominated === true &&
      report.state === 'succeeded'
    ) {
      const local = stats.get(report.localCandidateId);
      const remote = stats.get(report.remoteCandidateId);
      if (local?.candidateType && remote?.candidateType)
        result.path =
          local.candidateType === 'relay' || remote.candidateType === 'relay' ? 'relay' : 'direct';
      if (Number.isFinite(report.currentRoundTripTime))
        result.roundTripTimeMs = report.currentRoundTripTime * 1000;
    }
    if (
      report.type === 'inbound-rtp' &&
      report.kind === 'audio' &&
      Number.isFinite(report.bytesReceived)
    )
      result.bytesReceived = report.bytesReceived;
    if (
      report.type === 'outbound-rtp' &&
      report.kind === 'audio' &&
      Number.isFinite(report.bytesSent)
    )
      result.bytesSent = report.bytesSent;
  }
  return result;
};

window.callBridge.ready();
