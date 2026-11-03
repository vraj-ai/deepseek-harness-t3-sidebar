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

/* One 32 px header row, as T3's SidebarThreadHeader: search owns the width,
   the two actions stay 28 px squares. */
.${P}-chrome {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: none;
  padding: 0 2px 8px;
}

.${P}-searchWrap {
  box-sizing: border-box;
  display: flex;
  flex: 1;
  align-items: center;
  gap: 6px;
  min-width: 0;
  height: 32px;
  padding: 0 7px;
  border-radius: var(--dsw-radius-md);
  color: var(--dsw-alias-label-tertiary);
  transition: background-color 120ms ease-out, color 120ms ease-out;
}

.${P}-searchWrap:hover,
.${P}-searchWrap:focus-within {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
}

.${P}-searchWrap:focus-within {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -1px;
}

.${P}-searchWrapActive {
  color: var(--dsw-alias-label-secondary);
}

.${P}-searchIcon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  color: inherit;
  pointer-events: none;
}

.${P}-search {
  box-sizing: border-box;
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  outline: none;
}

.${P}-search::-webkit-search-cancel-button {
  appearance: none;
}

.${P}-search::placeholder {
  color: var(--dsw-alias-label-tertiary);
}

.${P}-searchClear {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
  transition: background-color 120ms ease-out, color 120ms ease-out;
}

.${P}-searchClear:hover {
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
}

.${P}-searchClear:focus-visible,
.${P}-iconButton:focus-visible,
.${P}-glyph:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -2px;
}

.${P}-icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
}

.${P}-iconButton {
  box-sizing: border-box;
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: var(--dsw-radius-md);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  cursor: pointer;
  transition: background-color 120ms ease-out, color 120ms ease-out;
}

.${P}-iconButton:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}

.${P}-iconButton:disabled {
  color: var(--dsw-alias-label-quaternary);
  cursor: default;
}

.${P}-newSession {
  color: var(--dsw-alias-label-primary);
}

.${P}-scope {
  position: relative;
  flex: none;
}

.${P}-scopeTrigger {
  color: var(--dsw-alias-label-secondary);
}

.${P}-scopeGlyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
}

.${P}-monogram {
  box-sizing: border-box;
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  border: 0.5px solid var(--dsw-alias-border-l1);
  border-radius: 4px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.01em;
}

.${P}-workspaceMenu {
  box-sizing: border-box;
  position: absolute;
  z-index: 40;
  top: calc(100% + 6px);
  right: -32px;
  width: 248px;
  max-width: 248px;
  padding: 6px;
  border: 1px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-specific-menu, var(--dsw-alias-bg-layer-1));
  color: var(--dsw-alias-label-primary);
  box-shadow: var(--dsw-elevation-panel);
  -webkit-backdrop-filter: var(--dsw-menu-backdrop-filter);
  backdrop-filter: var(--dsw-menu-backdrop-filter);
  overscroll-behavior: contain;
}

.${P}-workspaceSearchWrap {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 8px;
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-tertiary);
}

.${P}-workspaceSearchIcon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  color: inherit;
}

.${P}-workspaceSearch {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: var(--dsw-font-xs-13);
  outline: none;
}

.${P}-workspaceSearch::-webkit-search-cancel-button {
  appearance: none;
}

.${P}-workspaceSearch::placeholder {
  color: var(--dsw-alias-label-tertiary);
}

.${P}-workspaceSearchWrap:focus-within {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -1px;
}

.${P}-workspaceList {
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-height: 260px;
  margin-top: 6px;
  overflow: auto;
  overscroll-behavior: contain;
}

.${P}-workspaceOption {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 32px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: var(--dsw-font-xs-13);
  text-align: left;
  cursor: pointer;
  transition: background-color 120ms ease-out, color 120ms ease-out;
}

.${P}-workspaceOption:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}

.${P}-workspaceOption:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -2px;
}

.${P}-workspaceOptionSelected {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-3);
}

.${P}-workspaceOptionGlyph {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  color: var(--dsw-alias-label-tertiary);
}

