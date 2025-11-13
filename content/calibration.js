/**
 * Calibration Module
 * Handles the calibration flow with on-screen points
 */

// Constants
const DEFAULT_NUM_CALIBRATION_POINTS = 9; // number of calibration points
const CALIBRATION_MARGIN = 0.15; // 15% margin from edges for calibration points
const CAMERA_PERMISSION_DELAY = 1000; // ms - wait for permission dialog to close
const CAMERA_INIT_DELAY = 500; // ms - wait for camera to initialize
const TARGET_APPEAR_DELAY = 800; // ms - delay before starting calibration for each point
const BETWEEN_POINTS_DELAY = 400; // ms - pause between calibration points
const COMPLETION_MESSAGE_DELAY = 1500; // ms - how long to show completion message
const LOG_PREFIX = '[Gaze]';

// Calibration data collection constants
const MAX_CALIBRATION_DURATION = 3000; // ms - maximum time per calibration point
const REQUIRED_GAZE_DURATION = 700; // ms - required duration of looking at target
const GAZE_RADIUS = 150; // px - how close gaze must be to target
const MIN_CONFIDENCE_FOR_CALIBRATION = 0.5; // minimum confidence for calibration sample
const CALIBRATION_SAMPLE_INTERVAL = 100; // ms - how often to sample during calibration

// Visual feedback constants
const TARGET_SCALE_NORMAL = 1.0; // normal target scale
const TARGET_SCALE_FOCUSED = 1.1; // target scale when user is looking at it
const TARGET_SIZE = 60; // px - calibration target size
const PROGRESS_RING_RADIUS = 28; // px - radius of progress ring
const CENTER_POSITION = 0.5; // normalized position for center point

/**
 * Manages the calibration process for gaze tracking
 */
class CalibrationManager {
  constructor() {
    this.isCalibrating = false;
    this.currentPointIndex = 0;
    this.calibrationPoints = [];
    this.overlay = null;
    this.onCompleteCallback = null;
  }

  /**
   * Start the calibration process
   * @param {number} numPoints - Number of calibration points (5 or 9)
   * @throws {Error} If camera access is denied
   */
  async start(numPoints = DEFAULT_NUM_CALIBRATION_POINTS) {
    if (this.isCalibrating) return;

    this.isCalibrating = true;
    this.currentPointIndex = 0;

    // Generate calibration points (corners, edges, center)
    this.calibrationPoints = this.generateCalibrationPoints(numPoints);

    try {
      // Initialize gaze estimator (doesn't start camera yet)
      await window.gazeEstimator.initialize();

      // Request camera access and wait for user response
      // This will show the browser's camera permission dialog
      await window.gazeEstimator.requestCameraAccess();

      // Camera access granted - wait for permission dialog to close
      await this.delay(CAMERA_PERMISSION_DELAY);

      // Create overlay UI after camera permission is granted
      this.createOverlay();

      // Start camera now that permission is granted and dialog is closed
      await window.gazeEstimator.start();

      // Wait a moment for camera to initialize
      await this.delay(CAMERA_INIT_DELAY);

      // Start calibration sequence
      await this.runCalibrationSequence();
    } catch (error) {
      // Camera access denied or error occurred
      console.error(LOG_PREFIX, 'Camera access error:', error);
      this.isCalibrating = false;
      this.removeOverlay();

      // Notify that calibration failed
      chrome.runtime.sendMessage({
        action: 'calibrationFailed',
        reason: error.message || 'Camera access denied'
      });

      throw error;
    }
  }

