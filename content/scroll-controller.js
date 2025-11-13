/**
 * Scroll Controller Module
 * Manages auto-scrolling based on gaze zones with velocity smoothing
 */

// Default settings constants
const DEFAULT_MAX_SCROLL_SPEED = 800; // px/s - maximum downward scroll speed
const DEFAULT_MAX_UPWARD_SPEED = 400; // px/s - maximum upward scroll speed
const DEFAULT_SENSITIVITY = 50; // 0-100 - overall sensitivity
const DEFAULT_UPPER_ZONE_THRESHOLD = 0.30; // normalized Y position for upper zone
const DEFAULT_LOWER_ZONE_THRESHOLD = 0.70; // normalized Y position for lower zone
const DEFAULT_CONFIDENCE_THRESHOLD = 0.6; // minimum confidence for scrolling

// Scroll control constants
const VELOCITY_SMOOTHING_FACTOR = 0.15; // EMA smoothing factor (0-1)
const MIN_SCROLL_DELTA = 0.1; // px - minimum scroll delta to apply
const MS_TO_SECONDS = 1000; // milliseconds to seconds conversion
const DEFAULT_HOLD_DURATION = 2000; // ms - default hold duration after user interaction

// Velocity calculation constants
const UPWARD_POWER_CURVE = 0.6; // power curve exponent for upward scrolling
const DOWNWARD_POWER_CURVE = 0.8; // power curve exponent for downward scrolling
const UPWARD_MULTIPLIER = 1.5; // multiplier for upward scrolling (compensation)
const SENSITIVITY_BASELINE = 50; // baseline sensitivity value for normalization

// Scrollable element detection constants
const MIN_ELEMENT_HEIGHT_RATIO = 0.3; // minimum height ratio of viewport for scrollable elements

/**
 * Controls auto-scrolling based on gaze position with velocity smoothing
 */
class ScrollController {
  /**
   * @param {Object} options - Configuration options
   */
  constructor(options = {}) {
    this.settings = {
      maxScrollSpeed: options.maxScrollSpeed || DEFAULT_MAX_SCROLL_SPEED,
      maxUpwardSpeed: options.maxUpwardSpeed || DEFAULT_MAX_UPWARD_SPEED,
      sensitivity: options.sensitivity || DEFAULT_SENSITIVITY,
      upperZoneThreshold: options.upperZoneThreshold || DEFAULT_UPPER_ZONE_THRESHOLD,
      lowerZoneThreshold: options.lowerZoneThreshold || DEFAULT_LOWER_ZONE_THRESHOLD,
      confidenceThreshold: options.confidenceThreshold || DEFAULT_CONFIDENCE_THRESHOLD
    };

    this.currentVelocity = 0;
    this.targetVelocity = 0;
    this.smoothingFactor = VELOCITY_SMOOTHING_FACTOR;
    this.isActive = false;
    this.isPaused = false;
    this.lastFrameTime = null;
    this.animationFrame = null;

    this.scrollTarget = null;
    this.holdUntil = 0; // Timestamp for hold period after user interaction

    this.stats = {
      frameRate: 0,
      lastVelocity: 0,
      lastConfidence: 0,
      isFixating: false
    };
  }

  /**
   * Start the scroll controller
   */
  start() {
    if (this.isActive) return;

    this.isActive = true;
    this.isPaused = false;
    this.lastFrameTime = performance.now();
    this.updateScrollTarget();

    this.runScrollLoop();
  }

  /**
   * Stop the scroll controller and reset velocities
   */
  stop() {
    this.isActive = false;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    this.currentVelocity = 0;
    this.targetVelocity = 0;
  }

  /**
   * Pause scrolling
   */
  pause() {
    this.isPaused = true;
    this.targetVelocity = 0;
  }

  /**
   * Resume scrolling
   */
  resume() {
    this.isPaused = false;
    this.holdUntil = 0;
  }

  /**
   * Main scroll loop - runs on requestAnimationFrame
   */
  runScrollLoop() {
    if (!this.isActive) return;

    const now = performance.now();
    const deltaTime = (now - this.lastFrameTime) / MS_TO_SECONDS; // Convert to seconds
    this.lastFrameTime = now;

    // Update frame rate stats
    this.stats.frameRate = 1 / deltaTime;

    // Apply velocity smoothing (Exponential Moving Average)
    this.currentVelocity = this.currentVelocity * (1 - this.smoothingFactor) +
                          this.targetVelocity * this.smoothingFactor;

    // Apply scroll if not in hold period
    if (now > this.holdUntil && !this.isPaused) {
      const scrollDelta = this.currentVelocity * deltaTime;

      if (Math.abs(scrollDelta) > MIN_SCROLL_DELTA) {
        this.applyScroll(scrollDelta);
      }
    }

    this.stats.lastVelocity = this.currentVelocity;

    // Continue loop
    this.animationFrame = requestAnimationFrame(() => this.runScrollLoop());
  }

  /**
   * Update scroll velocity based on gaze fixation
   * @param {Object} fixationResult - Result from fixation detector
   * @param {boolean} fixationResult.isFixating - Whether user is fixating
   * @param {Object} fixationResult.fixation - Fixation data
   */
  updateFromGaze(fixationResult) {
    if (this.isPaused || !this.isActive) {
      this.targetVelocity = 0;
      return;
    }

    // Check if we're in hold period
    if (performance.now() < this.holdUntil) {
      this.targetVelocity = 0;
      return;
    }

    // Update stats
    this.stats.isFixating = fixationResult.isFixating;

    if (!fixationResult.isFixating) {
      this.targetVelocity = 0;
      return;
    }

    const fixation = fixationResult.fixation;
    this.stats.lastConfidence = fixation.confidence;

    // Check confidence threshold
    if (fixation.confidence < this.settings.confidenceThreshold) {
      this.targetVelocity = 0;
      return;
    }

    // Calculate velocity based on zone
    const gazeY = fixation.normalizedY;
    const velocity = this.calculateVelocity(gazeY);

    this.targetVelocity = velocity;
  }

