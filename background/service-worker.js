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

// Handle toolbar icon click
chrome.action.onClicked.addListener(async (tab) => {
  const state = tabStates.get(tab.id) || 'inactive';
  const settings = await chrome.storage.local.get('settings');
  const hasCalibration = settings.settings?.hasCalibration || false;

  if (state === 'inactive') {
    // Start gaze tracking
    if (!hasCalibration) {
      // Need to calibrate first
      tabStates.set(tab.id, 'calibrating');
      updateBadge(tab.id, 'calibrating');

      chrome.tabs.sendMessage(tab.id, {
        action: 'startCalibration'
      });
    } else {
      // Go directly to active
      tabStates.set(tab.id, 'active');
      updateBadge(tab.id, 'active');

      chrome.tabs.sendMessage(tab.id, {
        action: 'startReading'
      });
    }
  } else {
    // Stop gaze tracking
    tabStates.set(tab.id, 'inactive');
    updateBadge(tab.id, 'inactive');

    chrome.tabs.sendMessage(tab.id, {
      action: 'stop'
    });
  }
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

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