.${P}-workspaceOptionLabel {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.${P}-workspaceOptionCheck {
  display: inline-flex;
  flex: none;
  color: var(--dsw-alias-state-business-primary);
}

.${P}-workspaceEmpty {
  padding: 8px;
  color: var(--dsw-alias-label-tertiary);
  font: var(--dsw-font-xxxs-11);
}

/* The list: shelves and rows on T3's 1 px grid (Sidebar.tsx:4782, gap-px). */
.${P}-sections {
  display: flex;
  flex-direction: column;
  gap: 1px;
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
  gap: 1px;
}

/* T3 pins the Working shelf to the bottom of the free space; Active rows lead. */
.${P}-section[data-t3-section="working"] {
  margin-top: auto;
}

/* 32 px shelf header: label, hairline, count, chevron
   (ui/collapsible-section-header.tsx:31-46). */
.${P}-sectionHeader {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 32px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--dsw-radius-md);
  background: transparent;
  color: var(--dsw-alias-label-caption);
  font: var(--dsw-font-xxs-strong-12);
  text-align: left;
  cursor: pointer;
  transition: background-color 120ms ease-out, color 120ms ease-out;
}

.${P}-sectionHeader:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
}

.${P}-sectionHeader:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -2px;
}

.${P}-sectionLabel {
  flex: none;
  margin: 0;
  font: inherit;
  color: inherit;
}

.${P}-sectionRule {
  flex: 1;
  min-width: 8px;
  height: 1px;
  background: var(--dsw-alias-separator-primary);
}

.${P}-sectionCount {
  flex: none;
  color: var(--dsw-alias-label-tertiary);
  font: var(--dsw-font-xxxs-11);
  font-variant-numeric: tabular-nums;
}

.${P}-chevronOpen,
.${P}-chevronClosed {
  display: inline-flex;
  flex: none;
  color: var(--dsw-alias-label-quaternary);
}

.${P}-chevronClosed {
  transform: rotate(-90deg);
}

.${P}-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.${P}-rowItem {
  position: relative;
  margin: 0;
  padding: 0;
  list-style: none;
}

.${P}-row {
  box-sizing: border-box;
  display: flex;
  width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  border-radius: var(--dsw-radius-md);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  text-align: left;
  font: inherit;
  cursor: pointer;
  transition: background-color 120ms ease-out;
}

.${P}-row:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.${P}-row:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -2px;
}

/* T3's card: 78 px of content + 4 px vertical padding = 82 px
   (Sidebar.tsx:2254 h-[4.875rem] and line 2278 py-0.5; the citation is
   spelled out because the probe scans the sheet text for colour literals). */
.${P}-rowCard {
  height: 82px;
  align-items: stretch;
}

/* T3's slim row: 36 px (Sidebar.tsx:2110, h-9). */
.${P}-rowSlim {
  height: 36px;
  align-items: center;
}

.${P}-cardInner,
.${P}-slimInner {
  display: flex;
  flex: 1;
  min-width: 0;
  border-radius: inherit;
}

.${P}-cardInner {
  flex-direction: column;
  gap: 4px;
  justify-content: center;
  margin: 2px 0;
  padding: 6px 10px;
}

.${P}-slimInner {
  align-items: center;
  gap: 8px;
  padding: 0 10px;
}

/* Card top line: project name, pin, status slot (Sidebar.tsx:2279-2436). */
.${P}-cardTop {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  height: 20px;
}

.${P}-cardProject {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-tertiary);
  font: var(--dsw-font-xxs-strong-12);
}

.${P}-cardTitle {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  color: var(--dsw-alias-label-primary);
  font: var(--dsw-font-s-strong-14);
}

/* Card meta line: branch/goal/queue on the left, provider stack right
   (Sidebar.tsx:2445-2497). */
.${P}-cardMeta {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--dsw-alias-label-caption);
  font: var(--dsw-font-xxxs-11);
}

.${P}-cardMetaItem {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex: none;
  max-width: 50%;
  min-width: 0;
}

.${P}-cardMetaText {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.${P}-cardMetaRight {
  margin-left: auto;
}

.${P}-stack {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: none;
  max-width: 55%;
  min-width: 0;
  overflow: hidden;
  font: var(--dsw-font-xxxs-11);
  white-space: nowrap;
}

.${P}-stackCurrent {
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--dsw-alias-label-tertiary);
}

.${P}-stackPrevious {
  flex: none;
  color: var(--dsw-alias-label-quaternary);
}

.${P}-rowStatus {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 4px;
  max-width: 60%;
  font: var(--dsw-font-xxxs-strong-11);
  white-space: nowrap;
}

.${P}-rowStatusLabel {
  overflow: hidden;
  text-overflow: ellipsis;
}

