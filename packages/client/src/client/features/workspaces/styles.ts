import { border, color, radius, space, text } from '../../ds/tokens.stylex.js';

export const workspacesCss = {
  workspaceGrants: `.bh-workspace-grants {
  display: flex;
  flex-direction: column;
  gap: ${space.x3};
  min-width: 0;
}
.bh-workspace-folder-table {
  overflow: hidden;
  border: ${border.hairline} solid ${color.border};
  border-radius: ${radius.md};
}
.bh-workspace-folder-row + .bh-workspace-folder-row {
  border-top: ${border.hairline} solid ${color.divider};
}
.bh-workspace-folder-main {
  display: flex;
  align-items: stretch;
  min-width: 0;
}
.bh-workspace-folder-toggle {
  display: flex;
  flex: 1;
  align-items: center;
  gap: ${space.x3};
  min-width: 0;
  padding: ${space.x3} ${space.x3};
  border: 0;
  background: transparent;
  color: var(--tobs-ink-primary);
  text-align: left;
  cursor: pointer;
}
.bh-workspace-folder-toggle:hover,
.bh-workspace-folder-remove:hover {
  background: var(--tobs-state-hover);
}
.bh-workspace-folder-chevron {
  flex: none;
  color: var(--tobs-ink-secondary);
  transform: rotate(-90deg);
}
.bh-workspace-folder-chevron.bh-expanded {
  transform: rotate(0);
}
`,
  workspaceFolderRemove: `.bh-workspace-folder-remove:hover {
  color: var(--tobs-ink-primary);
}
`,
  workspaceFolderPath: `.bh-workspace-folder-path {
  max-width: 100%;
  overflow-wrap: anywhere;
  color: var(--tobs-ink-secondary);
  font-size: ${text.metaSize};
}
.bh-workspace-folder-secondary {
  min-width: 0;
}
.bh-workspace-folder-secondary > summary {
  width: 100%;
  list-style: none;
}
.bh-workspace-folder-secondary > summary::-webkit-details-marker {
  display: none;
}
.bh-workspace-folder-secondary .bh-workspace-folder-table,
.bh-workspace-folder-manual {
  margin-top: ${space.x3};
}
.bh-workspace-folder-manual {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: ${space.x3};
}
.bh-workspace-folder-manual input {
  width: 100%;
}
`,
};
