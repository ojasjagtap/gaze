/**
 * Main Content Script
 * Orchestrates all Gaze components
 */

// Constants
const POPUP_CLOSE_DELAY = 300; // ms - wait for popup to close before calibration
const USER_INTERACTION_COOLDOWN = 2000; // ms - pause duration after user interaction
const GAZE_DOT_SIZE = 12; // px
const GAZE_DOT_OFFSET = GAZE_DOT_SIZE / 2; // px - offset to center the dot
const LOG_PREFIX = '[Gaze]';

/**
 * Main controller class for the Gaze extension
 */
class GazeController {
  constructor() {
    this.isActive = false;
    this.state = 'inactive';
    this.gazeDot = null;

    // User interaction detection
    this.lastInteractionTime = 0;
    this.interactionCooldown = USER_INTERACTION_COOLDOWN;

    // Event listener cleanup
    this.boundHandleMessage = null;
    this.boundHandleKeydown = null;
    this.boundHandleMousedown = null;
    this.boundHandleSelectstart = null;
    this.boundHandleWheel = null;
    this.boundHandleTouchstart = null;
    this.boundStorageChangeListener = null;
  }

  /**
   * Initialize the Gaze controller
   */
  async initialize() {
    console.log(LOG_PREFIX, 'Initializing GazeController');

    // Clean up any leftover gaze dots from previous sessions
    this.cleanupOrphanedGazeDots();

    // Set up message listener from background
    this.boundHandleMessage = (message, sender, sendResponse) => {
      this.handleMessage(message).then((result) => {
        if (result) {
          sendResponse(result);
        } else {
          sendResponse({ success: true });
        }
      }).catch(error => {
        console.error(LOG_PREFIX, 'Error handling message:', error);
        sendResponse({ success: false, error: error.message });
      });
      return true; // Keep channel open for async response
    };
    chrome.runtime.onMessage.addListener(this.boundHandleMessage);

    // Set up user interaction detection
    this.setupInteractionDetection();

    console.log(LOG_PREFIX, 'GazeController initialized');
  }

  /**
   * Handle messages from background script
   * @param {Object} message - The message object
   * @returns {Promise<Object|null>} Response object or null
   */
  async handleMessage(message) {
    switch (message.action) {
      case 'ping':
        // Respond to ping check
        return { pong: true };

      case 'startCalibration':
        await this.startCalibration();
        break;

      case 'startReading':
        await this.startReading();
        break;

      case 'stop':
        this.stop();
        break;

      case 'pause':
        this.pause();
        break;

      case 'resume':
        this.resume();
        break;
    }

    return null;
  }

  /**
   * Start the calibration process
   */
  async startCalibration() {
    this.state = 'calibrating';

    // Wait a moment for popup to close
    await new Promise(resolve => setTimeout(resolve, POPUP_CLOSE_DELAY));

    // Start calibration
    window.calibrationManager.onComplete(() => {
      // Calibration complete, move to reading
      this.state = 'active';
    });

    try {
      await window.calibrationManager.start(9);
    } catch (error) {
      // Calibration failed - reset state
      this.state = 'inactive';
      console.error(LOG_PREFIX, 'Calibration failed:', error);
    }
  }

  /**
   * Start reading mode with gaze tracking
   */
  async startReading() {
    this.state = 'active';
    this.isActive = true;

    // Load settings
    const result = await chrome.storage.local.get('settings');
    const settings = result.settings || {};

    console.log(LOG_PREFIX, 'Starting reading with settings:', {
      showGazeDot: settings.showGazeDot,
      allSettings: settings
    });

    // Initialize components
    await window.gazeEstimator.start();

    // Update settings
    window.fixationDetector.updateSettings(settings);
    window.scrollController.updateSettings(settings);

    // Start scroll controller
    window.scrollController.start();

    // Clean up any orphaned gaze dots first
    this.cleanupOrphanedGazeDots();

    // Create gaze dot if enabled
    if (settings.showGazeDot === true) {
      console.log(LOG_PREFIX, 'Creating gaze dot because showGazeDot is true');
      this.createGazeDot();
    } else {
      console.log(LOG_PREFIX, 'NOT creating gaze dot because showGazeDot is:', settings.showGazeDot);
    }

    // Start main loop
    this.startMainLoop();
  }

