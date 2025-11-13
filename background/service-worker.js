// Background service worker for Gaze extension
// Manages per-tab state and toolbar interactions

// Tab states: inactive, calibrating, active, paused
const tabStates = new Map();

// Default settings
const DEFAULT_SETTINGS = {
  maxScrollSpeed: 800, // px/s
  maxUpwardSpeed: 400, // px/s
  sensitivity: 50, // 0-100
  showGazeDot: false,
  upperZoneThreshold: 0.30,
  lowerZoneThreshold: 0.70,
  fixationWindow: 250, // ms
  confidenceThreshold: 0.6,
  hasCalibration: false
};

// Initialize settings
chrome.runtime.onInstalled.addListener(async () => {
  const settings = await chrome.storage.local.get('settings');
  if (!settings.settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  }
});

// Note: action.onClicked doesn't fire when default_popup is set in manifest
// Toolbar interaction is now handled through the popup

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id || message.tabId;

  if (message.action === 'calibrationComplete') {
    // Calibration finished successfully
    chrome.storage.local.get('settings').then(({ settings }) => {
      settings.hasCalibration = true;
      chrome.storage.local.set({ settings });

      tabStates.set(tabId, 'active');
      updateBadge(tabId, 'active');

      chrome.tabs.sendMessage(tabId, {
        action: 'startReading'
      });
    });
  } else if (message.action === 'pause') {
    tabStates.set(tabId, 'paused');
    updateBadge(tabId, 'paused');
  } else if (message.action === 'resume') {
    tabStates.set(tabId, 'active');
    updateBadge(tabId, 'active');
  } else if (message.action === 'getState') {
    sendResponse({ state: tabStates.get(tabId) || 'inactive' });
    return true;
  } else if (message.action === 'startGaze') {
    // Start from popup
    handleStartGaze(message.tabId).then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  } else if (message.action === 'stopGaze') {
    // Stop from popup
    handleStopGaze(message.tabId).then(() => {
      sendResponse({ success: true });
    });
    return true;
  } else if (message.action === 'recalibrate') {
    // Recalibrate from popup
    handleRecalibrate(message.tabId).then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
});

// Clean up state when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  tabStates.delete(tabId);
});

// Update badge to show state
function updateBadge(tabId, state) {
  const badgeText = {
    'inactive': '',
    'calibrating': 'CAL',
    'active': 'ON',
    'paused': '||'
  };

  const badgeColor = {
    'inactive': '#666666',
    'calibrating': '#FFA500',
    'active': '#00AA00',
    'paused': '#FFAA00'
  };

  chrome.action.setBadgeText({
    tabId,
    text: badgeText[state] || ''
  });

  chrome.action.setBadgeBackgroundColor({
    tabId,
    color: badgeColor[state] || '#666666'
  });
}

// Check if content script is loaded
async function isContentScriptLoaded(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    return response?.pong === true;
  } catch (error) {
    return false;
  }
}

// Inject content scripts programmatically
async function injectContentScripts(tabId) {
  try {
    console.log('[Gaze Background] Injecting content scripts into tab', tabId);

    // Inject CSS first
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['content/styles.css']
    });

    // Inject JavaScript files in order
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [
        'lib/webgazer.js',
        'content/gaze-estimator.js',
        'content/fixation-detector.js',
        'content/scroll-controller.js',
        'content/calibration.js',
        'content/content.js'
      ]
    });

    console.log('[Gaze Background] Content scripts injected successfully');

    // Wait a moment for scripts to initialize
    await new Promise(resolve => setTimeout(resolve, 500));

    return true;
  } catch (error) {
    console.error('[Gaze Background] Error injecting content scripts:', error);
    throw new Error('Failed to inject content scripts. Make sure you are on a regular web page (not chrome://, about:, or file:// pages).');
  }
}

// Handler functions
async function handleStartGaze(tabId) {
  const state = tabStates.get(tabId) || 'inactive';
  const settings = await chrome.storage.local.get('settings');
  const hasCalibration = settings.settings?.hasCalibration || false;

  try {
    if (state === 'inactive') {
      // Check if content script is loaded, inject if not
      const isLoaded = await isContentScriptLoaded(tabId);
      if (!isLoaded) {
        console.log('[Gaze Background] Content script not loaded, injecting...');
        await injectContentScripts(tabId);
      }

      if (!hasCalibration) {
        // Need to calibrate first
        tabStates.set(tabId, 'calibrating');
        updateBadge(tabId, 'calibrating');

        await chrome.tabs.sendMessage(tabId, {
          action: 'startCalibration'
        });
      } else {
        // Go directly to active
        tabStates.set(tabId, 'active');
        updateBadge(tabId, 'active');

        await chrome.tabs.sendMessage(tabId, {
          action: 'startReading'
        });
      }
    }
  } catch (error) {
    console.error('Error starting gaze:', error);
    // Reset state on error
    tabStates.set(tabId, 'inactive');
    updateBadge(tabId, 'inactive');
    throw error;
  }
}

async function handleStopGaze(tabId) {
  try {
    tabStates.set(tabId, 'inactive');
    updateBadge(tabId, 'inactive');

    await chrome.tabs.sendMessage(tabId, {
      action: 'stop'
    });
  } catch (error) {
    console.error('Error stopping gaze:', error);
    // Even if message fails, update state
    tabStates.set(tabId, 'inactive');
    updateBadge(tabId, 'inactive');
  }
}

async function handleRecalibrate(tabId) {
  try {
    // Check if content script is loaded, inject if not
    const isLoaded = await isContentScriptLoaded(tabId);
    if (!isLoaded) {
      console.log('[Gaze Background] Content script not loaded, injecting...');
      await injectContentScripts(tabId);
    }

    // Reset calibration flag
    const settings = await chrome.storage.local.get('settings');
    settings.settings.hasCalibration = false;
    await chrome.storage.local.set({ settings: settings.settings });

    // Start calibration
    tabStates.set(tabId, 'calibrating');
    updateBadge(tabId, 'calibrating');

    await chrome.tabs.sendMessage(tabId, {
      action: 'startCalibration'
    });
  } catch (error) {
    console.error('Error recalibrating:', error);
    // Reset state on error
    tabStates.set(tabId, 'inactive');
    updateBadge(tabId, 'inactive');
    throw error;
  }
}

// Reset calibration (can be called from popup)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'resetCalibration') {
    chrome.storage.local.get('settings').then(({ settings }) => {
      settings.hasCalibration = false;
      chrome.storage.local.set({ settings });
      sendResponse({ success: true });
    });
    return true;
  }
});
