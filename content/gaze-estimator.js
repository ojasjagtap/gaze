/**
 * Gaze Estimator Module
 * Wraps WebGazer.js for gaze estimation with confidence tracking
 */

// Constants
const TARGET_FRAME_RATE = 25; // Hz - target frame rate for gaze estimation
const VIDEO_VIEWER_WIDTH = 320; // px - WebGazer video width
const VIDEO_VIEWER_HEIGHT = 240; // px - WebGazer video height
const DEFAULT_CALIBRATION_DURATION = 700; // ms - default duration for calibration point
const CONFIDENCE_OUT_OF_BOUNDS = 0.3; // confidence when prediction is out of viewport
const CONFIDENCE_AT_EDGES = 0.6; // confidence when prediction is at viewport edges
const CONFIDENCE_IN_VIEWPORT = 0.85; // confidence when prediction is in main viewport
const EDGE_MARGIN = 50; // px - margin from viewport edges for confidence calculation
const LOG_PREFIX = '[Gaze]';

/**
 * Wrapper for WebGazer.js providing gaze estimation with confidence tracking
 */
class GazeEstimator {
  constructor() {
    this.isInitialized = false;
    this.isRunning = false;
    this.callbacks = [];
    this.lastPrediction = null;
    this.calibrationData = null;
    this.targetFrameRate = TARGET_FRAME_RATE;
  }

  /**
   * Initialize WebGazer library
   * @returns {Promise<void>}
   * @throws {Error} If WebGazer library is not loaded
   */
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
        webgazer.params.showGazeDot = false; // Disable WebGazer's built-in gaze dot

        // Use ridge regression for better accuracy
        webgazer.setRegression('ridge');

        // Use TFFacemesh for better tracking
        webgazer.setTracker('TFFacemesh');

        // Set frame rate
        webgazer.params.videoViewerWidth = VIDEO_VIEWER_WIDTH;
        webgazer.params.videoViewerHeight = VIDEO_VIEWER_HEIGHT;

        this.isInitialized = true;
        resolve();
      } catch (error) {
        console.error(LOG_PREFIX, 'Failed to initialize WebGazer:', error);
        reject(error);
      }
    });
  }

  /**
   * Request camera access from the user
   * @returns {Promise<void>}
   * @throws {Error} If camera access is denied
   */
  async requestCameraAccess() {
    return new Promise((resolve, reject) => {
      // Request camera access via getUserMedia
      navigator.mediaDevices.getUserMedia({ video: true })
        .then((stream) => {
          // Stop the stream immediately - we just needed permission
          stream.getTracks().forEach(track => track.stop());
          resolve();
        })
        .catch((error) => {
          console.error(LOG_PREFIX, 'Camera access denied:', error);
          reject(new Error('Camera access denied. Please grant camera permission to use gaze tracking.'));
        });
    });
  }

  /**
   * Start gaze tracking
   * @returns {Promise<void>}
   */
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

  /**
   * Stop gaze tracking (pause)
   */
  stop() {
    if (!this.isRunning) return;

    webgazer.pause();
    this.isRunning = false;
  }

  /**
   * Destroy the gaze estimator and clean up resources
   * @returns {Promise<void>}
   */
  async destroy() {
    if (this.isRunning) {
      await webgazer.end();
    }
    this.isRunning = false;
    this.isInitialized = false;
    this.callbacks = [];
  }

  /**
   * Process raw WebGazer prediction into normalized format
   * @param {Object} data - Raw WebGazer prediction data
   * @param {number} data.x - X coordinate in pixels
   * @param {number} data.y - Y coordinate in pixels
   * @param {number} timestamp - Timestamp of prediction
   * @returns {Object} Processed prediction with confidence
   */
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

  /**
   * Estimate confidence of gaze prediction
   * Heuristic: predictions within viewport and away from edges have higher confidence
   * @param {Object} data - Prediction data
   * @param {number} data.x - X coordinate
   * @param {number} data.y - Y coordinate
   * @returns {number} Confidence score (0-1)
   */
  estimateConfidence(data) {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Check if prediction is within viewport
    if (data.x < 0 || data.x > viewportWidth || data.y < 0 || data.y > viewportHeight) {
      return CONFIDENCE_OUT_OF_BOUNDS;
    }

    // Check if at extreme edges (might be unstable)
    if (data.x < EDGE_MARGIN || data.x > viewportWidth - EDGE_MARGIN ||
        data.y < EDGE_MARGIN || data.y > viewportHeight - EDGE_MARGIN) {
      return CONFIDENCE_AT_EDGES;
    }

    // In main viewport area
    return CONFIDENCE_IN_VIEWPORT;
  }

  /**
   * Register callback for gaze updates
   * @param {Function} callback - Function to call on each gaze update
   * @returns {Function} Unsubscribe function
   */
  onGazeUpdate(callback) {
    this.callbacks.push(callback);
    return () => {
      this.callbacks = this.callbacks.filter(cb => cb !== callback);
    };
  }

  /**
   * Add a calibration point (used during calibration process)
   * @param {number} x - X coordinate of calibration point
   * @param {number} y - Y coordinate of calibration point
   * @param {number} duration - Duration in ms to collect samples
   * @returns {Promise<Array>} Array of collected calibration points
   */
  async addCalibrationPoint(x, y, duration = DEFAULT_CALIBRATION_DURATION) {
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

  /**
   * Save calibration data to storage
   * @returns {Promise<boolean>} True if successful
   */
  async saveCalibration() {
    try {
      const data = webgazer.getRegression();
      await chrome.storage.local.set({ calibrationData: data });
      this.calibrationData = data;
      return true;
    } catch (error) {
      console.error(LOG_PREFIX, 'Failed to save calibration:', error);
      return false;
    }
  }

  /**
   * Load calibration data from storage
   * @returns {Promise<Object|null>} Calibration data or null
   */
  async loadCalibration() {
    try {
      const result = await chrome.storage.local.get('calibrationData');
      return result.calibrationData || null;
    } catch (error) {
      console.error(LOG_PREFIX, 'Failed to load calibration:', error);
      return null;
    }
  }

  /**
   * Clear calibration data from storage
   */
  clearCalibration() {
    chrome.storage.local.remove('calibrationData');
    this.calibrationData = null;
  }

  /**
   * Get the last prediction
   * @returns {Object|null} Last prediction or null
   */
  getLastPrediction() {
    return this.lastPrediction;
  }

  /**
   * Check if gaze tracking is currently active
   * @returns {boolean} True if running
   */
  isActive() {
    return this.isRunning;
  }
}

// Create singleton instance
window.gazeEstimator = new GazeEstimator();
