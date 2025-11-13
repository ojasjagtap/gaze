/**
 * Background service worker for Gaze extension
 * Manages per-tab state and toolbar interactions
 */

// Constants
const TAB_STATES = {
  INACTIVE: 'inactive',
  CALIBRATING: 'calibrating',
  ACTIVE: 'active',
  PAUSED: 'paused'
};

const BADGE_CONFIG = {
  [TAB_STATES.INACTIVE]: { text: '', color: '#666666' },
  [TAB_STATES.CALIBRATING]: { text: 'CAL', color: '#FFA500' },
  [TAB_STATES.ACTIVE]: { text: 'ON', color: '#00AA00' },
  [TAB_STATES.PAUSED]: { text: '||', color: '#FFAA00' }
};

const SCRIPT_INJECTION_DELAY = 500; // ms - wait for scripts to initialize
const PING_TIMEOUT = 1000; // ms - timeout for content script ping

// Tab states tracking
const tabStates = new Map();

// Default settings - single source of truth
const DEFAULT_SETTINGS = {
  maxScrollSpeed: 800, // px/s
  maxUpwardSpeed: 400, // px/s
  sensitivity: 50, // 0-100
  showGazeDot: true,
  upperZoneThreshold: 0.30,
  lowerZoneThreshold: 0.70,
  fixationWindow: 250, // ms
  confidenceThreshold: 0.6,
  hasCalibration: false
};

/**
 * Initialize settings on extension installation
 */
chrome.runtime.onInstalled.addListener(async () => {
  const { settings } = await chrome.storage.local.get('settings');
  if (!settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  }
});

/**
 * Handle messages from content scripts and popup - consolidated listener
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id || message.tabId;

  switch (message.action) {
    case 'calibrationComplete':
      handleCalibrationComplete(tabId).then(() => sendResponse({ success: true }));
      return true;

    case 'calibrationFailed':
      handleCalibrationFailed(tabId, message.reason);
      sendResponse({ success: true });
      return true;

    case 'pause':
      tabStates.set(tabId, TAB_STATES.PAUSED);
      updateBadge(tabId, TAB_STATES.PAUSED);
      sendResponse({ success: true });
      return true;

    case 'resume':
      tabStates.set(tabId, TAB_STATES.ACTIVE);
      updateBadge(tabId, TAB_STATES.ACTIVE);
      sendResponse({ success: true });
      return true;

    case 'getState':
      sendResponse({ state: tabStates.get(tabId) || TAB_STATES.INACTIVE });
      return true;

    case 'startGaze':
      handleStartGaze(message.tabId)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'stopGaze':
      handleStopGaze(message.tabId)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'recalibrate':
      handleRecalibrate(message.tabId)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'resetCalibration':
      handleResetCalibration()
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    default:
      sendResponse({ success: false, error: 'Unknown action' });
      return false;
  }
});

/**
 * Clean up state when tab is closed
 */
chrome.tabs.onRemoved.addListener((tabId) => {
  tabStates.delete(tabId);
});

/**
 * Update extension badge to show current state
 * @param {number} tabId - The tab ID
 * @param {string} state - The current state (from TAB_STATES)
 */
function updateBadge(tabId, state) {
  const config = BADGE_CONFIG[state] || BADGE_CONFIG[TAB_STATES.INACTIVE];

  chrome.action.setBadgeText({
    tabId,
    text: config.text
  });

  chrome.action.setBadgeBackgroundColor({
    tabId,
    color: config.color
  });
}

/**
 * Check if content script is already loaded in the tab
 * @param {number} tabId - The tab ID to check
 * @returns {Promise<boolean>} True if content script is loaded
 */
async function isContentScriptLoaded(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    return response?.pong === true;
  } catch (error) {
    return false;
  }
}

/**
 * Inject content scripts programmatically into a tab
 * @param {number} tabId - The tab ID to inject scripts into
 * @throws {Error} If injection fails
 */
async function injectContentScripts(tabId) {
  try {
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

    // Wait for scripts to initialize
    await new Promise(resolve => setTimeout(resolve, SCRIPT_INJECTION_DELAY));

    return true;
  } catch (error) {
    console.error('[Gaze] Error injecting content scripts:', error);
    throw new Error('Failed to inject content scripts. Make sure you are on a regular web page (not chrome://, about:, or file:// pages).');
  }
}

/**
 * Handle calibration completion
 * @param {number} tabId - The tab ID
 */
