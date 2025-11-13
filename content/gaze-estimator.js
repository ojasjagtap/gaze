// Gaze Estimator Module
// Wraps WebGazer.js for gaze estimation with confidence tracking

class GazeEstimator {
  constructor() {
    this.isInitialized = false;
    this.isRunning = false;
    this.callbacks = [];
    this.lastPrediction = null;
    this.calibrationData = null;
    this.targetFrameRate = 25; // Target 25 Hz for good balance
  }

  async initialize() {
    if (this.isInitialized) return;

    return new Promise((resolve, reject) => {
      try {
        // Check if WebGazer is available
        if (typeof webgazer === 'undefined') {
          throw new Error('WebGazer library not loaded');
        }

        // Initialize WebGazer
        webgazer.params.showVideo = false;
        webgazer.params.showFaceOverlay = false;
        webgazer.params.showFaceFeedbackBox = false;

        // Use ridge regression for better accuracy
        webgazer.setRegression('ridge');

        // Use TFFacemesh for better tracking
        webgazer.setTracker('TFFacemesh');

        // Set frame rate
        webgazer.params.videoViewerWidth = 320;
        webgazer.params.videoViewerHeight = 240;

        this.isInitialized = true;
        resolve();
      } catch (error) {
        console.error('Failed to initialize WebGazer:', error);
        reject(error);
      }
    });
  }

  async start() {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.isRunning) return;

    // Load calibration if exists
    const calibration = await this.loadCalibration();
    if (calibration) {
      this.calibrationData = calibration;
    }

    // Start WebGazer
    webgazer.begin();
    this.isRunning = true;

    // Set up prediction loop
    webgazer.setGazeListener((data, timestamp) => {
      if (data) {
        const prediction = this.processPrediction(data, timestamp);
        this.lastPrediction = prediction;

        // Notify all callbacks
        this.callbacks.forEach(callback => callback(prediction));
      }
    });

    // Resume if it was paused
    webgazer.resume();
  }

  stop() {
    if (!this.isRunning) return;

    webgazer.pause();
    this.isRunning = false;
  }

  async destroy() {
    if (this.isRunning) {
      await webgazer.end();
    }
    this.isRunning = false;
    this.isInitialized = false;
    this.callbacks = [];
  }

  processPrediction(data, timestamp) {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Normalize coordinates to [0, 1]
    const normalizedX = Math.max(0, Math.min(1, data.x / viewportWidth));
    const normalizedY = Math.max(0, Math.min(1, data.y / viewportHeight));

    // Estimate confidence based on WebGazer's internal state
    // WebGazer doesn't directly provide confidence, so we estimate it
    const confidence = this.estimateConfidence(data);

    return {
      x: data.x,
      y: data.y,
      normalizedX,
      normalizedY,
      confidence,
      timestamp
    };
  }

  estimateConfidence(data) {
    // Heuristic: if coordinates are within viewport and not at edges, higher confidence
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Check if prediction is within viewport
    if (data.x < 0 || data.x > viewportWidth || data.y < 0 || data.y > viewportHeight) {
      return 0.3; // Low confidence for out-of-bounds
    }

    // Check if at extreme edges (might be unstable)
    const edgeMargin = 50;
    if (data.x < edgeMargin || data.x > viewportWidth - edgeMargin ||
        data.y < edgeMargin || data.y > viewportHeight - edgeMargin) {
      return 0.6; // Medium confidence at edges
    }

    // In main viewport area
    return 0.85; // High confidence
  }

  onGazeUpdate(callback) {
    this.callbacks.push(callback);
    return () => {
      this.callbacks = this.callbacks.filter(cb => cb !== callback);
    };
  }

  // Calibration methods
  async addCalibrationPoint(x, y, duration = 700) {
    return new Promise((resolve) => {
      const points = [];
      const startTime = Date.now();

      const collectSample = () => {
        const elapsed = Date.now() - startTime;

        if (elapsed < duration) {
          if (this.lastPrediction) {
            points.push({
              predicted: this.lastPrediction,
              actual: { x, y }
            });
          }
          requestAnimationFrame(collectSample);
        } else {
          resolve(points);
        }
      };

      // Trigger WebGazer's calibration point
      webgazer.recordScreenPosition(x, y, 'click');

      collectSample();
    });
  }

  async saveCalibration() {
    try {
      const data = webgazer.getRegression();
      await chrome.storage.local.set({ calibrationData: data });
      this.calibrationData = data;
      return true;
    } catch (error) {
      console.error('Failed to save calibration:', error);
      return false;
    }
  }

  async loadCalibration() {
    try {
      const result = await chrome.storage.local.get('calibrationData');
      return result.calibrationData || null;
    } catch (error) {
      console.error('Failed to load calibration:', error);
      return null;
    }
  }

  clearCalibration() {
    chrome.storage.local.remove('calibrationData');
    this.calibrationData = null;
  }

  // Get current state
  getLastPrediction() {
    return this.lastPrediction;
  }

  isActive() {
    return this.isRunning;
  }
}

// Create singleton instance
window.gazeEstimator = new GazeEstimator();
