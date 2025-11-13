// Scroll Controller Module
// Manages auto-scrolling based on gaze zones with velocity smoothing

class ScrollController {
  constructor(options = {}) {
    this.settings = {
      maxScrollSpeed: options.maxScrollSpeed || 800, // px/s
      maxUpwardSpeed: options.maxUpwardSpeed || 400, // px/s
      sensitivity: options.sensitivity || 50, // 0-100
      upperZoneThreshold: options.upperZoneThreshold || 0.30,
      lowerZoneThreshold: options.lowerZoneThreshold || 0.70,
      confidenceThreshold: options.confidenceThreshold || 0.6
    };

    this.currentVelocity = 0;
    this.targetVelocity = 0;
    this.smoothingFactor = 0.15; // EMA smoothing
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

  start() {
    if (this.isActive) return;

    this.isActive = true;
    this.isPaused = false;
    this.lastFrameTime = performance.now();
    this.updateScrollTarget();

    this.runScrollLoop();
  }

  stop() {
    this.isActive = false;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    this.currentVelocity = 0;
    this.targetVelocity = 0;
  }

  pause() {
    this.isPaused = true;
    this.targetVelocity = 0;
  }

  resume() {
    this.isPaused = false;
    this.holdUntil = 0;
  }

  runScrollLoop() {
    if (!this.isActive) return;

    const now = performance.now();
    const deltaTime = (now - this.lastFrameTime) / 1000; // Convert to seconds
    this.lastFrameTime = now;

    // Update frame rate stats
    this.stats.frameRate = 1 / deltaTime;

    // Apply velocity smoothing (EMA)
    this.currentVelocity = this.currentVelocity * (1 - this.smoothingFactor) +
                          this.targetVelocity * this.smoothingFactor;

    // Apply scroll if not in hold period
    if (now > this.holdUntil && !this.isPaused) {
      const scrollDelta = this.currentVelocity * deltaTime;

      if (Math.abs(scrollDelta) > 0.1) {
        this.applyScroll(scrollDelta);
      }
    }

    this.stats.lastVelocity = this.currentVelocity;

    // Continue loop
    this.animationFrame = requestAnimationFrame(() => this.runScrollLoop());
  }

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

  calculateVelocity(normalizedY) {
    const { upperZoneThreshold, lowerZoneThreshold, maxScrollSpeed, maxUpwardSpeed, sensitivity } = this.settings;

    // Check zones directly without sticky margin adjustment
    // This makes the zones more predictable and easier to calibrate
    if (normalizedY < upperZoneThreshold) {
      // Upper zone - scroll up
      // Distance from top of screen (0) to current position
      const distanceFromTop = normalizedY;
      // Distance within upper zone (how far into the zone we are)
      const zoneDistance = (upperZoneThreshold - normalizedY) / upperZoneThreshold;

      // Use a power curve for more natural feeling
      // Closer to top = faster scrolling
      const powerCurve = Math.pow(zoneDistance, 0.8);
      const rawVelocity = -powerCurve * maxUpwardSpeed;

      return rawVelocity * (sensitivity / 50); // Apply sensitivity
    } else if (normalizedY > lowerZoneThreshold) {
      // Lower zone - scroll down
      // Distance from current position to bottom (1)
      const distanceFromBottom = 1 - normalizedY;
      // Distance within lower zone (how far into the zone we are)
      const zoneDistance = (normalizedY - lowerZoneThreshold) / (1 - lowerZoneThreshold);

      // Use a power curve for more natural feeling
      // Closer to bottom = faster scrolling
      const powerCurve = Math.pow(zoneDistance, 0.8);
      const rawVelocity = powerCurve * maxScrollSpeed;

      return rawVelocity * (sensitivity / 50); // Apply sensitivity
    } else {
      // Middle zone - idle
      return 0;
    }
  }

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

  updateScrollTarget() {
    // Find the best scrollable target
    // Priority: largest visible scrollable element, else window

    const scrollableElements = this.findScrollableElements();

    if (scrollableElements.length > 0) {
      // Pick the largest visible scrollable element
      this.scrollTarget = scrollableElements[0];
    } else {
      this.scrollTarget = window;
    }
  }

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
        if (rect.height > viewportHeight * 0.3 &&
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

  triggerHold(duration = 2000) {
    this.holdUntil = performance.now() + duration;
    this.targetVelocity = 0;
  }

  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
  }

  getStats() {
    return { ...this.stats };
  }

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
