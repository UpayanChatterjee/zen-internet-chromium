(function () {
  const stylesheetId = "zeninternet-custom-styles";

  // Create or get our stylesheet element
  function getStylesheet() {
    let stylesheet = document.getElementById(stylesheetId);
    if (!stylesheet) {
      stylesheet = document.createElement("style");
      stylesheet.id = stylesheetId;
      stylesheet.type = "text/css";
      document.head.appendChild(stylesheet);
    }
    return stylesheet;
  }

  // Update our stylesheet content
  function updateStyles(css) {
    const stylesheet = getStylesheet();
    stylesheet.textContent = css || "";
    console.log("ZenInternet: Styles were " + (css ? "updated" : "removed"));
  }

  // Announce content script is ready and provide current hostname
  function announceReady() {
    try {
      chrome.runtime
        .sendMessage({
          action: "contentScriptReady",
          hostname: window.location.hostname,
        })
        .catch((err) => {
          // Silent fail - background might not be ready yet
          console.log("ZenInternet: Could not announce ready state");
        });
    } catch (e) {
      // Fail silently
    }
  }

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "applyStyles") {
      updateStyles(message.css);
      sendResponse({ success: true });
      return true;
    }
    return false;
  });

  // Announce content script is ready on load
  announceReady();
})();
