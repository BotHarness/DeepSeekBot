let source;
let output;
let peer;
let video;
let frameTimer;
let lastCaptureTime = 0;
let sourceFrames = 0;
let drawnFrames = 0;
let previousEncoded = 0;
let lastEncodedTime = 0;
let answered = false;
let stopped = false;

function stop() {
  if (stopped) return;
  stopped = true;
  clearInterval(frameTimer);
  peer?.close();
  for (const track of source?.getTracks() ?? []) track.stop();
  for (const track of output?.getTracks() ?? []) track.stop();
  if (video) video.srcObject = null;
}
function fail() {
  stop();
  window.localVideoBridge.failed();
}
window.addEventListener('beforeunload', stop);

window.localVideoStart = async (width, height) => {
  if (peer || source) throw new Error('Already started');
  try {
    source = await navigator.mediaDevices.getDisplayMedia({
      audio: false,
      video: {
        frameRate: { ideal: 30, max: 30 },
        width: { ideal: width, max: width },
        height: { ideal: height, max: height },
      },
    });
    const track = source.getVideoTracks()[0];

    await track.applyConstraints({ frameRate: { min: 1, ideal: 30, max: 30 } });
    track.addEventListener('ended', fail);
    track.addEventListener('mute', fail);
    video = document.createElement('video');
    video.muted = true;
    video.srcObject = source;
    const sourceFrame = () => {
      if (stopped) return;
      lastCaptureTime = performance.now();
      sourceFrames += 1;
      video.requestVideoFrameCallback(sourceFrame);
    };
    video.requestVideoFrameCallback(sourceFrame);
    await video.play();
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    if (canvas.width !== width || canvas.height !== height)
      throw new Error('Display geometry mismatch');
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('No video canvas');
    output = canvas.captureStream(0);
    const outgoing = output.getVideoTracks()[0];
    outgoing.contentHint = 'detail';

    frameTimer = setInterval(() => {
      if (track.readyState !== 'live' || track.muted || video.readyState < 2) return;
      try {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        outgoing.requestFrame();
        drawnFrames += 1;
      } catch {
        fail();
      }
    }, 1000 / 30);
    peer = new RTCPeerConnection({
      iceServers: [],
      iceTransportPolicy: 'all',
      bundlePolicy: 'max-bundle',
    });
    peer.addEventListener('connectionstatechange', () => {
      if (peer.connectionState === 'failed' || peer.connectionState === 'closed') fail();
    });
    const transceiver = peer.addTransceiver(outgoing, { direction: 'sendonly', streams: [output] });
    const codecs = RTCRtpSender.getCapabilities('video').codecs.filter(
      (codec) => codec.mimeType.toLowerCase() === 'video/vp8',
    );
    if (!codecs.length) throw new Error('VP8 unavailable');
    transceiver.setCodecPreferences(codecs);
    await peer.setLocalDescription(await peer.createOffer());
    const params = transceiver.sender.getParameters();
    params.encodings[0].maxBitrate = 4_000_000;
    params.encodings[0].maxFramerate = 30;
    params.degradationPreference = 'maintain-resolution';
    await transceiver.sender.setParameters(params);
    await new Promise((resolve, reject) => {
      if (peer.iceGatheringState === 'complete') return resolve();
      const timer = setTimeout(() => {
        peer.removeEventListener('icegatheringstatechange', complete);
        reject(new Error('ICE timeout'));
      }, 7000);
      function complete() {
        if (peer.iceGatheringState !== 'complete') return;
        clearTimeout(timer);
        peer.removeEventListener('icegatheringstatechange', complete);
        resolve();
      }
      peer.addEventListener('icegatheringstatechange', complete);
    });
    return {
      offer: { type: 'offer', sdp: peer.localDescription.sdp },
      display: { width: canvas.width, height: canvas.height },
    };
  } catch (error) {
    stop();
    throw error;
  }
};

window.localVideoBridge.onAnswer(async (sdp) => {
  if (!peer || answered) throw new Error('Stale answer');
  answered = true;
  await peer.setRemoteDescription({ type: 'answer', sdp });
});

window.localVideoStats = async () => {
  const now = performance.now();
  const settings = output?.getVideoTracks()[0]?.getSettings();
  const result = {
    status: 'starting',
    captureAlive:
      source?.getVideoTracks()[0]?.readyState === 'live' &&
      now - lastCaptureTime < 2000 &&
      sourceFrames > 0 &&
      drawnFrames > 0,
    width: settings?.width ?? 0,
    height: settings?.height ?? 0,
    codec: 'VP8',
    path: 'unknown',
  };
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
      if (local?.candidateType && remote?.candidateType) {
        result.path =
          local.candidateType === 'relay' || remote.candidateType === 'relay' ? 'relay' : 'direct';
      }
      if (Number.isFinite(report.currentRoundTripTime))
        result.roundTripTimeMs = report.currentRoundTripTime * 1000;
      if (Number.isFinite(report.availableOutgoingBitrate))
        result.availableOutgoingBitrate = report.availableOutgoingBitrate;
    }
    if (report.type !== 'outbound-rtp' || report.kind !== 'video') continue;
    if (Number.isFinite(report.framesEncoded)) result.framesEncoded = report.framesEncoded;
    if (Number.isFinite(report.bytesSent)) result.bytesSent = report.bytesSent;
    if (typeof report.encoderImplementation === 'string')
      result.encoderImplementation = report.encoderImplementation.slice(0, 80);
  }
  if (result.framesEncoded > previousEncoded) lastEncodedTime = now;
  if (result.framesEncoded !== undefined) previousEncoded = result.framesEncoded;
  if (peer.connectionState === 'connected') {
    result.status =
      result.captureAlive && lastEncodedTime > 0 && now - lastEncodedTime < 4000
        ? 'live'
        : 'stalled';
  } else if (
    peer.connectionState === 'failed' ||
    peer.connectionState === 'closed' ||
    peer.connectionState === 'disconnected'
  ) {
    result.status = 'failed';
  }
  return result;
};
window.localVideoBridge.ready();
