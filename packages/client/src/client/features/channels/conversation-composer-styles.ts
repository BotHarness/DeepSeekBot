import { border, color, radius, space, text } from '../../ds/tokens.stylex.js';
import { font } from '../../ds/tobs.stylex.js';
import { channelsCss } from './styles.js';

export const CONVERSATION_COMPOSER_CSS = [
  channelsCss.composerRichInput,
  `.bh-composer-inline-attachment {
  display: inline-flex;
  align-items: center;
  gap: ${space.x2};
  box-sizing: border-box;
  max-width: min(100%, 320px);
  padding: 0 ${space.x2};
  font: inherit;
  line-height: ${text.bodyLine};
  border: ${border.hairline} solid ${color.border};
  border-radius: ${radius.sm};
  vertical-align: middle;
  user-select: all;
  cursor: pointer;
}
`,
  channelsCss.composerInlineAttachment,
  `.bh-composer-attachment-reference { display: grid; place-items: center; flex: none; width: 24px; height: 24px; padding: 0; border: 0; border-radius: ${radius.sm}; background: transparent; color: var(--tobs-ink-secondary); cursor: pointer; }
`,
  channelsCss.composerAttachmentReference,
  `.bh-composer-attachment-reference:focus-visible { outline: ${border.focus} solid var(--tobs-line-focus); outline-offset: 2px; }
`,
  channelsCss.composerAttachmentReferenceDisabled,
  `.bh-composer-image-reference,
.bh-composer-file-reference { position: absolute; bottom: 2px; right: 2px; width: 20px; height: 20px; }
.bh-delivery-trigger {
  position: absolute;
  z-index: 2;
  right: -27px;
  bottom: 2px;
  display: grid;
  place-items: center;
  min-width: 22px;
  height: 22px;
  padding: 0 ${space.x1};
  border: 0;
  border-radius: 999px;
  background: var(--tobs-layer-canvas);
  cursor: pointer;
}
.bh-message-group-me .bh-delivery-trigger {
  right: auto;
  left: -27px;
}
`,
  channelsCss.deliveryTrigger,
  `.bh-delivery-trigger:focus-visible {
  outline: ${border.focus} solid var(--tobs-ink-primary);
  outline-offset: 2px;
}

`,
  channelsCss.deliveryStack,
  `.bh-delivery-human-avatar {
  display: grid;
  place-items: center;
  overflow: hidden;
  width: 22px;
  height: 22px;
  flex: none;
  border-radius: ${radius.round};
  background: var(--tobs-state-hover);
  color: var(--tobs-ink-primary);
  font-weight: ${text.strong};
}
`,
  channelsCss.deliveryLegendRetryable,
  `/* The receipt card portals to body so it remains visible at the edge of the
   scrolling Channel timeline. It reads DSH tokens directly, like HoverCard. */
.bh-delivery-panel {
  position: fixed;
  z-index: 1000;
  width: min(320px, calc(100vw - 16px));
  max-height: min(400px, calc(100vh - 16px));
  overflow: auto;
  padding: ${space.x4};
  border: ${border.hairline} solid ${color.border};
  border-radius: ${radius.md};
  background: var(--tobs-layer-raised);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--tobs-ink-primary) 12%, transparent);
  color: var(--tobs-ink-primary);
  font: ${text.metaSize}/1.5 ${font.familySans};
}
.bh-delivery-panel:focus {
  outline: ${border.focus} solid var(--tobs-ink-primary);
  outline-offset: 2px;
}
`,
  channelsCss.deliveryPanelSummary,
  `.bh-delivery-legend {
  display: inline-block;
  width: 8px;
  height: 8px;
  flex: none;
  border-radius: ${radius.round};
  background: currentColor;
}
`,
  channelsCss.deliveryPanelGroup,
  `.bh-mention-picker {
  max-height: 280px;
  overflow-y: auto;
  border: ${border.hairline} solid ${color.border};
  border-radius: ${radius.md};
  background: var(--tobs-layer-raised);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--tobs-ink-primary) 12%, transparent);
}
`,
  channelsCss.mentionOption,
  `.bh-composer {
  --bh-composer-body-height: 34px;
  --bh-composer-compact-padding-left: 48px;
  --bh-composer-compact-padding-right: 52px;
  position: relative;
  min-height: 50px;
  box-sizing: border-box;
  overflow: hidden;
  --bh-composer-footer-padding: 10px 12px 48px;
  padding: var(--bh-composer-padding, ${space.x3} var(--bh-composer-compact-padding-right) ${space.x3} var(--bh-composer-compact-padding-left));
  border: ${border.hairline} solid transparent;
  transition:
    padding 180ms var(--bh-ease-out),
    border-color 160ms var(--ds-ease-in-out);
}
`,
  channelsCss.composerReply,
  `.bh-composer-attachment-card {
  position: relative;
  display: flex;
  align-items: center;
  flex: 0 0 180px;
  box-sizing: border-box;
  width: 180px;
  height: 48px;
  min-width: 0;
  gap: ${space.x2};
  padding: ${space.x2} ${space.x6} ${space.x2} ${space.x2};
  border-radius: ${radius.sm};
  background: var(--tobs-layer-field);
  color: var(--tobs-ink-secondary);
}
.bh-composer-image-preview {
  display: block;
  flex: none;
  width: 32px;
  height: 32px;
  overflow: hidden;
  border-radius: ${radius.sm};
  padding: 0;
  border: 0;
  background: transparent;
  cursor: zoom-in;
}
`,
  channelsCss.composerImagePreview,
  `.bh-composer-image-preview:focus-visible { outline: ${border.focus} solid var(--tobs-line-focus); outline-offset: -3px; }
`,
  channelsCss.composerImagePreviewImage,
  `.bh-composer-file-icon { display: grid; place-items: center; flex: none; width: 32px; height: 32px; }
.bh-composer-attachment-card .bh-composer-attachment-remove { top: 2px; right: 2px; width: 20px; height: 20px; }
`,
  channelsCss.composerFileCopy,
  `.bh-composer-upload-status { color: var(--tobs-ink-tertiary); font-size: ${text.metaSize}; line-height: 13px; }
.bh-composer-upload-retry { width: fit-content; padding: 0; border: 0; background: transparent; color: var(--tobs-status-danger-base); font-size: ${text.metaSize}; line-height: 13px; cursor: pointer; }
.bh-composer-attachment-remove {
  position: absolute;
  top: 5px;
  right: 5px;
  display: grid;
  place-items: center;
  flex: none;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: ${radius.round};
  background: transparent;
  color: var(--tobs-ink-secondary);
  cursor: pointer;
}
`,
  channelsCss.composerAttachmentRemove,
  `.bh-composer-attachment-remove:focus-visible,
.bh-composer-upload-retry:focus-visible { outline: ${border.focus} solid var(--tobs-line-focus); outline-offset: 2px; }
`,
  channelsCss.composerBody,
  `.bh-composer-first-expand .bh-composer-body {
  transition: height 180ms var(--bh-ease-out);
}
.bh-composer-input {
  display: block;
  font: inherit;
  width: 100%;
  min-width: 0;
  min-height: 34px;
  max-height: 144px;
  box-sizing: border-box;
  border: 0;
  outline: none;
  resize: none;
  padding: 7px 8px 5px;
  background: transparent;
  color: var(--tobs-ink-primary);
  line-height: ${text.bodyLine};
  overflow-wrap: anywhere;
}
`,
  channelsCss.composerInput,
  `.bh-composer-footer {
  position: absolute;
  right: 9px;
  bottom: 9px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}
.bh-composer-has-mic { --bh-composer-compact-padding-right: 88px; }
`,
  channelsCss.composerHasMic,
  `.bh-composer[data-dictation='starting'],
.bh-composer[data-dictation='listening'],
.bh-composer[data-dictation='finishing'] {
  border-color: var(--tobs-accent-solid);
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--tobs-accent-solid) 18%, transparent),
    0 8px 24px color-mix(in srgb, var(--tobs-accent-solid) 16%, transparent);
}
`,
  channelsCss.composer,
].join('');
