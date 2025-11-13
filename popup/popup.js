/**
 * Popup Script
 * Handles the extension popup UI and settings management
 */

// Constants
const LOG_PREFIX = '[Gaze Popup]';
const UI_UPDATE_INTERVAL = 2000; // ms - how often to update UI state
const UI_UPDATE_DELAY = 500; // ms - delay after stop before updating UI

// Settings validation ranges
const VALIDATION_RULES = {
  maxScrollSpeed: { min: 200, max: 1600, step: 50 },
  maxUpwardSpeed: { min: 100, max: 800, step: 50 },
  sensitivity: { min: 10, max: 100, step: 5 },
  upperZoneThreshold: { min: 0.1, max: 0.4, step: 0.05 },
  lowerZoneThreshold: { min: 0.6, max: 0.9, step: 0.05 },
  confidenceThreshold: { min: 0.3, max: 0.9, step: 0.05 }
};

// Default settings - must match background/service-worker.js
const DEFAULT_SETTINGS = {
  maxScrollSpeed: 800,
  maxUpwardSpeed: 400,
  sensitivity: 50,
  showGazeDot: true,
  upperZoneThreshold: 0.30,
  lowerZoneThreshold: 0.70,
  fixationWindow: 250,
  confidenceThreshold: 0.6,
  hasCalibration: false
};

let currentSettings = { ...DEFAULT_SETTINGS };

/**
 * Initialize popup when DOM is loaded
 */
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  setupEventListeners();
  updateUI();
});

/**
 * Load settings from storage
 */
async function loadSettings() {
  const result = await chrome.storage.local.get('settings');
  currentSettings = result.settings || DEFAULT_SETTINGS;
  populateSettings();
}

/**
 * Populate settings into UI elements
 */
function populateSettings() {
  // Max scroll speed
  const speedSlider = document.getElementById('max-speed');
  const speedDisplay = document.getElementById('speed-display');
  speedSlider.value = currentSettings.maxScrollSpeed;
  speedDisplay.textContent = `${currentSettings.maxScrollSpeed} px/s`;

  // Max upward speed
  const upwardSpeedSlider = document.getElementById('max-upward-speed');
  const upwardSpeedDisplay = document.getElementById('upward-speed-display');
  upwardSpeedSlider.value = currentSettings.maxUpwardSpeed;
  upwardSpeedDisplay.textContent = `${currentSettings.maxUpwardSpeed} px/s`;

  // Sensitivity
  const sensitivitySlider = document.getElementById('sensitivity');
  const sensitivityDisplay = document.getElementById('sensitivity-display');
  sensitivitySlider.value = currentSettings.sensitivity;
  sensitivityDisplay.textContent = currentSettings.sensitivity;

  // Upper zone
  const upperZoneSlider = document.getElementById('upper-zone');
  const upperZoneDisplay = document.getElementById('upper-zone-display');
  upperZoneSlider.value = currentSettings.upperZoneThreshold;
  upperZoneDisplay.textContent = currentSettings.upperZoneThreshold.toFixed(2);

  // Lower zone
  const lowerZoneSlider = document.getElementById('lower-zone');
  const lowerZoneDisplay = document.getElementById('lower-zone-display');
  lowerZoneSlider.value = currentSettings.lowerZoneThreshold;
  lowerZoneDisplay.textContent = currentSettings.lowerZoneThreshold.toFixed(2);

  // Confidence threshold
  const confidenceSlider = document.getElementById('confidence-threshold');
  const confidenceDisplay = document.getElementById('confidence-display');
  confidenceSlider.value = currentSettings.confidenceThreshold;
  confidenceDisplay.textContent = currentSettings.confidenceThreshold.toFixed(2);

  // Show gaze dot
  const gazeDotCheckbox = document.getElementById('show-gaze-dot');
  gazeDotCheckbox.checked = currentSettings.showGazeDot;
}

/**
 * Setup event listeners for UI elements
 */
function setupEventListeners() {
  // Toggle button
  document.getElementById('toggle-btn').addEventListener('click', handleToggle);

  // Recalibrate button
  document.getElementById('recalibrate-btn').addEventListener('click', handleRecalibrate);

  // Reset buttons
  document.getElementById('reset-btn').addEventListener('click', handleResetCalibration);
  document.getElementById('reset-settings-btn').addEventListener('click', handleResetSettings);

  // Setting sliders
  setupSlider('max-speed', 'speed-display', 'maxScrollSpeed', (val) => `${val} px/s`);
  setupSlider('max-upward-speed', 'upward-speed-display', 'maxUpwardSpeed', (val) => `${val} px/s`);
  setupSlider('sensitivity', 'sensitivity-display', 'sensitivity', (val) => val);
  setupSlider('upper-zone', 'upper-zone-display', 'upperZoneThreshold', (val) => parseFloat(val).toFixed(2));
  setupSlider('lower-zone', 'lower-zone-display', 'lowerZoneThreshold', (val) => parseFloat(val).toFixed(2));
  setupSlider('confidence-threshold', 'confidence-display', 'confidenceThreshold', (val) => parseFloat(val).toFixed(2));

  // Gaze dot checkbox
  document.getElementById('show-gaze-dot').addEventListener('change', async (e) => {
    currentSettings.showGazeDot = e.target.checked;
    await saveSettings();
  });
}

/**
 * Validate a setting value against validation rules
 * @param {string} key - Setting key
 * @param {number} value - Value to validate
 * @returns {number} Validated and clamped value
 */
