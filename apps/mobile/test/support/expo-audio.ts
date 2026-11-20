const idle = {
  playing: false,
  currentTime: 0,
  duration: 0,
  didJustFinish: false,
  isLoaded: false,
};

const player = {
  play() {},
  pause() {},
  replace() {},
  async seekTo() {},
};

export function useAudioPlayer() {
  return player;
}

export function useAudioPlayerStatus() {
  return idle;
}

export async function setAudioModeAsync() {}
