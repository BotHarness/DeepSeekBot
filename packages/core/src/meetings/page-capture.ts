export const MEETING_PCM_BINDING = '__bhMeetingPcm';
export const MEETING_CAPTURE_RATE = 16_000;

export function meetingCaptureScript(): string {
  return `(() => {
  if (window.__bhMeeting) return;
  const RATE = ${MEETING_CAPTURE_RATE};
  const send = (pcm) => {
    const bytes = new Uint8Array(pcm.buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    try { window.${MEETING_PCM_BINDING}(btoa(binary)); } catch {}
  };
  const connect = AudioNode.prototype.connect;
  const state = { tracks: 0, contexts: 0, chunks: 0, silenced: 0 };
  window.__bhMeeting = state;
  let mixer;
  const ensureMixer = () => {
    if (mixer) return mixer;
    const ctx = new AudioContext({ sampleRate: RATE });
    const bus = ctx.createGain();
    const tap = ctx.createScriptProcessor(2048, 1, 1);
    const mute = ctx.createGain();
    mute.gain.value = 0;
    tap.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      const pcm = new Int16Array(input.length);
      for (let i = 0; i < input.length; i += 1) {
        const value = Math.max(-1, Math.min(1, input[i]));
        pcm[i] = value < 0 ? value * 0x8000 : value * 0x7fff;
      }
      state.chunks += 1;
      send(pcm);
    };
    connect.call(bus, tap);
    connect.call(tap, mute);
    connect.call(mute, ctx.destination);
    const resume = () => { if (ctx.state !== 'running') ctx.resume().catch(() => {}); };
    resume();
    setInterval(resume, 1000);
    mixer = { ctx, bus };
    return mixer;
  };
  const addStream = (stream, remote) => {
    const { ctx, bus } = ensureMixer();
    connect.call(ctx.createMediaStreamSource(stream), bus);
    if (!remote) return;
    const sink = new Audio();
    sink.muted = true;
    sink.srcObject = stream;
    sink.play().catch(() => {});
  };
  const devices = navigator.mediaDevices;
  if (devices && devices.getUserMedia) {
    const getUserMedia = devices.getUserMedia.bind(devices);
    let quiet;
    devices.getUserMedia = async (constraints) => {
      const stream = await getUserMedia(constraints);
      const tracks = stream.getTracks().map((track) => {
        track.stop();
        if (track.kind === 'audio') {
          quiet ??= new AudioContext().createMediaStreamDestination();
          return quiet.stream.getAudioTracks()[0].clone();
        }
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 360;
        const paint = canvas.getContext('2d');
        paint.fillStyle = '#202124';
        paint.fillRect(0, 0, canvas.width, canvas.height);
        return canvas.captureStream(1).getVideoTracks()[0];
      });
      state.silenced += 1;
      return new MediaStream(tracks);
    };
  }
  const Native = window.RTCPeerConnection;
  if (Native) {
    const Wrapped = function (...args) {
      const pc = new Native(...args);
      pc.addEventListener('track', (event) => {
        if (event.track.kind !== 'audio') return;
        state.tracks += 1;
        addStream(new MediaStream([event.track]), true);
      });
      return pc;
    };
    Wrapped.prototype = Native.prototype;
    Object.setPrototypeOf(Wrapped, Native);
    window.RTCPeerConnection = Wrapped;
    window.webkitRTCPeerConnection = Wrapped;
  }
  const taps = new WeakMap();
  AudioNode.prototype.connect = function (target, ...rest) {
    const result = connect.call(this, target, ...rest);
    if (typeof AudioDestinationNode !== 'undefined' && target instanceof AudioDestinationNode &&
        (!mixer || this.context !== mixer.ctx)) {
      let tap = taps.get(this.context);
      if (!tap) {
        tap = this.context.createMediaStreamDestination();
        taps.set(this.context, tap);
        state.contexts += 1;
        addStream(tap.stream, false);
      }
      connect.call(this, tap);
    }
    return result;
  };
})();`;
}
