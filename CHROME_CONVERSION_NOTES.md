# Firefox to Chrome Extension Conversion - Zen Internet

This document outlines the changes made to convert the Zen Internet Firefox extension to work with Chrome/Chromium-based browsers.

## Summary of Changes

### 1. Manifest File (`manifest.json`)

- **Version**: Updated from Manifest V2 to Manifest V3
- **manifest_version**: Changed from `2` to `3`
- **permissions**: Updated to Chrome's permission model
  - Added `scripting` permission (required for Manifest V3)
  - Moved host permissions to `host_permissions` field
- **browser_action**: Renamed to `action` (Manifest V3 requirement)
- **background**: Changed from `scripts` array to `service_worker` (single file)
- **web_accessible_resources**: Updated to V3 format with `resources` and `matches` objects

### 2. Background Script (`background.js`)

- **API Namespace**: All `browser.*` calls replaced with `chrome.*`
- **Service Worker**: Converted to work as a service worker (no persistent background page)
- **Tab API Changes**:
  - Removed `browser.tabs.insertCSS()` and `browser.tabs.removeCSS()` (deprecated in MV3)
  - CSS injection now handled by content scripts
- **Icon API**: Changed from `browser.browserAction.setIcon()` to `chrome.action.setIcon()`
- **Storage API**: All `browser.storage` calls updated to `chrome.storage`
- **Runtime Messaging**: Updated to use `chrome.runtime.sendMessage()`

### 3. Content Script (`content-script.js`)

- **API Namespace**: Changed `browser.*` to `chrome.*`
- **Error Handling**: Added `.catch()` handlers for Chrome compatibility

### 4. Popup Scripts (`popup/popup.js`)

- **API Namespace**: All `browser.*` APIs replaced with `chrome.*`
- **Storage**: Updated to `chrome.storage.local`
- **Tabs**: Updated to `chrome.tabs`
- **Runtime**: Updated to `chrome.runtime`

### 5. Welcome Screen (`popup/welcome.js`)

- **API Namespace**: All `browser.*` APIs replaced with `chrome.*`
- **Storage**: Updated all storage operations to use `chrome.storage.local`
- **Runtime Messaging**: Updated to `chrome.runtime.sendMessage()`

### 6. Data Viewer (`data-viewer/data-viewer.js`)

- **API Namespace**: All `browser.*` APIs replaced with `chrome.*`
- **Storage**: Updated all storage operations
- **Manifest**: Updated `chrome.runtime.getManifest()` calls

## Key Differences Between Firefox and Chrome

### API Compatibility

- **Firefox**: Uses `browser.*` API (Promise-based)
- **Chrome**: Uses `chrome.*` API (traditionally callback-based, but now supports Promises)

### Manifest V3 Requirements (Chrome)

1. Background scripts must be service workers (no persistent pages)
2. `insertCSS` and `removeCSS` are deprecated - use content scripts
3. Host permissions separated from regular permissions
4. Web accessible resources require explicit matching patterns

### CSS Injection

- **Firefox (MV2)**: Can inject CSS directly from background scripts
- **Chrome (MV3)**: CSS must be injected via content scripts or registered in manifest

## Testing Checklist

- [ ] Extension loads without errors
- [ ] Icon displays correctly in toolbar
- [ ] Popup opens and displays settings
- [ ] Styles are fetched and stored
- [ ] Styles are applied to websites correctly
- [ ] Settings persist across browser sessions
- [ ] Auto-update functionality works
- [ ] Data viewer page works
- [ ] Import/Export settings work
- [ ] Welcome screen displays for new users

## Installation Instructions

### For Chrome/Chromium Browsers

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right corner)
3. Click "Load unpacked"
4. Select the extension directory (`zen-internet` folder)
5. The extension should now appear in your extensions list

### For Edge

1. Open Edge and navigate to `edge://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the extension directory

### For Brave

1. Open Brave and navigate to `brave://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the extension directory

## Known Limitations

1. **Firefox-specific file**: `background-firefox.js` is kept for reference but not used in Chrome version
2. **Permissions**: Some permissions may need adjustment based on testing
3. **CSS Timing**: Content script injection timing may differ slightly from Firefox

## File Structure

```
zen-internet/
├── manifest.json (Manifest V3 - Chrome compatible)
├── background.js (Service worker for Chrome)
├── background-firefox.js (Original Firefox version - not used)
├── content-script.js (Updated for Chrome)
├── popup/
│   ├── popup.js (Updated for Chrome)
│   ├── welcome.js (Updated for Chrome)
│   └── ...
├── data-viewer/
│   ├── data-viewer.js (Updated for Chrome)
│   └── ...
└── ...
```

## Support

For issues specific to the Chrome version, please report them separately from Firefox issues.

## License

Same as original Zen Internet extension.
