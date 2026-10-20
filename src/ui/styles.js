/**
 * The shell's stylesheet, installed once per page.
 *
 * Colours, radii, fonts and focus rings are exclusively DSH theme tokens
 * (`--dsw-*`), so light and dark themes both come out of the app's own palette;
 * nothing here hard-codes a colour. Only `transparent`, `currentColor` and
 * theme-provided tokens appear in colour positions. The tag is keyed the way
 * shipped plugins key theirs, so a page kept over an HMR reload reuses one tag.
 *
 * ponytail: a plain string rather than a CSS file plus a bundler plugin — the
 * sheet is small and the build stays one esbuild call.
 * @module deepseek-harness-t3-sidebar/ui/styles
 */

/** Selector prefix for this plugin's class names. */
const P = 't3s'

const CSS = `
.${P}-root {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
  height: 100%;
  color: var(--dsw-alias-label-primary);
  font: var(--dsw-font-xs-13);
}

.${P}-chrome {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: none;
  padding: 0 2px 8px;
}

.${P}-chromeRow {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.${P}-control {
  box-sizing: border-box;
  height: 30px;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-button-elevated-fill);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  cursor: pointer;
}

.${P}-control:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.${P}-control:focus-visible,
.${P}-glyph:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -2px;
}

.${P}-select {
  flex: 1;
  /* A native select draws its own arrow; align the caption left, not centred. */
  padding-inline: 8px 24px;
  text-align: left;
  text-overflow: ellipsis;
  appearance: auto;
  cursor: pointer;
}

.${P}-icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
}

.${P}-newSession {
  flex: none;
  justify-content: center;
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
  border-color: transparent;
  font-weight: 500;
}

.${P}-newSession:hover {
  background: var(--dsw-alias-button-primary-hover);
}

.${P}-searchWrap {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
}

.${P}-searchIcon {
  position: absolute;
  left: 8px;
  display: inline-flex;
  color: var(--dsw-alias-label-tertiary);
  pointer-events: none;
}

.${P}-search {
  box-sizing: border-box;
  width: 100%;
  height: 30px;
  padding: 0 8px 0 26px;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
}

.${P}-search::placeholder {
  color: var(--dsw-alias-label-tertiary);
}

.${P}-search:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -1px;
}

.${P}-sections {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0 2px;
  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2);
  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2);
}

.${P}-section {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.${P}-sectionHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 0 6px;
  color: var(--dsw-alias-label-tertiary);
  font: var(--dsw-font-xxxs-11);
  font-weight: 500;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.${P}-sectionLabel {
  margin: 0;
  font: inherit;
  color: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
}

.${P}-sectionCount {
  color: var(--dsw-alias-label-caption);
  font-variant-numeric: tabular-nums;
}

.${P}-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.${P}-row {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 30px;
  padding: 5px 8px;
  border: 0;
  border-radius: var(--dsw-radius-md);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  text-align: left;
  font: inherit;
  cursor: pointer;
}

.${P}-row:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.${P}-row:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -2px;
}

.${P}-rowTitle {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1;
}

.${P}-rowSubagent .${P}-rowTitle {
  color: var(--dsw-alias-label-secondary);
}

.${P}-rowMeta {
  flex: none;
  color: var(--dsw-alias-label-caption);
  font: var(--dsw-font-xxxs-11);
}

.${P}-dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--dsw-alias-label-tertiary);
}

.${P}-dot[data-t3-row-outcome='ok'] {
  background: var(--dsw-alias-state-success-primary);
}

.${P}-dot[data-t3-row-outcome='failed'] {
  background: var(--dsw-alias-state-error-primary);
}

.${P}-dot[data-t3-row-outcome='interrupted'] {
  background: var(--dsw-alias-state-warn-primary);
}

.${P}-dot[data-t3-row-blank='true'] {
  background: transparent;
  border: 1px solid var(--dsw-alias-border-l3);
}

.${P}-empty {
  padding: 6px 8px;
  color: var(--dsw-alias-label-tertiary);
}

.${P}-rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding-top: 2px;
}

.${P}-glyph {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: var(--dsw-radius-md);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
}

.${P}-glyph:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.${P}-glyphNew {
  border: 0.5px solid var(--dsw-alias-border-l3);
  background: var(--dsw-alias-button-elevated-fill);
}

.${P}-visuallyHidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

@media (prefers-reduced-motion: reduce) {
  .${P}-control,
  .${P}-row,
  .${P}-glyph {
    transition: none;
  }
}
`

/** Deterministic tag id, matching shipped plugins' `data-plugin-css` convention. */
const TAG_ID = 'deepseek-harness-t3-sidebar/shell.css'

/** Install the sheet once; a page that already carries it is left alone. */
export function installStyles() {
  if (typeof document === 'undefined') return
  if (document.querySelector(`style[data-plugin-css="${TAG_ID}"]`) !== null) return
  const tag = document.createElement('style')
  tag.dataset.plugin = 'deepseek-harness-t3-sidebar'
  tag.dataset.pluginCss = TAG_ID
  tag.textContent = CSS
  document.head.appendChild(tag)
}

/** Class-name map for the shell, so components never concatenate strings. */
export const styles = /** @type {const} */ ({
  root: `${P}-root`,
  chrome: `${P}-chrome`,
  chromeRow: `${P}-chromeRow`,
  control: `${P}-control`,
  select: `${P}-select`,
  icon: `${P}-icon`,
  newSession: `${P}-newSession`,
  searchWrap: `${P}-searchWrap`,
  searchIcon: `${P}-searchIcon`,
  search: `${P}-search`,
  sections: `${P}-sections`,
  section: `${P}-section`,
  sectionHeader: `${P}-sectionHeader`,
  sectionCount: `${P}-sectionCount`,
  list: `${P}-list`,
  row: `${P}-row`,
  rowTitle: `${P}-rowTitle`,
  rowMeta: `${P}-rowMeta`,
  rowSubagent: `${P}-rowSubagent`,
  dot: `${P}-dot`,
  empty: `${P}-empty`,
  rail: `${P}-rail`,
  glyph: `${P}-glyph`,
  glyphNew: `${P}-glyphNew`,
  visuallyHidden: `${P}-visuallyHidden`,
})