  /**
   * Start the main gaze tracking loop
   */
  startMainLoop() {
    // Set up gaze update callback
    window.gazeEstimator.onGazeUpdate((gazePrediction) => {
      // Update fixation detector
      const fixationResult = window.fixationDetector.update(gazePrediction);

      // Update scroll controller
      window.scrollController.updateFromGaze(fixationResult);

      // Update gaze dot if enabled
      if (this.gazeDot) {
        this.updateGazeDot(gazePrediction.x, gazePrediction.y);
      }
    });

    // Listen for settings changes
    this.boundStorageChangeListener = (changes, namespace) => {
      if (namespace === 'local' && changes.settings) {
        const newSettings = changes.settings.newValue;
        const oldSettings = changes.settings.oldValue;

        // Only manage gaze dot if extension is active
        if (this.isActive && this.state === 'active') {
          // Check if showGazeDot actually changed (not just a spurious event)
          const gazeDotChanged = oldSettings && (oldSettings.showGazeDot !== newSettings.showGazeDot);

          console.log(LOG_PREFIX, 'Settings changed, showGazeDot:', newSettings.showGazeDot, 'gazeDot exists:', !!this.gazeDot, 'actually changed:', gazeDotChanged);

          if (gazeDotChanged) {
            // Update gaze dot visibility only if it actually changed
            if (newSettings.showGazeDot === true && !this.gazeDot) {
              console.log(LOG_PREFIX, 'Enabling gaze dot from settings change');
              this.createGazeDot();
            } else if (newSettings.showGazeDot === false && this.gazeDot) {
              console.log(LOG_PREFIX, 'Disabling gaze dot from settings change');
              this.removeGazeDot();
            }
          } else {
            console.log(LOG_PREFIX, 'showGazeDot did not actually change, ignoring');
          }
        } else {
          console.log(LOG_PREFIX, 'Settings changed but extension not active, not managing gaze dot');
        }

        // Update other settings
        window.fixationDetector.updateSettings(newSettings);
        window.scrollController.updateSettings(newSettings);
      }
    };
    chrome.storage.onChanged.addListener(this.boundStorageChangeListener);
  }

  /**
   * Pause gaze tracking
   */
  pause() {
    window.scrollController.pause();
  }

  /**
   * Resume gaze tracking
   */
  resume() {
    window.scrollController.resume();
  }

  /**
   * Stop gaze tracking and cleanup
   */
  stop() {
    this.isActive = false;
    this.state = 'inactive';

    // Stop all components
    window.scrollController.stop();
    window.gazeEstimator.stop();
    window.fixationDetector.reset();

    // Remove all gaze dots (using thorough cleanup)
    this.cleanupOrphanedGazeDots();

    // Clean up storage listener
    if (this.boundStorageChangeListener) {
      chrome.storage.onChanged.removeListener(this.boundStorageChangeListener);
      this.boundStorageChangeListener = null;
    }
  }

  /**
   * Create the gaze indicator dot
   */
  createGazeDot() {
    console.log(LOG_PREFIX, 'createGazeDot called');

    // First, clean up any existing dots (DOM or reference)
    this.cleanupOrphanedGazeDots();

    // Double-check we don't already have a reference
    if (this.gazeDot) {
      console.log(LOG_PREFIX, 'Gaze dot reference already exists, not creating');
      return;
    }

    // Create new gaze dot
    console.log(LOG_PREFIX, 'Creating new gaze dot element');
    this.gazeDot = document.createElement('div');
    this.gazeDot.id = 'gaze-dot';
    this.gazeDot.style.cssText = `
      position: fixed;
      width: ${GAZE_DOT_SIZE}px;
      height: ${GAZE_DOT_SIZE}px;
      border-radius: 50%;
      background: rgba(255, 100, 100, 0.7);
      border: 2px solid rgba(255, 255, 255, 0.9);
      pointer-events: none;
      z-index: 999999;
      display: none;
      transition: transform 0.05s ease-out;
    `;
    document.body.appendChild(this.gazeDot);
    console.log(LOG_PREFIX, 'Gaze dot element created and appended to body');
  }

