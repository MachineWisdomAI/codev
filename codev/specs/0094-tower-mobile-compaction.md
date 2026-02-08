# Spec 0094: Tower Mobile Compaction

## Problem

The Tower overview page (`templates/tower.html`) wastes too much vertical space on mobile. Each project card takes up nearly a full screen, requiring excessive scrolling to see multiple projects or reach the "Launch" section. Specific issues from real-device testing (Android phone, 600px-wide viewport):

1. **Share button** is visible on mobile but makes no sense (you're already on the phone)
2. **Restart/Stop buttons** are on their own line below the project name, wasting a full row
3. **Full project path** is shown (e.g., `/Users/mwk/Library/CloudStorage/GoogleDrive...`) — useless on mobile
4. **Overview/Open** and **Architect/Open** each take a full row with large padding
5. **New Shell / + Create** takes a full row
6. **Recent Projects** section shows full paths unnecessarily

## Target File

`packages/codev/templates/tower.html` (single file, inline CSS + JS)

## Changes

### 1. Hide Share button on mobile

The Share button starts a cloudflare tunnel so you can access from your phone — if you're already on your phone, it's pointless.

```css
@media (max-width: 600px) {
  #share-btn { display: none !important; }
}
```

### 2. Keep project name + status badge + Restart/Stop on one line

Currently `.instance-header` sets `flex-direction: column` on mobile (line 693). Change to keep it as a row with wrapping, so the name+badge and action buttons share the same line when there's room.

```css
/* Remove the column direction override */
.instance-header {
  flex-wrap: wrap;
  /* Keep flex-direction: row (default) */
  gap: 8px;
  padding: 12px 16px;
}

.instance-actions {
  /* Remove width: 100% on mobile */
  margin-left: auto;
}
```

### 3. Hide project path row on mobile

The full filesystem path is not useful on a phone. Hide the entire `.instance-path-row`.

```css
@media (max-width: 600px) {
  .instance-path-row { display: none; }
}
```

### 4. Compact terminal list (Overview, Architect, shells)

Each `.port-item` currently stacks vertically on mobile (line 704-708). Instead, keep them as horizontal rows with smaller padding:

```css
@media (max-width: 600px) {
  .port-item {
    flex-direction: row;  /* Override the column direction */
    align-items: center;
    padding: 8px 12px;
    gap: 8px;
  }

  .port-actions {
    width: auto;  /* Override width: 100% */
  }

  .port-actions a {
    min-height: 36px;  /* Slightly smaller than 44px but still tappable */
    padding: 6px 12px;
    flex: 0;  /* Don't stretch */
  }

  .instance-body {
    padding: 12px;
  }
}
```

### 5. Compact New Shell row

The "New Shell / + Create" port-item should be inline too (handled by #4 above). Remove the extra top margin/padding on the dashed separator:

```css
@media (max-width: 600px) {
  .port-item[style*="border-top: 1px dashed"] {
    margin-top: 4px;
    padding-top: 4px;
  }
}
```

Note: Targeting inline styles via CSS attribute selectors is fragile. Better approach: add a `.new-shell-row` class to the New Shell port-item in the `renderInstance()` JS function, then style that class.

### 6. Compact Recent Projects — hide path, keep name + time + Start inline

```css
@media (max-width: 600px) {
  .recent-item {
    flex-direction: row;  /* Override column */
    align-items: center;
    padding: 12px 16px;
    gap: 8px;
  }

  .recent-path { display: none; }

  .recent-time { font-size: 12px; }
}
```

### 7. Reduce section spacing

```css
@media (max-width: 600px) {
  .main { padding: 12px; }
  .section-header { margin-bottom: 8px; }
  .instances { gap: 10px; }
  .recents-section { margin-top: 16px; padding-top: 16px; }
  .instance-meta { margin-top: 8px; padding-top: 8px; }
}
```

## Acceptance Criteria

1. On a 600px-wide viewport (or real Android phone):
   - Each project card is visually compact (~40-50% of current height)
   - Project name, status, and Restart/Stop are on one line
   - No project path visible
   - Overview/Open, Architect/Open are compact single-line rows
   - Recent projects show name + time + Start button, no path
   - Share button is hidden
2. On desktop (>800px), no visual changes
3. All buttons remain tappable (min 36px touch targets)

## Verification

1. Open `tower.html` in Chrome DevTools mobile emulator (Pixel 7, 412px wide)
2. Check that each project card is compact
3. Verify all buttons (Restart, Stop, Open, + Create, Start) still work
4. Check desktop view is unchanged
5. Test on actual Android phone via tunnel if available