.${P}-rowStatusDuration {
  font-variant-numeric: tabular-nums;
  font-weight: 400;
  color: var(--dsw-alias-label-tertiary);
}

.${P}-toneInfo {
  color: var(--dsw-alias-state-business-primary);
}

.${P}-toneMuted {
  color: var(--dsw-alias-label-tertiary);
}

.${P}-toneWarn {
  color: var(--dsw-alias-state-warn-label);
}

.${P}-toneError {
  color: var(--dsw-alias-state-error-primary);
}

.${P}-toneSuccess {
  color: var(--dsw-alias-state-success-primary);
}

.${P}-toneAccent {
  color: var(--dsw-alias-link);
}

/* Slim row: title, pin, then right-aligned time (Sidebar.tsx:2088-2243). */
.${P}-slimTitle {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-secondary);
  font: var(--dsw-font-xxs-12);
}

.${P}-slimProject {
  flex: none;
  max-width: 40%;
}

.${P}-slimTail {
  flex: none;
  color: var(--dsw-alias-label-quaternary);
  font: var(--dsw-font-xxxs-11);
  font-variant-numeric: tabular-nums;
}

.${P}-pin {
  display: inline-flex;
  flex: none;
  color: var(--dsw-alias-label-quaternary);
}

/* Hover card: title, project, path, status, stack (ThreadHoverCard.tsx). */
.${P}-hoverCard {
  position: absolute;
  z-index: 20;
  top: calc(100% - 2px);
  left: 4px;
  display: none;
  flex-direction: column;
  gap: 4px;
  width: max-content;
  max-width: min(320px, 100%);
  padding: 8px 10px;
  border: 1px solid var(--dsw-elevation-stroke-color);
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-tooltip-bg);
  color: var(--dsw-alias-label-primary-foreground);
  box-shadow: var(--dsw-elevation-panel);
  font: var(--dsw-font-xxs-12);
  white-space: normal;
  pointer-events: none;
}

.${P}-rowItem:hover .${P}-hoverCard,
.${P}-row:focus-visible + .${P}-hoverCard {
  display: flex;
}

.${P}-hoverCardTitle {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: var(--dsw-font-xxs-strong-12);
}

.${P}-hoverCardRow {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow-wrap: anywhere;
}

.${P}-hoverCardPath {
  color: var(--dsw-alias-label-primary-dimmed);
  font-family: var(--dsw-font-mono-font-family, ui-monospace, monospace);
  font-size: 11px;
}

.${P}-showMore {
  align-self: flex-start;
  margin: 2px 0 4px 8px;
  padding: 4px 8px;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-button-elevated-fill);
  color: var(--dsw-alias-label-secondary);
  font: var(--dsw-font-xxxs-11);
  cursor: pointer;
}

.${P}-showMore:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.${P}-dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--dsw-alias-label-tertiary);
}

.${P}-empty {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 24px 12px;
  color: var(--dsw-alias-label-tertiary);
  text-align: center;
}

.${P}-emptyGlyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-tertiary);
}

.${P}-emptyTitle {
  color: var(--dsw-alias-label-secondary);
  font: var(--dsw-font-xxs-strong-12);
}

.${P}-emptyHint {
  color: var(--dsw-alias-label-tertiary);
  font: var(--dsw-font-xxxs-11);
}

.${P}-railSection {
  padding: 6px 8px;
  color: var(--dsw-alias-label-tertiary);
  font: var(--dsw-font-xxxs-11);
}

/* The recoverable archive lives at the foot of the column, not in the header. */
.${P}-archiveFooter {
  box-sizing: border-box;
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 34px;
  margin-top: 2px;
  padding: 0 8px;
  border: 0;
  border-top: 1px solid var(--dsw-alias-separator-primary);
  border-radius: 0;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font: var(--dsw-font-xxs-12);
  text-align: left;
  cursor: pointer;
  transition: background-color 120ms ease-out, color 120ms ease-out;
}

.${P}-archiveFooter:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}

.${P}-archiveFooter:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -2px;
}

.${P}-archiveFooterIcon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
}

.${P}-archiveFooterLabel {
  flex: 1;
  min-width: 0;
}

