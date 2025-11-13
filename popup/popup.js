// Popup Script

// Default settings
const DEFAULT_SETTINGS = {
  maxScrollSpeed: 800,
  maxUpwardSpeed: 400,
  sensitivity: 50,
  showGazeDot: false,
  upperZoneThreshold: 0.30,
  lowerZoneThreshold: 0.70,
  fixationWindow: 250,
  confidenceThreshold: 0.6,
  hasCalibration: false
};

let currentSettings = { ...DEFAULT_SETTINGS };

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  setupEventListeners();
  updateUI();
});

// Load settings from storage
async function loadSettings() {
  const result = await chrome.storage.local.get('settings');
  currentSettings = result.settings || DEFAULT_SETTINGS;
  populateSettings();
}

// Populate settings into UI
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

// Setup event listeners
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

// Setup slider with live update
function setupSlider(sliderId, displayId, settingKey, formatter) {
  const slider = document.getElementById(sliderId);
  const display = document.getElementById(displayId);

  slider.addEventListener('input', async (e) => {
    const value = slider.type === 'range' && settingKey.includes('Threshold') || settingKey.includes('Zone')
      ? parseFloat(e.target.value)
      : parseInt(e.target.value);

    display.textContent = formatter(value);
    currentSettings[settingKey] = value;
    await saveSettings();
  });
}

// Save settings to storage
async function saveSettings() {
  await chrome.storage.local.set({ settings: currentSettings });
}

// Handle toggle button
async function handleToggle() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab) {
    console.error('No active tab found');
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
    } else {
      // Stop Gaze
      await chrome.runtime.sendMessage({
        action: 'stopGaze',
        tabId: tab.id
      });
    }
  } catch (error) {
    console.error('Error toggling gaze:', error);
    alert('Error: ' + error.message + '\n\nMake sure you are on a web page (not chrome:// or extension pages).');
  }

  // Update UI after short delay
  setTimeout(updateUI, 500);
}

// Handle recalibrate
async function handleRecalibrate() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab) {
    console.error('No active tab found');
    return;
  }

  try {
    await chrome.runtime.sendMessage({
      action: 'recalibrate',
      tabId: tab.id
    });
  } catch (error) {
    console.error('Error recalibrating:', error);
    alert('Error: ' + error.message + '\n\nMake sure you are on a web page (not chrome:// or extension pages).');
  }

  // Update UI
  setTimeout(updateUI, 500);
}

// Handle reset calibration
async function handleResetCalibration() {
  if (confirm('Reset calibration? You will need to recalibrate next time you start Gaze.')) {
    await chrome.runtime.sendMessage({ action: 'resetCalibration' });
    currentSettings.hasCalibration = false;
    await saveSettings();
    updateUI();
  }
}

// Handle reset settings
async function handleResetSettings() {
  if (confirm('Reset all settings to defaults?')) {
    currentSettings = { ...DEFAULT_SETTINGS };
    await saveSettings();
    populateSettings();
    updateUI();
  }
}

// Update UI based on current state
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
        statusIcon.textContent = '●';
        statusValue.textContent = 'Active';
        toggleText.textContent = 'Stop';
        break;

      case 'calibrating':
        statusCard.classList.add('calibrating');
        statusIcon.textContent = '◐';
        statusValue.textContent = 'Calibrating';
        toggleText.textContent = 'Stop';
        break;

      case 'paused':
        statusIcon.textContent = '⏸';
        statusValue.textContent = 'Paused';
        toggleText.textContent = 'Stop';
        break;

      default:
        statusIcon.textContent = '○';
        statusValue.textContent = 'Inactive';
        toggleText.textContent = 'Start';
        break;
    }
  } catch (error) {
    console.error('Failed to get state:', error);
  }
}

// Listen for state changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.settings) {
    currentSettings = changes.settings.newValue;
    populateSettings();
  }
});

// Update UI periodically
setInterval(updateUI, 2000);
