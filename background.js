let SKIP_FORCE_THEMING_KEY = "skipForceThemingList";
let SKIP_THEMING_KEY = "skipThemingList";
let FALLBACK_BACKGROUND_KEY = "fallbackBackgroundList";
let BROWSER_STORAGE_KEY = "transparentZenSettings";
let STYLES_MAPPING_KEY = "stylesMapping";
let logging = true; // Enable logging for debugging

// Create a cache for pre-processed CSS to speed up repeated visits
const cssCache = new Map();
const activeTabs = new Map();
// Cache for styling state to avoid repeated storage lookups
const stylingStateCache = new Map();

// Icon states for the browser action
const ICON_ON = {
  48: "assets/images/logo_48.png",
  96: "assets/images/logo_96.png",
};
const ICON_OFF = {
  48: "assets/images/logo-off_48.png",
  96: "assets/images/logo-off_96.png",
};

// Default settings to use when values are missing
const DEFAULT_SETTINGS = {
  enableStyling: true, // Enable styling globally
  autoUpdate: true, // Auto-update styles
  forceStyling: false, // Force styling on sites without themes
  whitelistMode: false, // Use blacklist mode by default for force styling
  whitelistStyleMode: false, // Use blacklist mode by default for regular styling
  disableTransparency: false, // Don't disable transparency by default
  disableHover: false, // Don't disable hover effects by default
  disableFooter: false, // Don't disable footers by default
  fallbackBackgroundList: [], // Empty array for fallback background sites
};

// Helper function to normalize hostnames by removing www. prefix
function normalizeHostname(hostname) {
  return hostname.startsWith("www.") ? hostname.substring(4) : hostname;
}

// Ensure all required settings exist
function ensureDefaultSettings(settings = {}) {
  const result = { ...settings };

  // Apply default values for any missing settings
  for (const [key, defaultValue] of Object.entries(DEFAULT_SETTINGS)) {
    if (result[key] === undefined) {
      result[key] = defaultValue;
    }
  }

  return result;
}