  /**
   * Generate calibration points based on viewport
   * @param {number} numPoints - Number of points (5 or 9)
   * @returns {Array<{x: number, y: number}>} Array of normalized calibration points
   */
  generateCalibrationPoints(numPoints) {
    const points = [];

    if (numPoints === 5) {
      // 5-point: corners + center
      points.push(
        { x: CALIBRATION_MARGIN, y: CALIBRATION_MARGIN }, // Top-left
        { x: 1 - CALIBRATION_MARGIN, y: CALIBRATION_MARGIN }, // Top-right
        { x: CENTER_POSITION, y: CENTER_POSITION }, // Center
        { x: CALIBRATION_MARGIN, y: 1 - CALIBRATION_MARGIN }, // Bottom-left
        { x: 1 - CALIBRATION_MARGIN, y: 1 - CALIBRATION_MARGIN } // Bottom-right
      );
    } else if (numPoints === 9) {
      // 9-point: corners, edges, center
      points.push(
        { x: CALIBRATION_MARGIN, y: CALIBRATION_MARGIN }, // Top-left
        { x: CENTER_POSITION, y: CALIBRATION_MARGIN }, // Top-center
        { x: 1 - CALIBRATION_MARGIN, y: CALIBRATION_MARGIN }, // Top-right
        { x: CALIBRATION_MARGIN, y: CENTER_POSITION }, // Middle-left
        { x: CENTER_POSITION, y: CENTER_POSITION }, // Center
        { x: 1 - CALIBRATION_MARGIN, y: CENTER_POSITION }, // Middle-right
        { x: CALIBRATION_MARGIN, y: 1 - CALIBRATION_MARGIN }, // Bottom-left
        { x: CENTER_POSITION, y: 1 - CALIBRATION_MARGIN }, // Bottom-center
        { x: 1 - CALIBRATION_MARGIN, y: 1 - CALIBRATION_MARGIN } // Bottom-right
      );
    }

    return points;
  }

  /**
   * Create the calibration overlay UI
   */
  createOverlay() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'gaze-calibration-overlay';
    this.overlay.innerHTML = `
      <div class="calibration-content">
        <div class="calibration-header">
          <h2>Calibration</h2>
          <p>Look directly at each target until the circle fills</p>
          <p style="font-size: 13px; color: rgba(255, 255, 255, 0.4); margin-top: 8px;">The target will grow when you look at it</p>
          <div class="calibration-progress">
            <span class="progress-text">Point <span id="current-point">1</span> of <span id="total-points">${this.calibrationPoints.length}</span></span>
            <div class="progress-bar">
              <div class="progress-fill" id="progress-fill"></div>
            </div>
          </div>
        </div>
        <div class="calibration-target" id="calibration-target">
          <div class="target-crosshair-h"></div>
          <div class="target-crosshair-v"></div>
          <div class="target-center"></div>
          <svg class="target-progress" width="${TARGET_SIZE}" height="${TARGET_SIZE}">
            <circle class="progress-ring" cx="${TARGET_SIZE / 2}" cy="${TARGET_SIZE / 2}" r="${PROGRESS_RING_RADIUS}" />
          </svg>
        </div>
      </div>
    `;

