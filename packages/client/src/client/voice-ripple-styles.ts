import { radius } from './ds/tokens.stylex.js';

export const VOICE_RIPPLE_CSS = `
.bh-voice-ripple[data-ripple='on'] {
  position: relative;
  isolation: isolate;
  animation: bh-voice-pulse 1.6s var(--ds-ease-in-out) infinite;
}
.bh-voice-ripple[data-ripple='on']::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: ${radius.round};
  pointer-events: none;
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 40%, transparent);
  opacity: calc(0.2 + var(--bh-voice-level, 0) * 0.6);
  transform: scale(calc(1 + var(--bh-voice-level, 0) * var(--bh-voice-reach, 0.85)));
  transition: transform 60ms linear, opacity 60ms linear;
}
@keyframes bh-voice-pulse {
  0% {
    box-shadow:
      0 0 0 0 color-mix(in srgb, var(--dsw-alias-state-business-primary) 45%, transparent),
      0 0 0 0 color-mix(in srgb, var(--dsw-alias-state-business-primary) 30%, transparent);
  }
  100% {
    box-shadow:
      0 0 0 var(--bh-voice-pulse-near, 8px) transparent,
      0 0 0 var(--bh-voice-pulse-far, 14px) transparent;
  }
}
html[data-botharness-motion='reduce'] .bh-voice-ripple[data-ripple='on'] { animation: none; }
html[data-botharness-motion='reduce'] .bh-voice-ripple[data-ripple='on']::before { transform: none; transition: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-state-business-primary) calc(20% + var(--bh-voice-level, 0) * 60%), transparent); }
`;