// Enhanced function to determine styling state with more detailed information
async function shouldApplyStyling(hostname) {
  try {
    // Ensure the CSS cache is populated if empty
    if (cssCache.size === 0) {
      if (logging) console.log("cssCache is empty, preloading styles...");
      await preloadStyles();
    }
    // Check if we already have the answer cached
    const cacheKey = `styling:${hostname}`;
    if (stylingStateCache.has(cacheKey)) {
      return stylingStateCache.get(cacheKey);
    }

    const normalizedHostname = normalizeHostname(hostname);

    // Get global settings - this is an unavoidable storage lookup
    const settingsData = await chrome.storage.local.get(BROWSER_STORAGE_KEY);
    const settings = ensureDefaultSettings(
      settingsData[BROWSER_STORAGE_KEY] || {}
    );

    // If styling is globally disabled, return no styling at all
    if (!settings.enableStyling) {
      const result = {
        shouldApply: false,
        reason: "globally_disabled",
      };
      stylingStateCache.set(cacheKey, result);
      return result;
    }

    // Check if we have a specific style for this site
    let hasSpecificStyle = false;

    // Check for exact match first
    if (
      cssCache.has(normalizedHostname) ||
      cssCache.has(`www.${normalizedHostname}`)
    ) {
      hasSpecificStyle = true;
    } else {
      // Check for wildcard and TLD matches
      for (const cachedSite of cssCache.keys()) {
        // Wildcard match
        if (cachedSite.startsWith("+")) {
          const baseSite = cachedSite.slice(1);
          if (
            normalizedHostname === baseSite ||
            normalizedHostname.endsWith(`.${baseSite}`)
          ) {
            hasSpecificStyle = true;
            break;
          }
        }
        // TLD suffix match
        else if (cachedSite.startsWith("-")) {
          const baseSite = cachedSite.slice(1);
          const cachedDomain = baseSite.split(".").slice(0, -1).join(".");
          const hostParts = normalizedHostname.split(".");
          const hostDomain =
            hostParts.length > 1
              ? hostParts.slice(0, -1).join(".")
              : normalizedHostname;

          if (cachedDomain && hostDomain && hostDomain === cachedDomain) {
            hasSpecificStyle = true;
            break;
          }
        }
        // Subdomain match
        else if (
          normalizedHostname !== cachedSite &&
          normalizedHostname.endsWith(`.${cachedSite}`) &&
          !cachedSite.startsWith("-")
        ) {
          hasSpecificStyle = true;
          break;
        }
      }
    }

    // Check for mapped styles if no direct style found
    if (!hasSpecificStyle) {
      const mappingData = await chrome.storage.local.get(STYLES_MAPPING_KEY);
      if (mappingData[STYLES_MAPPING_KEY]?.mapping) {
        for (const [sourceStyle, targetSites] of Object.entries(mappingData[STYLES_MAPPING_KEY].mapping)) {
          if (targetSites.includes(normalizedHostname)) {
            hasSpecificStyle = true;
            break;
          }
        }
      }
    }

    // If we have a specific style (including mapped styles), check blacklist/whitelist for regular styling
    if (hasSpecificStyle) {
      // Get skip styling list - only do this lookup if we have a specific style
      const skipStyleListData = await chrome.storage.local.get(
        SKIP_THEMING_KEY
      );
      const skipStyleList = skipStyleListData[SKIP_THEMING_KEY] || [];

      // In whitelist mode: only apply if site is in the list
      // In blacklist mode: apply unless site is in the list
      const styleMode = settings.whitelistStyleMode || false;

      if (styleMode) {
        // Whitelist mode
        const shouldApply = skipStyleList.includes(normalizedHostname);
        const result = {
          shouldApply,
          reason: shouldApply ? "whitelisted" : "not_whitelisted",
        };
        stylingStateCache.set(cacheKey, result);
        return result;
      } else {
        // Blacklist mode
        const shouldApply = !skipStyleList.includes(normalizedHostname);
        const result = {
          shouldApply,
          reason: shouldApply ? "not_blacklisted" : "blacklisted",
        };
        stylingStateCache.set(cacheKey, result);
        return result;
      }
    }

    // If no specific style, check if we should apply forced styling
    if (settings.forceStyling) {
      // Get skip force list - only do this lookup if force styling is enabled
      const skipForceListData = await chrome.storage.local.get(
        SKIP_FORCE_THEMING_KEY
      );
      const skipForceList = skipForceListData[SKIP_FORCE_THEMING_KEY] || [];
      const isWhitelistMode = settings.whitelistMode || false;

      // In whitelist mode: only apply if site is in the list
      // In blacklist mode: apply unless site is in the list
      if (isWhitelistMode) {
        const shouldApply = skipForceList.includes(normalizedHostname);
        const result = {
          shouldApply,
          reason: shouldApply ? "force_whitelisted" : "force_not_whitelisted",
        };
        stylingStateCache.set(cacheKey, result);
        return result;
      } else {
        const shouldApply = !skipForceList.includes(normalizedHostname);
        const result = {
          shouldApply,
          reason: shouldApply ? "force_not_blacklisted" : "force_blacklisted",
        };
        stylingStateCache.set(cacheKey, result);
        return result;
      }
    }

    // No styling applies
    const result = {
      shouldApply: false,
      reason: "no_styling_rules",
    };
    stylingStateCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.error("Error determining styling state:", error);
    return { shouldApply: false, reason: "error" };
  }
}

// Update the icon based on whether styling is active for the current tab
async function updateIconForTab(tabId, url) {
  try {
    if (!url) {
      const tab = await chrome.tabs.get(tabId);
      url = tab.url;
    }

    // Non-HTTP URLs don't get styling
    if (!url || !url.startsWith("http")) {
      setIcon(tabId, false);
      return;
    }

    const urlObj = new URL(url);
    const hostname = urlObj.hostname;

    // Determine styling state using the enhanced function
    const stylingState = await shouldApplyStyling(hostname);

    // Update the icon based on whether full styling is enabled for this site
    setIcon(tabId, stylingState.shouldApply);

    if (logging)
      console.log(
        `Icon updated for ${hostname}: styling ${
          stylingState.shouldApply ? "ON" : "OFF"
        } (${stylingState.reason})`
      );
  } catch (error) {
    console.error("Error updating icon:", error);
    setIcon(tabId, false);
  }
}

