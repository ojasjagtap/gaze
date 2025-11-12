// Calibration Module
// Handles the calibration flow with on-screen points

class CalibrationManager {
  constructor() {
    this.isCalibrating = false;
    this.currentPointIndex = 0;
    this.calibrationPoints = [];
    this.overlay = null;
    this.onCompleteCallback = null;
  }

  async start(numPoints = 9) {
    if (this.isCalibrating) return;

    this.isCalibrating = true;
    this.currentPointIndex = 0;

    // Generate calibration points (corners, edges, center)
    this.calibrationPoints = this.generateCalibrationPoints(numPoints);

    // Create overlay UI
    this.createOverlay();

    // Initialize gaze estimator
    await window.gazeEstimator.initialize();
    await window.gazeEstimator.start();

    // Start calibration sequence
    await this.runCalibrationSequence();
  }

  generateCalibrationPoints(numPoints) {
    const margin = 0.15; // 15% margin from edges
    const points = [];

    if (numPoints === 5) {
      // 5-point: corners + center
      points.push(
        { x: margin, y: margin }, // Top-left
        { x: 1 - margin, y: margin }, // Top-right
        { x: 0.5, y: 0.5 }, // Center
        { x: margin, y: 1 - margin }, // Bottom-left
        { x: 1 - margin, y: 1 - margin } // Bottom-right
      );
    } else if (numPoints === 9) {
      // 9-point: corners, edges, center
      points.push(
        { x: margin, y: margin }, // Top-left
        { x: 0.5, y: margin }, // Top-center
        { x: 1 - margin, y: margin }, // Top-right
        { x: margin, y: 0.5 }, // Middle-left
        { x: 0.5, y: 0.5 }, // Center
        { x: 1 - margin, y: 0.5 }, // Middle-right
        { x: margin, y: 1 - margin }, // Bottom-left
        { x: 0.5, y: 1 - margin }, // Bottom-center
        { x: 1 - margin, y: 1 - margin } // Bottom-right
      );
    }

    return points;
  }

  createOverlay() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'gaze-calibration-overlay';
    this.overlay.innerHTML = `
      <div class="calibration-content">
        <div class="calibration-header">
          <h2>Gaze Calibration</h2>
          <p>Look at each point as it appears and keep your gaze steady</p>
          <div class="calibration-progress">
            <span class="progress-text">Point <span id="current-point">1</span> of <span id="total-points">${this.calibrationPoints.length}</span></span>
            <div class="progress-bar">
              <div class="progress-fill" id="progress-fill"></div>
            </div>
          </div>
        </div>
        <div class="calibration-target" id="calibration-target">
          <div class="target-outer"></div>
          <div class="target-inner"></div>
          <svg class="target-progress" width="80" height="80">
            <circle class="progress-ring" cx="40" cy="40" r="35" />
          </svg>
        </div>
      </div>
    `;

    document.body.appendChild(this.overlay);
  }

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
      await this.delay(500);

      // Collect calibration data
      await this.collectCalibrationData(x, y);

      // Brief pause between points
      await this.delay(200);
    }

    // Calibration complete
    await this.completeCalibration();
  }

  async collectCalibrationData(x, y) {
    const duration = 700;
    const target = document.getElementById('calibration-target');

    return new Promise((resolve) => {
      const startTime = Date.now();

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Update progress ring
        const circle = target.querySelector('.progress-ring');
        const circumference = 2 * Math.PI * 35;
        const offset = circumference * (1 - progress);
        circle.style.strokeDashoffset = offset;

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };

      // Record calibration point in WebGazer
      window.gazeEstimator.addCalibrationPoint(x, y, duration);

      animate();
    });
  }

  showTarget(x, y) {
    const target = document.getElementById('calibration-target');
    target.style.left = `${x}px`;
    target.style.top = `${y}px`;
    target.style.opacity = '1';

    // Reset progress ring
    const circle = target.querySelector('.progress-ring');
    const circumference = 2 * Math.PI * 35;
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    circle.style.strokeDashoffset = circumference;
  }

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

  async completeCalibration() {
    // Save calibration data
    await window.gazeEstimator.saveCalibration();

    // Show success message
    const content = this.overlay.querySelector('.calibration-content');
    content.innerHTML = `
      <div class="calibration-complete">
        <div class="success-icon">✓</div>
        <h2>Calibration Complete!</h2>
        <p>Gaze tracking is now active. The page will scroll based on where you look.</p>
      </div>
    `;

    await this.delay(2000);

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

  removeOverlay() {
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
      this.overlay = null;
    }
  }

  cancel() {
    this.isCalibrating = false;
    this.removeOverlay();
    window.gazeEstimator.stop();
  }

  onComplete(callback) {
    this.onCompleteCallback = callback;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Create singleton instance
window.calibrationManager = new CalibrationManager();
