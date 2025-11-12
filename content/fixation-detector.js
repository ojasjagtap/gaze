// Fixation Detector Module
// Detects stable gaze fixations using dispersion-based algorithm

class FixationDetector {
  constructor(options = {}) {
    this.windowSize = options.windowSize || 250; // ms
    this.dispersionThreshold = options.dispersionThreshold || 50; // pixels
    this.confidenceThreshold = options.confidenceThreshold || 0.6;

    this.gazeBuffer = [];
    this.currentFixation = null;
    this.isFixating = false;
  }

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
    if (this.gazeBuffer.length < 3) {
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

  reset() {
    this.gazeBuffer = [];
    this.currentFixation = null;
    this.isFixating = false;
  }

  getFixation() {
    return this.currentFixation;
  }

  isCurrentlyFixating() {
    return this.isFixating;
  }

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