// Set the icon to either on or off state
function setIcon(tabId, isEnabled) {
  const iconSet = isEnabled ? ICON_ON : ICON_OFF;
  chrome.action.setIcon({
    path: iconSet,
    tabId: tabId,
  });
}

// Preload styles for faster injection
async function preloadStyles() {
  try {
    const data = await chrome.storage.local.get([
      "styles",
      BROWSER_STORAGE_KEY,
      STYLES_MAPPING_KEY,
    ]);

    // Ensure we have all required settings with defaults
    const settings = ensureDefaultSettings(data[BROWSER_STORAGE_KEY] || {});

    // Save the validated settings back to storage if any defaults were applied
    if (
      JSON.stringify(settings) !== JSON.stringify(data[BROWSER_STORAGE_KEY])
    ) {
      if (logging)
        console.log("Missing settings detected, applying defaults:", settings);
      await chrome.storage.local.set({ [BROWSER_STORAGE_KEY]: settings });
    }

    // No point in preloading if styling is disabled
    if (settings.enableStyling === false) return;

    // Clear the cache when reloaded to ensure fresh styles
    cssCache.clear();

    if (data.styles?.website) {
      // Create a reverse mapping lookup for quick access
      const reverseMapping = {};
      if (data[STYLES_MAPPING_KEY]?.mapping) {
        for (const [sourceStyle, targetSites] of Object.entries(data[STYLES_MAPPING_KEY].mapping)) {
          for (const targetSite of targetSites) {
            reverseMapping[targetSite] = sourceStyle;
          }
        }
      }

      for (const [website, features] of Object.entries(data.styles.website)) {
        // Process and store default CSS for each website (with all features enabled)
        let combinedCSS = "";
        for (const [feature, css] of Object.entries(features)) {
          combinedCSS += css + "\n";
        }

        const websiteKey = website.replace(".css", "");
        cssCache.set(websiteKey, combinedCSS);

        // Handle mappings - apply this style to mapped sites
        if (data[STYLES_MAPPING_KEY]?.mapping && data[STYLES_MAPPING_KEY].mapping[website]) {
          const mappedSites = data[STYLES_MAPPING_KEY].mapping[website];
          for (const mappedSite of mappedSites) {
            const normalizedMappedSite = normalizeHostname(mappedSite);
            cssCache.set(normalizedMappedSite, combinedCSS);
            if (logging) console.log(`Mapped ${website} styles to ${normalizedMappedSite}`);
          }
        }
      }
      if (logging) console.log("Styles preloaded for faster injection");
    }
  } catch (error) {
    console.error("Error preloading styles:", error);
  }
}

// Handle web requests - allow injecting CSS before any content is loaded
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId === 0) {
    // Only for main frame
    // Track active navigations
    activeTabs.set(details.tabId, details.url);

    // Pre-fetch any styling needed for this URL
    const url = new URL(details.url);
    const normalizedHostname = normalizeHostname(url.hostname);
    prepareStylesForUrl(normalizedHostname, details.tabId);

    // Update icon for this tab
    updateIconForTab(details.tabId, details.url);
  }
});