  /**
   * Calculate scroll velocity based on normalized Y position
   * Uses zone-based approach with power curves for natural feel
   * @param {number} normalizedY - Normalized Y position (0-1)
   * @returns {number} Scroll velocity in px/s (negative = up, positive = down)
   */
  calculateVelocity(normalizedY) {
    const { upperZoneThreshold, lowerZoneThreshold, maxScrollSpeed, maxUpwardSpeed, sensitivity } = this.settings;

    if (normalizedY < upperZoneThreshold) {
      // Upper zone - scroll up
      // Distance within upper zone (how far into the zone we are)
      const zoneDistance = (upperZoneThreshold - normalizedY) / upperZoneThreshold;

      // Use a gentler power curve for upward scrolling
      // This makes upward scrolling more responsive and easier to trigger
      const powerCurve = Math.pow(zoneDistance, UPWARD_POWER_CURVE);

      // Apply an additional multiplier for upward scrolling
      // This compensates for the natural difficulty in upward gaze detection
      const rawVelocity = -powerCurve * maxUpwardSpeed * UPWARD_MULTIPLIER;

      return rawVelocity * (sensitivity / SENSITIVITY_BASELINE);
    } else if (normalizedY > lowerZoneThreshold) {
      // Lower zone - scroll down
      // Distance within lower zone (how far into the zone we are)
      const zoneDistance = (normalizedY - lowerZoneThreshold) / (1 - lowerZoneThreshold);

      // Use a power curve for more natural feeling
      // Closer to bottom = faster scrolling
      const powerCurve = Math.pow(zoneDistance, DOWNWARD_POWER_CURVE);
      const rawVelocity = powerCurve * maxScrollSpeed;

      return rawVelocity * (sensitivity / SENSITIVITY_BASELINE);
    } else {
      // Middle zone - idle (no scrolling)
      return 0;
    }
  }

  /**
   * Apply scroll delta to the scroll target
   * @param {number} delta - Scroll delta in pixels
   */
  applyScroll(delta) {
    if (!this.scrollTarget) {
      this.updateScrollTarget();
    }

    if (this.scrollTarget === window) {
      // Scroll window
      const currentScroll = window.scrollY;
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;

      const newScroll = Math.max(0, Math.min(maxScroll, currentScroll + delta));
      window.scrollTo(0, newScroll);
    } else if (this.scrollTarget) {
      // Scroll element
      const currentScroll = this.scrollTarget.scrollTop;
      const maxScroll = this.scrollTarget.scrollHeight - this.scrollTarget.clientHeight;

      const newScroll = Math.max(0, Math.min(maxScroll, currentScroll + delta));
      this.scrollTarget.scrollTop = newScroll;
    }
  }

  /**
   * Update the scroll target to the best scrollable element
   * Priority: largest visible scrollable element, else window
   */
  updateScrollTarget() {
    const scrollableElements = this.findScrollableElements();

    if (scrollableElements.length > 0) {
      // Pick the largest visible scrollable element
      this.scrollTarget = scrollableElements[0];
    } else {
      this.scrollTarget = window;
    }
  }

  /**
   * Find all scrollable elements in the page
   * @returns {Array<HTMLElement>} Array of scrollable elements, sorted by area (largest first)
   */
  findScrollableElements() {
    const elements = [];
    const viewportHeight = window.innerHeight;

    // Find all scrollable elements
    const allElements = document.querySelectorAll('*');

    allElements.forEach(el => {
      const style = window.getComputedStyle(el);
      const overflowY = style.overflowY;

      if (overflowY === 'auto' || overflowY === 'scroll') {
        const rect = el.getBoundingClientRect();

        // Check if element is visible and large enough
        if (rect.height > viewportHeight * MIN_ELEMENT_HEIGHT_RATIO &&
            rect.top < viewportHeight &&
            rect.bottom > 0 &&
            el.scrollHeight > el.clientHeight) {
          elements.push({
            element: el,
            area: rect.width * rect.height
          });
        }
      }
    });

    // Sort by area (largest first)
    elements.sort((a, b) => b.area - a.area);

    return elements.map(e => e.element);
  }

  /**
   * Trigger a hold period (pause scrolling temporarily)
   * @param {number} duration - Hold duration in milliseconds
   */
  triggerHold(duration = DEFAULT_HOLD_DURATION) {
    this.holdUntil = performance.now() + duration;
    this.targetVelocity = 0;
  }

  /**
   * Update settings
   * @param {Object} newSettings - New settings to merge
   */
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
  }

  /**
   * Get current statistics
   * @returns {Object} Copy of current stats
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Check if the current scroll target is scrollable
   * @returns {boolean} True if scrollable
   */
  isScrollable() {
    if (!this.scrollTarget) {
      this.updateScrollTarget();
    }

    if (this.scrollTarget === window) {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      return maxScroll > 0;
    } else if (this.scrollTarget) {
      const maxScroll = this.scrollTarget.scrollHeight - this.scrollTarget.clientHeight;
      return maxScroll > 0;
    }

    return false;
  }
}

// Create singleton instance
window.scrollController = new ScrollController();
