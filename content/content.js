// Main Content Script
// Orchestrates all Gaze components

class GazeController {
  constructor() {
    this.isActive = false;
    this.state = 'inactive';

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

    // Create floating control UI
    await window.floatingControl.create();

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

      // Update floating control status
      window.floatingControl.updateStatus(
        fixationResult.isFixating ? 'active' : 'low_confidence',
        gazePrediction.confidence
      );

      // Update gaze dot if enabled
      if (window.floatingControl.settings?.showGazeDot) {
        window.floatingControl.updateGazeDot(gazePrediction.x, gazePrediction.y);
      }

      // Update stats (for debugging)
      const stats = window.scrollController.getStats();
      window.floatingControl.updateStats(stats);
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

    // Remove UI
    window.floatingControl.remove();
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

// Keyboard shortcut for stats toggle (for debugging)
document.addEventListener('keydown', (e) => {
  // Ctrl+Shift+G to toggle stats
  if (e.ctrlKey && e.shiftKey && e.key === 'G') {
    window.floatingControl.toggleStats();
  }
});

console.log('[Gaze] Content script loaded');
