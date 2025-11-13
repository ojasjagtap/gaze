// Main Content Script
// Orchestrates all Gaze components

class GazeController {
  constructor() {
    this.isActive = false;
    this.state = 'inactive';
    this.gazeDot = null;

    // User interaction detection
    this.lastInteractionTime = 0;
    this.interactionCooldown = 2000; // 2 seconds
  }

  async initialize() {
    // Set up message listener from background
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message).then((result) => {
        if (result) {
          sendResponse(result);
        } else {
          sendResponse({ success: true });
        }
      }).catch(error => {
        console.error('[Gaze] Error handling message:', error);
        sendResponse({ success: false, error: error.message });
      });
      return true; // Keep channel open for async response
    });

    // Set up user interaction detection
    this.setupInteractionDetection();

    console.log('[Gaze] Content script initialized');
  }

  async handleMessage(message) {
    console.log('[Gaze] Received message:', message.action);

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

  async startCalibration() {
    console.log('[Gaze] Starting calibration');
    this.state = 'calibrating';

    // Start calibration
    window.calibrationManager.onComplete(() => {
      // Calibration complete, move to reading
      this.state = 'active';
    });

    await window.calibrationManager.start(9);
  }

  async startReading() {
    console.log('[Gaze] Starting reading mode');
    this.state = 'active';
    this.isActive = true;

    // Load settings
    const result = await chrome.storage.local.get('settings');
    const settings = result.settings || {};

    // Initialize components
    await window.gazeEstimator.start();

    // Update settings
    window.fixationDetector.updateSettings(settings);
    window.scrollController.updateSettings(settings);

    // Start scroll controller
    window.scrollController.start();

    // Create gaze dot if enabled
    if (settings.showGazeDot) {
      this.createGazeDot();
    }

    // Start main loop
    this.startMainLoop();
  }

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
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' && changes.settings) {
        const newSettings = changes.settings.newValue;

        // Update gaze dot visibility
        if (newSettings.showGazeDot && !this.gazeDot) {
          this.createGazeDot();
        } else if (!newSettings.showGazeDot && this.gazeDot) {
          this.removeGazeDot();
        }

        // Update other settings
        window.fixationDetector.updateSettings(newSettings);
        window.scrollController.updateSettings(newSettings);
      }
    });
  }

  pause() {
    console.log('[Gaze] Pausing');
    window.scrollController.pause();
  }

  resume() {
    console.log('[Gaze] Resuming');
    window.scrollController.resume();
  }

  stop() {
    console.log('[Gaze] Stopping');
    this.isActive = false;
    this.state = 'inactive';

    // Stop all components
    window.scrollController.stop();
    window.gazeEstimator.stop();
    window.fixationDetector.reset();

    // Remove gaze dot
    this.removeGazeDot();
  }

  createGazeDot() {
    if (this.gazeDot) return;

    this.gazeDot = document.createElement('div');
    this.gazeDot.id = 'gaze-dot';
    this.gazeDot.style.cssText = `
      position: fixed;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: rgba(255, 100, 100, 0.7);
      border: 2px solid rgba(255, 255, 255, 0.9);
      pointer-events: none;
      z-index: 999999;
      display: none;
      transition: transform 0.05s ease-out;
    `;
    document.body.appendChild(this.gazeDot);
    console.log('[Gaze] Gaze dot created');
  }

  updateGazeDot(x, y) {
    if (!this.gazeDot) return;

    this.gazeDot.style.display = 'block';
    this.gazeDot.style.left = `${x - 6}px`;
    this.gazeDot.style.top = `${y - 6}px`;
  }

  removeGazeDot() {
    if (this.gazeDot && this.gazeDot.parentNode) {
      this.gazeDot.parentNode.removeChild(this.gazeDot);
      this.gazeDot = null;
      console.log('[Gaze] Gaze dot removed');
    }
  }

  setupInteractionDetection() {
    // Detect user interactions that should pause scrolling

    // Keyboard events
    document.addEventListener('keydown', (e) => {
      // Ignore modifier keys
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;

      this.handleUserInteraction();
    });

    // Text selection
    document.addEventListener('mousedown', () => {
      this.handleUserInteraction();
    });

    document.addEventListener('selectstart', () => {
      this.handleUserInteraction();
    });

    // Mouse wheel
    document.addEventListener('wheel', (e) => {
      // Only trigger if user is actively scrolling (not our auto-scroll)
      if (Math.abs(e.deltaY) > 10) {
        this.handleUserInteraction();
      }
    }, { passive: true });

    // Touch events (for tablets)
    document.addEventListener('touchstart', () => {
      this.handleUserInteraction();
    }, { passive: true });
  }

  handleUserInteraction() {
    if (!this.isActive) return;

    const now = Date.now();
    this.lastInteractionTime = now;

    // Trigger hold in scroll controller
    window.scrollController.triggerHold(this.interactionCooldown);

    console.log('[Gaze] User interaction detected, holding scroll');
  }

  // Handle viewport changes
  setupViewportObserver() {
    // Detect zoom changes and resizes
    window.addEventListener('resize', () => {
      if (this.isActive) {
        console.log('[Gaze] Viewport changed, updating scroll target');
        window.scrollController.updateScrollTarget();
      }
    });

    // Detect zoom via visual viewport
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => {
        if (this.isActive) {
          console.log('[Gaze] Zoom changed, updating scroll target');
          window.scrollController.updateScrollTarget();
        }
      });
    }
  }
}

// Initialize Gaze controller
const gazeController = new GazeController();
gazeController.initialize();

console.log('[Gaze] Content script loaded');