.${P}-archiveFooterCount {
  flex: none;
  min-width: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 16px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.${P}-archiveFooterChevron {
  display: inline-flex;
  flex: none;
  transition: transform 150ms ease-out;
}

.${P}-archiveFooterOpen .${P}-archiveFooterChevron {
  transform: rotate(180deg);
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

.${P}-glyph {
  transition: background-color 120ms ease-out;
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

/* Row actions: hover buttons, the jump badge, inline rename and the drop line. */
.${P}-rowActions {
  position: absolute;
  z-index: 2;
  top: 4px;
  right: 6px;
  display: none;
  gap: 2px;
}

.${P}-rowItem:hover .${P}-rowActions,
.${P}-rowItem:focus-within .${P}-rowActions {
  display: inline-flex;
}

.${P}-rowAction {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary);
  font: var(--dsw-font-xxs-12);
  cursor: pointer;
}

.${P}-rowAction:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.${P}-rowAction:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
}

.${P}-jumpHint {
  position: absolute;
  z-index: 2;
  right: 6px;
  bottom: 4px;
  padding: 0 5px;
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-tooltip-bg);
  color: var(--dsw-alias-label-primary-foreground);
  font: var(--dsw-font-xxxs-11);
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}

.${P}-renameInput {
  box-sizing: border-box;
  width: 100%;
  height: 30px;
  margin: 2px 0;
  padding: 0 8px;
  border: 0.5px solid var(--dsw-alias-state-business-primary);
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
}

.${P}-rowItem[data-t3-editing] .${P}-hoverCard {
  display: none;
}

.${P}-rowItem[data-t3-dragging] {
  opacity: 0.5;
}

.${P}-rowItem[data-t3-drop="before"]::before,
.${P}-rowItem[data-t3-drop="after"]::after {
  content: '';
  position: absolute;
  z-index: 3;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--dsw-alias-state-business-primary);
  pointer-events: none;
}

.${P}-rowItem[data-t3-drop="before"]::before {
  top: -1px;
}

.${P}-rowItem[data-t3-drop="after"]::after {
  bottom: -1px;
}

.${P}-menu {
  position: fixed;
  z-index: 1000;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-width: 200px;
  max-width: 280px;
  padding: 4px;
  border: 1px solid var(--dsw-elevation-stroke-color);
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  box-shadow: var(--dsw-elevation-panel);
  font: var(--dsw-font-xs-13);
}

.${P}-menuItem {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  height: 28px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--dsw-radius-md);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.${P}-menuItem:hover,
.${P}-menuItem:focus-visible {
  background: var(--dsw-alias-interactive-bg-hover);
  outline: none;
}

.${P}-menuItem:disabled {
  color: var(--dsw-alias-label-quaternary);
  cursor: default;
}

.${P}-menuWhen {
  color: var(--dsw-alias-label-tertiary);
  font: var(--dsw-font-xxxs-11);
}

.${P}-menuSeparator {
  height: 1px;
  margin: 4px 0;
  background: var(--dsw-alias-separator-primary);
}

.${P}-menuCustom {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 4px 8px 6px;
}

.${P}-menuCustom input {
  box-sizing: border-box;
  height: 28px;
  padding: 0 6px;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
}

.${P}-toast {
  position: fixed;
  z-index: 1000;
  left: 16px;
  bottom: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: 320px;
  padding: 8px 10px;
  border: 1px solid var(--dsw-elevation-stroke-color);
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-tooltip-bg);
  color: var(--dsw-alias-label-primary-foreground);
  box-shadow: var(--dsw-elevation-panel);
  font: var(--dsw-font-xxs-12);
}

.${P}-toastText {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.${P}-toastAction {
  flex: none;
  padding: 2px 6px;
  border: 0;
  border-radius: var(--dsw-radius-md);
  background: transparent;
  color: var(--dsw-alias-link);
  font: var(--dsw-font-xxs-strong-12);
  cursor: pointer;
}

.${P}-toastAction:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
}