async function handleCalibrationComplete(tabId) {
  try {
    const { settings } = await chrome.storage.local.get('settings');
    settings.hasCalibration = true;
    await chrome.storage.local.set({ settings });

    tabStates.set(tabId, TAB_STATES.ACTIVE);
    updateBadge(tabId, TAB_STATES.ACTIVE);

    await chrome.tabs.sendMessage(tabId, {
      action: 'startReading'
    });
  } catch (error) {
    console.error('[Gaze] Error handling calibration complete:', error);
    throw error;
  }
}

/**
 * Handle calibration failure
 * @param {number} tabId - The tab ID
 * @param {string} reason - Reason for failure
 */
function handleCalibrationFailed(tabId, reason) {
  tabStates.set(tabId, TAB_STATES.INACTIVE);
  updateBadge(tabId, TAB_STATES.INACTIVE);

  // Attempt to show popup for user feedback
  chrome.action.openPopup().catch(() => {
    console.error('[Gaze] Camera access denied:', reason);
  });
}

/**
 * Start gaze tracking for a tab
 * @param {number} tabId - The tab ID
 */
async function handleStartGaze(tabId) {
  const state = tabStates.get(tabId) || TAB_STATES.INACTIVE;
  const { settings } = await chrome.storage.local.get('settings');
  const hasCalibration = settings?.hasCalibration || false;

  try {
    if (state === TAB_STATES.INACTIVE) {
      // Check if content script is loaded, inject if not
      const isLoaded = await isContentScriptLoaded(tabId);
      if (!isLoaded) {
        await injectContentScripts(tabId);
      }

      if (!hasCalibration) {
        // Need to calibrate first
        tabStates.set(tabId, TAB_STATES.CALIBRATING);
        updateBadge(tabId, TAB_STATES.CALIBRATING);

        await chrome.tabs.sendMessage(tabId, {
          action: 'startCalibration'
        });
      } else {
        // Go directly to active
        tabStates.set(tabId, TAB_STATES.ACTIVE);
        updateBadge(tabId, TAB_STATES.ACTIVE);

        await chrome.tabs.sendMessage(tabId, {
          action: 'startReading'
        });
      }
    }
  } catch (error) {
    console.error('[Gaze] Error starting gaze:', error);
    // Reset state on error
    tabStates.set(tabId, TAB_STATES.INACTIVE);
    updateBadge(tabId, TAB_STATES.INACTIVE);
    throw error;
  }
}

/**
 * Stop gaze tracking for a tab
 * @param {number} tabId - The tab ID
 */
async function handleStopGaze(tabId) {
  try {
    tabStates.set(tabId, TAB_STATES.INACTIVE);
    updateBadge(tabId, TAB_STATES.INACTIVE);

    await chrome.tabs.sendMessage(tabId, {
      action: 'stop'
    });
  } catch (error) {
    console.error('[Gaze] Error stopping gaze:', error);
    // Even if message fails, update state
    tabStates.set(tabId, TAB_STATES.INACTIVE);
    updateBadge(tabId, TAB_STATES.INACTIVE);
  }
}

/**
 * Recalibrate gaze tracking for a tab
 * @param {number} tabId - The tab ID
 */
async function handleRecalibrate(tabId) {
  try {
    // Check if content script is loaded, inject if not
    const isLoaded = await isContentScriptLoaded(tabId);
    if (!isLoaded) {
      await injectContentScripts(tabId);
    }

    // Reset calibration flag
    const { settings } = await chrome.storage.local.get('settings');
    settings.hasCalibration = false;
    await chrome.storage.local.set({ settings });

    // Start calibration
    tabStates.set(tabId, TAB_STATES.CALIBRATING);
    updateBadge(tabId, TAB_STATES.CALIBRATING);

    await chrome.tabs.sendMessage(tabId, {
      action: 'startCalibration'
    });
  } catch (error) {
    console.error('[Gaze] Error recalibrating:', error);
    // Reset state on error
    tabStates.set(tabId, TAB_STATES.INACTIVE);
    updateBadge(tabId, TAB_STATES.INACTIVE);
    throw error;
  }
}

/**
 * Reset calibration data
 */
async function handleResetCalibration() {
  try {
    const { settings } = await chrome.storage.local.get('settings');
    settings.hasCalibration = false;
    await chrome.storage.local.set({ settings });
  } catch (error) {
    console.error('[Gaze] Error resetting calibration:', error);
    throw error;
  }
}