function validateSetting(key, value) {
  const rules = VALIDATION_RULES[key];
  if (!rules) return value;

  // Clamp value to min/max
  let validated = Math.max(rules.min, Math.min(rules.max, value));

  // Round to nearest step
  validated = Math.round(validated / rules.step) * rules.step;

  // Fix floating point precision
  if (rules.step < 1) {
    validated = parseFloat(validated.toFixed(2));
  }

  return validated;
}

/**
 * Setup slider with live update and validation
 * @param {string} sliderId - Slider element ID
 * @param {string} displayId - Display element ID
 * @param {string} settingKey - Settings object key
 * @param {Function} formatter - Display formatter function
 */
function setupSlider(sliderId, displayId, settingKey, formatter) {
  const slider = document.getElementById(sliderId);
  const display = document.getElementById(displayId);

  slider.addEventListener('input', async (e) => {
    let value = slider.type === 'range' && (settingKey.includes('Threshold') || settingKey.includes('Zone'))
      ? parseFloat(e.target.value)
      : parseInt(e.target.value);

    // Validate the value
    value = validateSetting(settingKey, value);

    display.textContent = formatter(value);
    currentSettings[settingKey] = value;
    await saveSettings();
  });
}

/**
 * Save settings to storage with validation
 */
async function saveSettings() {
  // Validate all settings before saving
  const validatedSettings = { ...currentSettings };

  for (const [key, value] of Object.entries(validatedSettings)) {
    if (VALIDATION_RULES[key] && typeof value === 'number') {
      validatedSettings[key] = validateSetting(key, value);
    }
  }

  await chrome.storage.local.set({ settings: validatedSettings });
  currentSettings = validatedSettings;
}

/**
 * Handle toggle button click
 */
async function handleToggle() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab) {
    console.error(LOG_PREFIX, 'No active tab found');
    return;
  }

  // Get current state from background
  const response = await chrome.runtime.sendMessage({
    action: 'getState',
    tabId: tab.id
  });
  const state = response.state || 'inactive';

  try {
    if (state === 'inactive') {
      // Start Gaze
      await chrome.runtime.sendMessage({
        action: 'startGaze',
        tabId: tab.id
      });
      // Close popup to let user see the calibration
      window.close();
    } else {
      // Stop Gaze
      await chrome.runtime.sendMessage({
        action: 'stopGaze',
        tabId: tab.id
      });
      // Update UI after short delay
      setTimeout(updateUI, UI_UPDATE_DELAY);
    }
  } catch (error) {
    console.error(LOG_PREFIX, 'Error toggling gaze:', error);
    alert('Error: ' + error.message + '\n\nMake sure you are on a web page (not chrome:// or extension pages).');
  }
}

/**
 * Handle recalibrate button click
 */
async function handleRecalibrate() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab) {
    console.error(LOG_PREFIX, 'No active tab found');
    return;
  }

  try {
    await chrome.runtime.sendMessage({
      action: 'recalibrate',
      tabId: tab.id
    });
    // Close popup to let user see the calibration
    window.close();
  } catch (error) {
    console.error(LOG_PREFIX, 'Error recalibrating:', error);
    alert('Error: ' + error.message + '\n\nMake sure you are on a web page (not chrome:// or extension pages).');
  }
}

/**
 * Handle reset calibration button click
 */
async function handleResetCalibration() {
  if (confirm('Reset calibration? You will need to recalibrate next time you start Gaze.')) {
    await chrome.runtime.sendMessage({ action: 'resetCalibration' });
    currentSettings.hasCalibration = false;
    await saveSettings();
    updateUI();
  }
}

/**
 * Handle reset settings button click
 */
async function handleResetSettings() {
  if (confirm('Reset all settings to defaults?')) {
    currentSettings = { ...DEFAULT_SETTINGS };
    await saveSettings();
    populateSettings();
    updateUI();
  }
}

/**
 * Update UI based on current state
 */
async function updateUI() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab) {
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'getState',
      tabId: tab.id
    });
    const state = response.state || 'inactive';

    const statusCard = document.getElementById('status-card');
    const statusIcon = document.getElementById('status-icon');
    const statusValue = document.getElementById('status-value');
    const toggleBtn = document.getElementById('toggle-btn');
    const toggleText = document.getElementById('toggle-text');

    // Update status display
    statusCard.className = 'status-card';
    switch (state) {
      case 'active':
        statusCard.classList.add('active');
        statusIcon.textContent = '';
        statusValue.textContent = 'Active';
        toggleText.textContent = 'Stop';
        break;

      case 'calibrating':
        statusCard.classList.add('calibrating');
        statusIcon.textContent = '';
        statusValue.textContent = 'Calibrating';
        toggleText.textContent = 'Stop';
        break;

      case 'paused':
        statusCard.classList.add('paused');
        statusIcon.textContent = '';
        statusValue.textContent = 'Paused';
        toggleText.textContent = 'Stop';
        break;

      default:
        statusIcon.textContent = '';
        statusValue.textContent = 'Inactive';
        toggleText.textContent = 'Start';
        break;
    }
  } catch (error) {
    console.error(LOG_PREFIX, 'Failed to get state:', error);
  }
}

/**
 * Listen for settings changes from other sources
 */
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.settings) {
    currentSettings = changes.settings.newValue;
    populateSettings();
  }
});

// Update UI periodically
setInterval(updateUI, UI_UPDATE_INTERVAL);