// Listen for content scripts announcing they're ready
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "contentScriptReady" && message.hostname) {
    (async () => {
      try {
        // Look for cached styles for this hostname or its domain match
        const normalizedHostname = normalizeHostname(message.hostname);

        // Get settings to check if styling is enabled
        const settingsData = await chrome.storage.local.get(BROWSER_STORAGE_KEY);
        const settings = ensureDefaultSettings(
          settingsData[BROWSER_STORAGE_KEY] || {}
        );

        if (settings.enableStyling === false) {
          sendResponse({});
          return;
        }

        const css = await getStylesForHostname(normalizedHostname, settings);

        // If we found matching CSS, send it immediately to the content script
        if (css && sender.tab) {
          chrome.tabs
            .sendMessage(sender.tab.id, {
              action: "applyStyles",
              css: css,
            })
            .catch((err) => {
              if (logging) console.log("Failed to send immediate CSS:", err);
            });
        }
        sendResponse({});
      } catch (error) {
        console.error("Error handling content script ready message:", error);
        sendResponse({});
      }
    })();
    return true; // Keep the message channel open for async response
  } else if (message.action === "enableAutoUpdate") {
    startAutoUpdate();
    sendResponse({});
    return false;
  } else if (message.action === "disableAutoUpdate") {
    stopAutoUpdate();
    sendResponse({});
    return false;
  }

  // Update the icon when the content script reports ready
  if (message.action === "contentScriptReady" && sender.tab) {
    updateIconForTab(sender.tab.id, sender.tab.url);
  }

  return false;
});

// Get appropriate styles for a hostname based on all rules
async function getStylesForHostname(hostname, settings) {
  // Ensure all required settings have defaults before proceeding
  settings = ensureDefaultSettings(settings);

  console.log("DEBUG: Finding styles for hostname:", hostname);

  // Check for exact matches first (highest priority)
  if (cssCache.has(hostname)) {
    console.log("DEBUG: Found exact hostname match in cache");
    return cssCache.get(hostname);
  } else if (cssCache.has(`www.${hostname}`)) {
    console.log("DEBUG: Found www prefix match in cache");
    return cssCache.get(`www.${hostname}`);
  } else {
    // Check for wildcard matches (+domain.com) and suffix matches (-domain.com)
    for (const [cachedSite, cachedCSS] of cssCache.entries()) {
      // Handle wildcard domain prefix matches (+example.com)
      if (cachedSite.startsWith("+")) {
        const baseSite = cachedSite.slice(1);
        // Ensure we're matching with proper domain boundary (dot or exact match)
        if (hostname === baseSite || hostname.endsWith(`.${baseSite}`)) {
          console.log(
            `DEBUG: Found wildcard match: ${cachedSite} for ${hostname}`
          );
          return cachedCSS;
        }
      }
      // Handle TLD suffix matches (-domain.com)
      else if (cachedSite.startsWith("-")) {
        const baseSite = cachedSite.slice(1);

        // Extract domain name without the TLD
        const cachedDomain = baseSite.split(".").slice(0, -1).join(".");
        const hostParts = hostname.split(".");
        const hostDomain =
          hostParts.length > 1 ? hostParts.slice(0, -1).join(".") : hostname;

        console.log(
          `DEBUG: Comparing domains - cached: ${cachedDomain}, host: ${hostDomain}`
        );

        if (cachedDomain && hostDomain && hostDomain === cachedDomain) {
          console.log(
            `DEBUG: Found TLD suffix match: ${cachedSite} for ${hostname}`
          );
          return cachedCSS;
        }
      }
      // Regular subdomain handling (exact match already checked above)
      else if (
        cachedSite !== hostname &&
        cachedSite !== `www.${hostname}` &&
        hostname.endsWith(`.${cachedSite}`) &&
        !cachedSite.startsWith("-")
      ) {
        // Only match subdomains, not partial domain names
        console.log(
          `DEBUG: Found subdomain match: ${cachedSite} for ${hostname}`
        );
        return cachedCSS;
      }
    }

    // Check for mapped styles if no direct match found
    const mappingData = await chrome.storage.local.get(STYLES_MAPPING_KEY);
    if (mappingData[STYLES_MAPPING_KEY]?.mapping) {
      for (const [sourceStyle, targetSites] of Object.entries(mappingData[STYLES_MAPPING_KEY].mapping)) {
        if (targetSites.includes(hostname)) {
          console.log(`DEBUG: Found mapped style: ${sourceStyle} for ${hostname}`);
          // Get the CSS for the source style
          const sourceStyleKey = sourceStyle.replace(".css", "");
          if (cssCache.has(sourceStyleKey)) {
            console.log(`DEBUG: Returning mapped CSS from ${sourceStyleKey}`);
            return cssCache.get(sourceStyleKey);
          } else {
            console.log(`DEBUG: Source style ${sourceStyleKey} not found in cache`);
          }
        }
      }
    }

    // Check for forced styles
    if (settings.forceStyling) {
      const skipListData = await chrome.storage.local.get(
        SKIP_FORCE_THEMING_KEY
      );
      const siteList = skipListData[SKIP_FORCE_THEMING_KEY] || [];
      const isWhitelistMode = settings.whitelistMode || false;
      const siteInList = siteList.includes(hostname);

      // In whitelist mode: apply only if site is in the list
      // In blacklist mode: apply only if site is NOT in the list
      if (
        (isWhitelistMode && siteInList) ||
        (!isWhitelistMode && !siteInList)
      ) {
        if (cssCache.has("example.com")) {
          return cssCache.get("example.com");
        } else {
          return "/* Default fallback CSS */";
        }
      }
    }
  }

  return null;
}

