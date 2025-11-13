/**
 * Fixation Detector Module
 * Detects stable gaze fixations using dispersion-based algorithm
 */

// Constants
const DEFAULT_WINDOW_SIZE = 250; // ms - time window for fixation detection
const DEFAULT_DISPERSION_THRESHOLD = 50; // px - maximum dispersion for fixation
const DEFAULT_CONFIDENCE_THRESHOLD = 0.6; // minimum confidence for valid fixation
const MIN_SAMPLES_FOR_FIXATION = 3; // minimum number of samples required

/**
 * Detects when user is fixating on a specific point
 * Uses dispersion-based algorithm to identify stable gaze
 */
class FixationDetector {
  /**
   * @param {Object} options - Configuration options
   * @param {number} options.windowSize - Time window in ms for fixation detection
   * @param {number} options.dispersionThreshold - Maximum dispersion in pixels
   * @param {number} options.confidenceThreshold - Minimum confidence threshold
   */
  constructor(options = {}) {
    this.windowSize = options.windowSize || DEFAULT_WINDOW_SIZE;
    this.dispersionThreshold = options.dispersionThreshold || DEFAULT_DISPERSION_THRESHOLD;
    this.confidenceThreshold = options.confidenceThreshold || DEFAULT_CONFIDENCE_THRESHOLD;

    this.gazeBuffer = [];
    this.currentFixation = null;
    this.isFixating = false;
  }

  /**
   * Update fixation detector with new gaze prediction
   * @param {Object} gazePrediction - Gaze prediction data
   * @param {number} gazePrediction.x - X coordinate
   * @param {number} gazePrediction.y - Y coordinate
   * @param {number} gazePrediction.confidence - Confidence score
   * @returns {Object} Fixation result
   */
  update(gazePrediction) {
    const now = Date.now();

    // Add to buffer
    this.gazeBuffer.push({
      ...gazePrediction,
      timestamp: now
    });

    // Remove old samples outside the window
    this.gazeBuffer = this.gazeBuffer.filter(
      sample => now - sample.timestamp <= this.windowSize
    );

    // Check if we have enough samples and confidence
    if (this.gazeBuffer.length < MIN_SAMPLES_FOR_FIXATION) {
      this.isFixating = false;
      this.currentFixation = null;
      return { isFixating: false };
    }

    // Calculate average confidence
    const avgConfidence = this.gazeBuffer.reduce((sum, s) => sum + s.confidence, 0) / this.gazeBuffer.length;

    if (avgConfidence < this.confidenceThreshold) {
      this.isFixating = false;
      this.currentFixation = null;
      return { isFixating: false, reason: 'low_confidence', confidence: avgConfidence };
    }

    // Calculate dispersion (standard deviation)
    const { dispersionX, dispersionY, centroidX, centroidY } = this.calculateDispersion();

    // Check if dispersion is below threshold
    if (dispersionX < this.dispersionThreshold && dispersionY < this.dispersionThreshold) {
      this.isFixating = true;
      this.currentFixation = {
        x: centroidX,
        y: centroidY,
        normalizedX: centroidX / window.innerWidth,
        normalizedY: centroidY / window.innerHeight,
        confidence: avgConfidence,
        duration: now - this.gazeBuffer[0].timestamp
      };

      return {
        isFixating: true,
        fixation: this.currentFixation,
        dispersion: { x: dispersionX, y: dispersionY }
      };
    } else {
      this.isFixating = false;
      this.currentFixation = null;
      return {
        isFixating: false,
        reason: 'high_dispersion',
        dispersion: { x: dispersionX, y: dispersionY }
      };
    }
  }

  /**
   * Calculate dispersion and centroid of gaze buffer
   * @returns {Object} Dispersion and centroid data
   */
  calculateDispersion() {
    const n = this.gazeBuffer.length;

    // Calculate centroid
    const centroidX = this.gazeBuffer.reduce((sum, s) => sum + s.x, 0) / n;
    const centroidY = this.gazeBuffer.reduce((sum, s) => sum + s.y, 0) / n;

    // Calculate standard deviation
    const varianceX = this.gazeBuffer.reduce((sum, s) => sum + Math.pow(s.x - centroidX, 2), 0) / n;
    const varianceY = this.gazeBuffer.reduce((sum, s) => sum + Math.pow(s.y - centroidY, 2), 0) / n;

    const dispersionX = Math.sqrt(varianceX);
    const dispersionY = Math.sqrt(varianceY);

    return { dispersionX, dispersionY, centroidX, centroidY };
  }

  /**
   * Reset the fixation detector
   */
  reset() {
    this.gazeBuffer = [];
    this.currentFixation = null;
    this.isFixating = false;
  }

  /**
   * Get current fixation data
   * @returns {Object|null} Current fixation or null
   */
  getFixation() {
    return this.currentFixation;
  }

  /**
   * Check if currently fixating
   * @returns {boolean} True if fixating
   */
  isCurrentlyFixating() {
    return this.isFixating;
  }

  /**
   * Update settings
   * @param {Object} settings - New settings
   */
  updateSettings(settings) {
    if (settings.fixationWindow !== undefined) {
      this.windowSize = settings.fixationWindow;
    }
    if (settings.confidenceThreshold !== undefined) {
      this.confidenceThreshold = settings.confidenceThreshold;
    }
  }
}

// Create singleton instance
window.fixationDetector = new FixationDetector();