    document.body.appendChild(this.overlay);
  }

  /**
   * Run the calibration sequence for all points
   */
  async runCalibrationSequence() {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    for (let i = 0; i < this.calibrationPoints.length; i++) {
      this.currentPointIndex = i;

      const point = this.calibrationPoints[i];
      const x = point.x * viewportWidth;
      const y = point.y * viewportHeight;

      // Update UI
      this.updateProgress();
      this.showTarget(x, y);

      // Wait a moment for user to look at target
      await this.delay(TARGET_APPEAR_DELAY);

      // Collect calibration data
      await this.collectCalibrationData(x, y);

      // Brief pause between points
      await this.delay(BETWEEN_POINTS_DELAY);
    }

    // Calibration complete
    await this.completeCalibration();
  }

  /**
   * Collect calibration data for a single point
   * @param {number} x - X coordinate in pixels
   * @param {number} y - Y coordinate in pixels
   * @returns {Promise<void>}
   */
  async collectCalibrationData(x, y) {
    const target = document.getElementById('calibration-target');

    return new Promise((resolve) => {
      const startTime = Date.now();
      let accumulatedGazeTime = 0;
      let lastUpdateTime = startTime;
      let sampleInterval = null;

      const cleanup = () => {
        if (sampleInterval) {
          clearInterval(sampleInterval);
          sampleInterval = null;
        }
      };

      const animate = () => {
        const now = Date.now();
        const totalElapsed = now - startTime;
        const frameDelta = now - lastUpdateTime;
        lastUpdateTime = now;

        // Get current gaze prediction
        const gazePrediction = window.gazeEstimator.getLastPrediction();

        // Check if user is looking at the target
        let isLookingAtTarget = false;
        if (gazePrediction && gazePrediction.confidence > MIN_CONFIDENCE_FOR_CALIBRATION) {
          const dx = gazePrediction.x - x;
          const dy = gazePrediction.y - y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          isLookingAtTarget = distance < GAZE_RADIUS;
        }

        // Only accumulate time if looking at target
        if (isLookingAtTarget) {
          accumulatedGazeTime += frameDelta;
        }

        // Calculate progress based on accumulated gaze time
        const progress = Math.min(accumulatedGazeTime / REQUIRED_GAZE_DURATION, 1);

        // Update progress ring
        const circle = target.querySelector('.progress-ring');
        const circumference = 2 * Math.PI * PROGRESS_RING_RADIUS;
        const offset = circumference * (1 - progress);
        circle.style.strokeDashoffset = offset;

        // Add visual feedback when looking at target
        if (isLookingAtTarget) {
          target.style.transform = `translate(-50%, -50%) scale(${TARGET_SCALE_FOCUSED})`;
        } else {
          target.style.transform = `translate(-50%, -50%) scale(${TARGET_SCALE_NORMAL})`;
        }

        // Check if complete or timed out
        if (progress >= 1) {
          target.style.transform = `translate(-50%, -50%) scale(${TARGET_SCALE_NORMAL})`;
          cleanup();
          resolve();
        } else if (totalElapsed > MAX_CALIBRATION_DURATION) {
          // Timeout - still resolve but with less data
          console.warn(LOG_PREFIX, 'Calibration', 'Target timeout - user may not have looked at target');
          target.style.transform = `translate(-50%, -50%) scale(${TARGET_SCALE_NORMAL})`;
          cleanup();
          resolve();
        } else {
          requestAnimationFrame(animate);
        }
      };

      // Start recording calibration samples in WebGazer
      // We'll collect samples throughout, but only count progress when user looks at target
      sampleInterval = setInterval(() => {
        const gazePrediction = window.gazeEstimator.getLastPrediction();
        if (gazePrediction && gazePrediction.confidence > MIN_CONFIDENCE_FOR_CALIBRATION) {
          const dx = gazePrediction.x - x;
          const dy = gazePrediction.y - y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          // Only record when user is actually looking at target
          if (distance < GAZE_RADIUS) {
            webgazer.recordScreenPosition(x, y, 'click');
          }
        }
      }, CALIBRATION_SAMPLE_INTERVAL);

      animate();
    });
  }

  /**
   * Show the calibration target at a specific position
   * @param {number} x - X coordinate in pixels
   * @param {number} y - Y coordinate in pixels
   */
  showTarget(x, y) {
    const target = document.getElementById('calibration-target');
    target.style.left = `${x}px`;
    target.style.top = `${y}px`;
    target.style.opacity = '1';

    // Reset progress ring
    const circle = target.querySelector('.progress-ring');
    const circumference = 2 * Math.PI * PROGRESS_RING_RADIUS;
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    circle.style.strokeDashoffset = circumference;
  }

  /**
   * Update the progress UI
   */
  updateProgress() {
    const currentEl = document.getElementById('current-point');
    const progressFill = document.getElementById('progress-fill');

    if (currentEl) {
      currentEl.textContent = this.currentPointIndex + 1;
    }

    if (progressFill) {
      const progress = ((this.currentPointIndex + 1) / this.calibrationPoints.length) * 100;
      progressFill.style.width = `${progress}%`;
    }
  }

  /**
   * Complete the calibration process
   */
  async completeCalibration() {
    // Save calibration data
    await window.gazeEstimator.saveCalibration();

    // Show success message
    const content = this.overlay.querySelector('.calibration-content');
    content.innerHTML = `
      <div class="calibration-complete">
        <h2>Calibration Complete</h2>
        <p>Look toward the top or bottom of the page to scroll</p>
      </div>
    `;

    await this.delay(COMPLETION_MESSAGE_DELAY);

    // Remove overlay
    this.removeOverlay();

    // Notify completion
    this.isCalibrating = false;

    if (this.onCompleteCallback) {
      this.onCompleteCallback();
    }

    // Notify background script
    chrome.runtime.sendMessage({ action: 'calibrationComplete' });
  }

  /**
   * Remove the calibration overlay
   */
  removeOverlay() {
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
      this.overlay = null;
    }
  }

  /**
   * Cancel the calibration process
   */
  cancel() {
    this.isCalibrating = false;
    this.removeOverlay();
    window.gazeEstimator.stop();
  }

  /**
   * Register a callback to be called when calibration completes
   * @param {Function} callback - Callback function
   */
  onComplete(callback) {
    this.onCompleteCallback = callback;
  }

  /**
   * Delay helper function
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise<void>}
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Create singleton instance
window.calibrationManager = new CalibrationManager();