  /**
   * Update the position of the gaze dot
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   */
  updateGazeDot(x, y) {
    if (!this.gazeDot) return;

    this.gazeDot.style.display = 'block';
    this.gazeDot.style.left = `${x - GAZE_DOT_OFFSET}px`;
    this.gazeDot.style.top = `${y - GAZE_DOT_OFFSET}px`;
  }

  /**
   * Remove the gaze dot from the DOM
   */
  removeGazeDot() {
    if (this.gazeDot && this.gazeDot.parentNode) {
      this.gazeDot.parentNode.removeChild(this.gazeDot);
    }
    this.gazeDot = null;

    // Also remove WebGazer's built-in dot if it exists (defensive cleanup)
    const webgazerDot = document.getElementById('webgazerGazeDot');
    if (webgazerDot && webgazerDot.parentNode) {
      webgazerDot.parentNode.removeChild(webgazerDot);
    }
  }

  /**
   * Clean up any orphaned gaze dots from previous sessions
   */
  cleanupOrphanedGazeDots() {
    // Remove ALL gaze dots from the DOM (both extension's and WebGazer's)
    const existingDots = document.querySelectorAll('#gaze-dot, #webgazerGazeDot');
    if (existingDots.length > 0) {
      console.log(LOG_PREFIX, `Found ${existingDots.length} orphaned gaze dot(s), removing...`);
    }
    existingDots.forEach(dot => {
      if (dot.parentNode) {
        dot.parentNode.removeChild(dot);
      }
    });
    // Clear our reference
    this.gazeDot = null;
  }

  /**
   * Set up event listeners for user interaction detection
   */
  setupInteractionDetection() {
    // Keyboard events
    this.boundHandleKeydown = (e) => {
      // Ignore modifier keys
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
      this.handleUserInteraction();
    };
    document.addEventListener('keydown', this.boundHandleKeydown);

    // Text selection
    this.boundHandleMousedown = () => {
      this.handleUserInteraction();
    };
    document.addEventListener('mousedown', this.boundHandleMousedown);

    this.boundHandleSelectstart = () => {
      this.handleUserInteraction();
    };
    document.addEventListener('selectstart', this.boundHandleSelectstart);

    // Mouse wheel
    this.boundHandleWheel = (e) => {
      // Only trigger if user is actively scrolling (not our auto-scroll)
      if (Math.abs(e.deltaY) > 10) {
        this.handleUserInteraction();
      }
    };
    document.addEventListener('wheel', this.boundHandleWheel, { passive: true });

    // Touch events (for tablets)
    this.boundHandleTouchstart = () => {
      this.handleUserInteraction();
    };
    document.addEventListener('touchstart', this.boundHandleTouchstart, { passive: true });
  }

  /**
   * Handle user interaction by triggering a scroll hold
   */
  handleUserInteraction() {
    if (!this.isActive) return;

    const now = Date.now();
    this.lastInteractionTime = now;

    // Trigger hold in scroll controller
    window.scrollController.triggerHold(this.interactionCooldown);
  }

  /**
   * Cleanup all event listeners (called when extension is unloaded)
   */
  cleanup() {
    if (this.boundHandleMessage) {
      chrome.runtime.onMessage.removeListener(this.boundHandleMessage);
    }
    if (this.boundHandleKeydown) {
      document.removeEventListener('keydown', this.boundHandleKeydown);
    }
    if (this.boundHandleMousedown) {
      document.removeEventListener('mousedown', this.boundHandleMousedown);
    }
    if (this.boundHandleSelectstart) {
      document.removeEventListener('selectstart', this.boundHandleSelectstart);
    }
    if (this.boundHandleWheel) {
      document.removeEventListener('wheel', this.boundHandleWheel);
    }
    if (this.boundHandleTouchstart) {
      document.removeEventListener('touchstart', this.boundHandleTouchstart);
    }
    if (this.boundStorageChangeListener) {
      chrome.storage.onChanged.removeListener(this.boundStorageChangeListener);
    }
  }
}

// Initialize Gaze controller
const gazeController = new GazeController();
gazeController.initialize();