// Prepare styles for a URL that's about to load
async function prepareStylesForUrl(hostname, tabId) {
  try {
    const settingsData = await chrome.storage.local.get(BROWSER_STORAGE_KEY);

    // Ensure all required settings have defaults
    const settings = ensureDefaultSettings(
      settingsData[BROWSER_STORAGE_KEY] || {}
    );

    if (settings.enableStyling === false) return;

    const css = await getStylesForHostname(hostname, settings);

    if (css && tabId) {
      // Store the CSS to be ready as soon as the content script connects
      activeTabs.set(tabId, {
        hostname: hostname,
        css: css,
      });
    }
  } catch (error) {
    console.error("Error preparing styles for URL:", error);
  }
}

// Also update icons when tabs are updated
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    updateIconForTab(tabId, tab.url);
  }
});

// Update the icon when a tab becomes active
chrome.tabs.onActivated.addListener((activeInfo) => {
  updateIconForTab(activeInfo.tabId);
});

// Clear cache on settings changes
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local") {
    if (
      changes[BROWSER_STORAGE_KEY] ||
      changes[SKIP_THEMING_KEY] ||
      changes[SKIP_FORCE_THEMING_KEY] ||
      changes[STYLES_MAPPING_KEY]
    ) {
      // Clear the styling state cache when relevant settings change
      stylingStateCache.clear();

      if (logging)
        console.log("Cleared styling state cache due to settings change");
    }
  }
});

let autoUpdateInterval;

function startAutoUpdate() {
  if (logging) console.log("startAutoUpdate called");
  if (autoUpdateInterval) clearInterval(autoUpdateInterval);
  autoUpdateInterval = setInterval(refetchCSS, 2 * 60 * 60 * 1000);
}

function stopAutoUpdate() {
  if (logging) console.log("stopAutoUpdate called");
  if (autoUpdateInterval) clearInterval(autoUpdateInterval);
}

