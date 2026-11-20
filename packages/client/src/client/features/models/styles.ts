import { space, text } from '../../ds/tokens.stylex.js';

export const modelsCss = {
  modelEntry: `.bh-model-entry,
.bh-wake-policy-entry {
  display: flex;
  flex-direction: column;
  gap: ${space.x3};
  min-width: 0;
}
.bh-model-picker, .bh-model-allowed {
  display: flex;
  flex-direction: column;
  gap: ${space.x3};
  min-width: 0;
}
.bh-model-picker-heading {
  display: flex;
  flex-direction: column;
  gap: ${space.x1};
  font-size: ${text.bodySize};
}
.bh-model-picker-heading > span {
  color: var(--tobs-ink-secondary);
  font-size: ${text.metaSize};
}
.bh-model-picker-effort {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${space.x4};
  flex-wrap: wrap;
  color: var(--tobs-ink-secondary);
  font-size: ${text.metaSize};
}
.bh-model-task {
  display: flex;
  flex-direction: column;
  gap: ${space.x3};
  min-width: 0;
}
.bh-model-picker-heading-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: ${space.x4};
  min-width: 0;
}
.bh-model-picker-heading-row > .bh-model-picker-heading {
  flex: 1;
  min-width: 0;
}
.bh-model-picker-heading-row > :last-child {
  flex: none;
}
`,
  modelTask: `html[data-botharness-motion='reduce'] .bh-model-task > .bh-model-allowed,
html[data-botharness-motion='reduce'] .bh-model-task > .bh-model-picker > * {
  animation: none;
}
.bh-model-card {
  display: flex;
  flex-direction: column;
  gap: ${space.x3};
  padding: ${space.x3} ${space.x4};
}
`,
  modelCardProvider: `.bh-model-card-provider {
  flex: 1;
  min-width: 0;
  color: var(--tobs-ink-secondary);
  font-size: ${text.metaSize};
}
.bh-model-card-field {
  display: flex;
  align-items: center;
  gap: ${space.x2} ${space.x4};
  flex-wrap: wrap;
  font-size: ${text.metaSize};
}
`,
  modelCardEfforts: `.bh-model-card-efforts {
  display: flex;
  flex-wrap: wrap;
  gap: ${space.x2} ${space.x4};
}
`,
};
