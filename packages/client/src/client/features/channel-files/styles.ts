import { border, color, radius, space, text } from '../../ds/tokens.stylex.js';

export const channelFilesCss = {
  bubbleContent: `/* Files stay part of the same message grouping as their text. */
.bh-bubble-content { min-width: 0; }
.bh-message-attachment { position: relative; min-width: 0; }
.bh-message-file-more { flex: none; color: inherit; }
`,
  messageVoice: `.bh-message-voice:not(:last-child) { margin-bottom: ${space.x3}; }
.bh-message-voice-note { display: block; color: var(--tobs-ink-secondary); font-size: ${text.metaSize}; line-height: ${text.metaLine}; }
.bh-message-voice[data-voice-state='failed'] .bh-message-voice-note { color: var(--tobs-ink-tertiary); }
.bh-message-perf { margin-top: ${space.x2}; color: var(--tobs-ink-tertiary); font-size: ${text.metaSize}; line-height: ${text.metaLine}; font-variant-numeric: tabular-nums; }
.bh-bridge-media-content { white-space: pre-wrap; }
`,
  bridgeImageButton: `.bh-bridge-image-button { display: block; padding: 0; border: 0; background: transparent; cursor: zoom-in; border-radius: ${radius.md}; }
`,
  bridgeImageExpanded: `.bh-bridge-image-expanded { display: block; max-width: 100%; max-height: 75vh; margin: auto; object-fit: contain; }
`,
  messageAlbumCell: `.bh-message-album-cell { position: relative; min-width: 0; min-height: 0; overflow: hidden; }
.bh-message-album-tile { display: block; width: 100%; height: 100%; padding: 0; border: 0; background: color-mix(in srgb, currentColor 8%, transparent); color: inherit; font: inherit; font-size: ${text.metaSize}; cursor: zoom-in; }
`,
  messageAlbumTile: `.bh-message-album-tile .bh-message-image { width: 100%; height: 100%; max-height: none; border-radius: 0; object-fit: cover; }
.bh-message-album-retry { cursor: pointer; }
`,
  messageFile: `.bh-message-file { box-sizing: border-box; flex-wrap: wrap; }
.bh-message-file-row { width: 100%; min-height: 0; padding: 0; flex-wrap: nowrap; border-radius: ${radius.sm}; background: transparent; }
.bh-message-file-row .bh-message-file-main { flex: 1 1 auto; gap: ${space.x4}; border-radius: ${radius.sm}; cursor: pointer; }
`,
  messageFileTile: `.bh-message-file-tile[data-file-tone='red'] { --bh-file-tone: var(--tobs-status-danger-base); }
.bh-message-file-tile[data-file-tone='green'] { --bh-file-tone: var(--tobs-status-success-base); }
.bh-message-file-tile[data-file-tone='blue'] { --bh-file-tone: var(--tobs-accent-solid); }
.bh-message-file-tile[data-file-tone='orange'] { --bh-file-tone: var(--tobs-status-warning-base); }
.bh-message-file-tile[data-file-tone='violet'] { --bh-file-tone: color-mix(in srgb, var(--tobs-accent-solid) 55%, var(--tobs-status-danger-base)); }
.bh-message-file-tile[data-file-tone='gray'] { background: color-mix(in srgb, currentColor 14%, transparent); color: inherit; }
.bh-bubble-me .bh-message-file-tile { background: var(--bh-bubble-me-ink); color: var(--bh-bubble-me-fill); }
.bh-message-file-cleared { border: ${border.hairline} dashed ${color.border}; background: transparent; color: var(--tobs-ink-secondary); }
.bh-message-file-cleared .bh-message-file-icon { opacity: 0.56; }
.bh-message-file-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: ${space.x2}; max-width: 100%; margin-inline-start: auto; }
.bh-message-file-actions > .bh-message-file-divider { display: none; }
.bh-message-file-main { display: flex; align-items: center; gap: ${space.x3}; flex: 1 1 16ch; min-width: 0; max-width: 100%; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; text-decoration: none; }
button.bh-message-file-main { cursor: pointer; }
`,
  messageFileCopy: `.bh-message-file-copy { display: flex; flex-direction: column; flex: 1; gap: ${space.x1}; min-width: 0; }
.bh-message-file-name { display: block; overflow: hidden; min-width: 0; white-space: nowrap; text-overflow: ellipsis; font-size: ${text.bodySize}; font-weight: ${text.strong}; line-height: ${text.bodyLine}; }
.bh-message-file-size { color: color-mix(in srgb, currentColor 72%, transparent); font-size: ${text.metaSize}; line-height: ${text.metaLine}; font-variant-numeric: tabular-nums; white-space: nowrap; }
`,
  messageFileDownload: `a.bh-message-file-download:hover, button.bh-message-file-download:hover { background: color-mix(in srgb, currentColor 8%, transparent); }
.bh-message-audio { display: flex; align-items: center; gap: ${space.x4}; min-width: 0; width: fit-content; max-width: 100%; color: inherit; }
`,
  bubbleMe: `.bh-bubble-me .bh-message-audio-play { background: var(--bh-bubble-me-ink); color: var(--bh-bubble-me-fill); }
.bh-message-audio-play:hover:not(:disabled) { opacity: 0.88; }
.bh-message-audio-play:disabled { opacity: 0.5; cursor: default; }
.bh-message-audio-track { display: flex; flex-direction: column; gap: ${space.x1}; min-width: 0; }
`,
  messageAudioSpectrum: `.bh-message-audio-spectrum[aria-disabled='true'] { cursor: default; }
`,
  messageAudioBar: `.bh-message-audio-bar[data-played] { background: ${color.accent}; }
.bh-bubble-me .bh-message-audio-bar[data-played] { background: currentColor; }
.bh-message-audio-meta { color: color-mix(in srgb, currentColor 70%, transparent); font-size: ${text.metaSize}; line-height: ${text.metaLine}; font-variant-numeric: tabular-nums; white-space: nowrap; }
.bh-message-audio-element { display: none; }
.bh-bubble-body {
  font-size: var(--tobs-style-text-message-size);
  line-height: var(--tobs-style-text-message-line);
  text-wrap: pretty;
  white-space: pre-wrap;
  word-break: break-word;
}
.bh-bubble-body-markdown {
  min-width: 0;
  white-space: normal;
}
.bh-bubble-body-markdown > :first-child > :first-child {
  margin-top: 0;
}
.bh-bubble-body-markdown > :first-child > :last-child {
  margin-bottom: 0;
}
.bh-bot-mention-prefix {
  display: inline;
}
.bh-bot-mention-prefix .bh-inline-mention + .bh-inline-mention {
  margin-left: ${space.x2};
}
.bh-bubble-body-bot-mentions > :not(.bh-bot-mention-prefix) {
  display: contents;
}
.bh-bubble-body-bot-mentions > :not(.bh-bot-mention-prefix) > p:first-child {
  display: inline;
  margin: 0;
}
.bh-bubble-body-markdown .md-code-block {
  max-width: 100%;
}
.bh-bubble-body-markdown pre {
  max-width: 100%;
  overflow-x: auto;
}
.bh-message-group-me .bh-bubble-wrap {
  flex-direction: row-reverse;
}
`,
  filePathButton: `.bh-file-path-button.bh-workspace-folder-path { font-size: ${text.metaSize}; }
`,
  fileOpenMain: `.bh-file-open-main, .bh-file-open-more { display: inline-flex; align-items: center; justify-content: center; border: 0; background: transparent; color: inherit; font: inherit; font-size: ${text.metaSize}; font-weight: ${text.strong}; line-height: ${text.metaLine}; cursor: pointer; }
`,
  fileOpen: `.bh-file-open[data-compact] .bh-file-open-main { padding: 0 ${space.x2}; }
.bh-file-open .bh-file-open-main span { color: inherit; font: inherit; }
`,
  fileOpenMainFileOpenMore: `.bh-file-open-main:hover:not(:disabled), .bh-file-open-more:hover:not(:disabled) { background: var(--tobs-state-hover); }
`,
  fileOpenMainFileOpenMoreDisabled: `.bh-file-open-main:disabled, .bh-file-open-more:disabled { opacity: 0.6; cursor: default; }
.bh-file-open[data-default="invalid"] .bh-file-open-main { color: var(--tobs-ink-secondary); }
.bh-file-path-open { display: flex; align-items: center; gap: ${space.x3}; min-width: 0; }
`,
};