@media (prefers-reduced-motion: reduce) {
  .${P}-searchWrap,
  .${P}-searchClear,
  .${P}-iconButton,
  .${P}-workspaceOption,
  .${P}-sectionHeader,
  .${P}-archiveFooter,
  .${P}-archiveFooterChevron,
  .${P}-row,
  .${P}-glyph,
  .${P}-showMore {
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
  icon: `${P}-icon`,
  newSession: `${P}-newSession`,
  searchWrap: `${P}-searchWrap`,
  searchWrapActive: `${P}-searchWrapActive`,
  searchIcon: `${P}-searchIcon`,
  search: `${P}-search`,
  searchClear: `${P}-searchClear`,
  iconButton: `${P}-iconButton`,
  scope: `${P}-scope`,
  scopeTrigger: `${P}-scopeTrigger`,
  scopeGlyph: `${P}-scopeGlyph`,
  monogram: `${P}-monogram`,
  workspaceMenu: `${P}-workspaceMenu`,
  workspaceSearchWrap: `${P}-workspaceSearchWrap`,
  workspaceSearch: `${P}-workspaceSearch`,
  workspaceSearchIcon: `${P}-workspaceSearchIcon`,
  workspaceList: `${P}-workspaceList`,
  workspaceOption: `${P}-workspaceOption`,
  workspaceOptionSelected: `${P}-workspaceOptionSelected`,
  workspaceOptionGlyph: `${P}-workspaceOptionGlyph`,
  workspaceOptionLabel: `${P}-workspaceOptionLabel`,
  workspaceOptionCheck: `${P}-workspaceOptionCheck`,
  workspaceEmpty: `${P}-workspaceEmpty`,
  sections: `${P}-sections`,
  section: `${P}-section`,
  sectionHeader: `${P}-sectionHeader`,
  sectionLabel: `${P}-sectionLabel`,
  sectionRule: `${P}-sectionRule`,
  sectionCount: `${P}-sectionCount`,
  chevronOpen: `${P}-chevronOpen`,
  chevronClosed: `${P}-chevronClosed`,
  list: `${P}-list`,
  rowItem: `${P}-rowItem`,
  row: `${P}-row`,
  rowCard: `${P}-rowCard`,
  rowSlim: `${P}-rowSlim`,
  cardInner: `${P}-cardInner`,
  cardTop: `${P}-cardTop`,
  cardProject: `${P}-cardProject`,
  cardTitle: `${P}-cardTitle`,
  cardMeta: `${P}-cardMeta`,
  cardMetaItem: `${P}-cardMetaItem`,
  cardMetaText: `${P}-cardMetaText`,
  cardMetaRight: `${P}-cardMetaRight`,
  stack: `${P}-stack`,
  stackCurrent: `${P}-stackCurrent`,
  stackPrevious: `${P}-stackPrevious`,
  rowStatus: `${P}-rowStatus`,
  rowStatusLabel: `${P}-rowStatusLabel`,
  rowStatusDuration: `${P}-rowStatusDuration`,
  toneInfo: `${P}-toneInfo`,
  toneMuted: `${P}-toneMuted`,
  toneWarn: `${P}-toneWarn`,
  toneError: `${P}-toneError`,
  toneSuccess: `${P}-toneSuccess`,
  toneAccent: `${P}-toneAccent`,
  slimInner: `${P}-slimInner`,
  slimTitle: `${P}-slimTitle`,
  slimProject: `${P}-slimProject`,
  slimTail: `${P}-slimTail`,
  pin: `${P}-pin`,
  hoverCard: `${P}-hoverCard`,
  hoverCardTitle: `${P}-hoverCardTitle`,
  hoverCardRow: `${P}-hoverCardRow`,
  hoverCardPath: `${P}-hoverCardPath`,
  showMore: `${P}-showMore`,
  dot: `${P}-dot`,
  empty: `${P}-empty`,
  emptyGlyph: `${P}-emptyGlyph`,
  emptyTitle: `${P}-emptyTitle`,
  emptyHint: `${P}-emptyHint`,
  rail: `${P}-rail`,
  railSection: `${P}-railSection`,
  archiveFooter: `${P}-archiveFooter`,
  archiveFooterOpen: `${P}-archiveFooterOpen`,
  archiveFooterIcon: `${P}-archiveFooterIcon`,
  archiveFooterLabel: `${P}-archiveFooterLabel`,
  archiveFooterCount: `${P}-archiveFooterCount`,
  archiveFooterChevron: `${P}-archiveFooterChevron`,
  glyph: `${P}-glyph`,
  glyphNew: `${P}-glyphNew`,
  visuallyHidden: `${P}-visuallyHidden`,
  rowActions: `${P}-rowActions`,
  rowAction: `${P}-rowAction`,
  jumpHint: `${P}-jumpHint`,
  renameInput: `${P}-renameInput`,
  menu: `${P}-menu`,
  menuItem: `${P}-menuItem`,
  menuWhen: `${P}-menuWhen`,
  menuSeparator: `${P}-menuSeparator`,
  menuCustom: `${P}-menuCustom`,
  toast: `${P}-toast`,
  toastText: `${P}-toastText`,
  toastAction: `${P}-toastAction`,
})