async function refetchCSS() {
  if (logging) console.log("refetchCSS called");
  try {
    // Get the repository URL from storage or use the default one
    const DEFAULT_REPOSITORY_URL =
      "https://sameerasw.github.io/my-internet/styles.json";
    const repoUrlData = await chrome.storage.local.get("stylesRepositoryUrl");
    const repositoryUrl =
      repoUrlData.stylesRepositoryUrl || DEFAULT_REPOSITORY_URL;

    console.log("Background: Fetching styles from:", repositoryUrl);

    const response = await fetch(repositoryUrl, {
      headers: { "Cache-Control": "no-cache" },
    });
    if (!response.ok)
      throw new Error(`Failed to fetch styles (Status: ${response.status})`);
    const styles = await response.json();

    // Check if the fetched data includes mappings
    const hasNewMappings = styles.mapping && Object.keys(styles.mapping).length > 0;

    // If new mappings are found, use them; otherwise preserve existing mappings
    let mappingData;
    if (hasNewMappings) {
      mappingData = { mapping: styles.mapping };
      console.log("Background: Using new mappings from repository:", styles.mapping);
    } else {
      const existingData = await chrome.storage.local.get(STYLES_MAPPING_KEY);
      mappingData = existingData[STYLES_MAPPING_KEY] || { mapping: {} };
      console.log("Background: Preserving existing mappings:", mappingData);
    }

    // Save styles and mappings
    await chrome.storage.local.set({
      styles,
      [STYLES_MAPPING_KEY]: mappingData
    });

    // Check if we need to initialize default settings
    const settingsData = await chrome.storage.local.get(BROWSER_STORAGE_KEY);
    if (!settingsData[BROWSER_STORAGE_KEY]) {
      // Initialize default settings if none exist
      const defaultSettings = {
        enableStyling: true,
        autoUpdate: true,
        forceStyling: false,
        whitelistMode: false,
        whitelistStyleMode: false,
        lastFetchedTime: Date.now(),
      };

      // Save default settings
      await chrome.storage.local.set({
        [BROWSER_STORAGE_KEY]: defaultSettings,
      });
      console.info("Initialized default settings during first fetch");
    } else {
      // Update the lastFetchedTime in existing settings
      const currentSettings = settingsData[BROWSER_STORAGE_KEY];
      currentSettings.lastFetchedTime = Date.now();
      await chrome.storage.local.set({
        [BROWSER_STORAGE_KEY]: currentSettings,
      });
    }

    console.info(`All styles refetched and updated from ${repositoryUrl}`);

    // Preload the new styles
    preloadStyles();
  } catch (error) {
    console.error("Error refetching styles:", error);
  }
}

// Create a directory to store CSS files
async function initializeExtension() {
  // Check and initialize default settings
  const data = await chrome.storage.local.get(BROWSER_STORAGE_KEY);
  const currentSettings = data[BROWSER_STORAGE_KEY] || {};
  const validatedSettings = ensureDefaultSettings(currentSettings);

  // If we had to apply any defaults, save them
  if (JSON.stringify(validatedSettings) !== JSON.stringify(currentSettings)) {
    console.info(
      "Initializing missing settings with defaults:",
      validatedSettings
    );
    await chrome.storage.local.set({
      [BROWSER_STORAGE_KEY]: validatedSettings,
    });
  }

  // Ensure empty lists exist
  const skipForceData = await chrome.storage.local.get(SKIP_FORCE_THEMING_KEY);
  if (!skipForceData[SKIP_FORCE_THEMING_KEY]) {
    await chrome.storage.local.set({ [SKIP_FORCE_THEMING_KEY]: [] });
  }

  const skipThemingData = await chrome.storage.local.get(SKIP_THEMING_KEY);
  if (!skipThemingData[SKIP_THEMING_KEY]) {
    await chrome.storage.local.set({ [SKIP_THEMING_KEY]: [] });
  }

  const fallbackBackgroundData = await chrome.storage.local.get(
    FALLBACK_BACKGROUND_KEY
  );
  if (!fallbackBackgroundData[FALLBACK_BACKGROUND_KEY]) {
    await chrome.storage.local.set({ [FALLBACK_BACKGROUND_KEY]: [] });
  }

  // Initialize mapping storage if it doesn't exist
  const mappingData = await chrome.storage.local.get(STYLES_MAPPING_KEY);
  if (!mappingData[STYLES_MAPPING_KEY]) {
    await chrome.storage.local.set({ [STYLES_MAPPING_KEY]: { mapping: {} } });
  }

  // Preload styles immediately
  await preloadStyles();

  // Initialize auto-update based on stored settings
  if (validatedSettings.autoUpdate) {
    startAutoUpdate();
  }

  // Update icons for all tabs on extension startup
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id) {
      updateIconForTab(tab.id, tab.url);
    }
  }
}

// Listen for specific navigation events to apply CSS as early as possible
chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId === 0) {
    chrome.tabs
      .get(details.tabId)
      .then((tab) => {
        // Note: In Manifest V3, we rely on content scripts to apply CSS
        // The applyCSSToTab function from Firefox version isn't needed here
        // as content scripts handle the CSS injection
      })
      .catch((err) => {
        console.error("Error getting tab info:", err);
      });
  }
});

// Application start
initializeExtension();
