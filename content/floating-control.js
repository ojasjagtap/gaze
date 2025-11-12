// Floating Control UI
// In-page control panel for Gaze reading mode

class FloatingControl {
  constructor() {
    this.control = null;
    this.isVisible = false;
    this.isPaused = false;
    this.settings = null;
    this.gazeDot = null;
  }

  async create() {
    if (this.control) return;

    // Load settings
    const result = await chrome.storage.local.get('settings');
    this.settings = result.settings || {};

    this.control = document.createElement('div');
    this.control.id = 'gaze-floating-control';
    this.control.innerHTML = `
      <div class="control-header">
        <div class="status-indicator" id="gaze-status">
          <div class="status-dot active" id="status-dot"></div>
          <span class="status-text" id="status-text">Active</span>
        </div>
        <button class="control-btn close-btn" id="gaze-close" title="Stop Gaze">×</button>
      </div>
      <div class="control-body">
        <button class="control-btn pause-btn" id="gaze-pause" title="Pause/Resume">
          <span class="pause-icon">⏸</span>
          <span class="resume-icon" style="display:none;">▶</span>
        </button>
        <div class="control-sliders">
          <div class="slider-group">
            <label>
              Speed
              <span class="slider-value" id="speed-value">${this.settings.maxScrollSpeed || 800}</span>
            </label>
            <input type="range" id="speed-slider" min="200" max="1600" value="${this.settings.maxScrollSpeed || 800}" step="50">
          </div>
          <div class="slider-group">
            <label>
              Sensitivity
              <span class="slider-value" id="sensitivity-value">${this.settings.sensitivity || 50}</span>
            </label>
            <input type="range" id="sensitivity-slider" min="10" max="100" value="${this.settings.sensitivity || 50}" step="5">
          </div>
        </div>
        <div class="control-footer">
          <label class="checkbox-label">
            <input type="checkbox" id="show-gaze-dot" ${this.settings.showGazeDot ? 'checked' : ''}>
            <span>Show gaze dot</span>
          </label>
        </div>
      </div>
      <div class="control-stats" id="gaze-stats" style="display:none;">
        <div class="stat-item">FPS: <span id="stat-fps">0</span></div>
        <div class="stat-item">Vel: <span id="stat-velocity">0</span></div>
        <div class="stat-item">Conf: <span id="stat-confidence">0</span></div>
        <div class="stat-item">Fix: <span id="stat-fixating">No</span></div>
      </div>
    `;

    document.body.appendChild(this.control);
    this.attachEventListeners();
    this.isVisible = true;

    // Create gaze dot if enabled
    if (this.settings.showGazeDot) {
      this.createGazeDot();
    }
  }

  attachEventListeners() {
    // Pause/Resume button
    const pauseBtn = document.getElementById('gaze-pause');
    pauseBtn.addEventListener('click', () => {
      this.togglePause();
    });

    // Close button
    const closeBtn = document.getElementById('gaze-close');
    closeBtn.addEventListener('click', () => {
      this.close();
    });

    // Speed slider
    const speedSlider = document.getElementById('speed-slider');
    const speedValue = document.getElementById('speed-value');
    speedSlider.addEventListener('input', (e) => {
      const value = parseInt(e.target.value);
      speedValue.textContent = value;
      this.updateSetting('maxScrollSpeed', value);
      window.scrollController.updateSettings({ maxScrollSpeed: value });
    });

    // Sensitivity slider
    const sensitivitySlider = document.getElementById('sensitivity-slider');
    const sensitivityValue = document.getElementById('sensitivity-value');
    sensitivitySlider.addEventListener('input', (e) => {
      const value = parseInt(e.target.value);
      sensitivityValue.textContent = value;
      this.updateSetting('sensitivity', value);
      window.scrollController.updateSettings({ sensitivity: value });
    });

    // Gaze dot checkbox
    const gazeDotCheckbox = document.getElementById('show-gaze-dot');
    gazeDotCheckbox.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      this.updateSetting('showGazeDot', enabled);

      if (enabled) {
        this.createGazeDot();
      } else {
        this.removeGazeDot();
      }
    });

    // Make control draggable (optional enhancement)
    this.makeDraggable();
  }

  togglePause() {
    this.isPaused = !this.isPaused;

    const pauseIcon = this.control.querySelector('.pause-icon');
    const resumeIcon = this.control.querySelector('.resume-icon');
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');

    if (this.isPaused) {
      pauseIcon.style.display = 'none';
      resumeIcon.style.display = 'inline';
      statusDot.className = 'status-dot paused';
      statusText.textContent = 'Paused';

      window.scrollController.pause();
      chrome.runtime.sendMessage({ action: 'pause' });
    } else {
      pauseIcon.style.display = 'inline';
      resumeIcon.style.display = 'none';
      statusDot.className = 'status-dot active';
      statusText.textContent = 'Active';

      window.scrollController.resume();
      chrome.runtime.sendMessage({ action: 'resume' });
    }
  }

  close() {
    // Stop everything
    window.scrollController.stop();
    window.gazeEstimator.stop();

    // Remove UI
    this.remove();

    // Notify background
    chrome.runtime.sendMessage({ action: 'stop' });
  }

  remove() {
    if (this.control && this.control.parentNode) {
      this.control.parentNode.removeChild(this.control);
      this.control = null;
    }

    this.removeGazeDot();
    this.isVisible = false;
  }

  updateStatus(status, confidence) {
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');

    if (!statusDot || !statusText) return;

    if (this.isPaused) {
      statusDot.className = 'status-dot paused';
      statusText.textContent = 'Paused';
    } else if (confidence < this.settings.confidenceThreshold) {
      statusDot.className = 'status-dot low-confidence';
      statusText.textContent = 'Low Confidence';
    } else {
      statusDot.className = 'status-dot active';
      statusText.textContent = 'Active';
    }
  }

  updateStats(stats) {
    const fpsEl = document.getElementById('stat-fps');
    const velocityEl = document.getElementById('stat-velocity');
    const confidenceEl = document.getElementById('stat-confidence');
    const fixatingEl = document.getElementById('stat-fixating');

    if (fpsEl) fpsEl.textContent = Math.round(stats.frameRate);
    if (velocityEl) velocityEl.textContent = Math.round(stats.lastVelocity);
    if (confidenceEl) confidenceEl.textContent = (stats.lastConfidence || 0).toFixed(2);
    if (fixatingEl) fixatingEl.textContent = stats.isFixating ? 'Yes' : 'No';
  }

  toggleStats() {
    const statsEl = document.getElementById('gaze-stats');
    if (statsEl) {
      statsEl.style.display = statsEl.style.display === 'none' ? 'block' : 'none';
    }
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
    }
  }

  async updateSetting(key, value) {
    const result = await chrome.storage.local.get('settings');
    const settings = result.settings || {};
    settings[key] = value;
    await chrome.storage.local.set({ settings });
    this.settings = settings;
  }

  makeDraggable() {
    const header = this.control.querySelector('.control-header');
    let isDragging = false;
    let startX, startY, startLeft, startTop;

    header.style.cursor = 'move';

    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = this.control.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;

      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      this.control.style.left = `${startLeft + dx}px`;
      this.control.style.top = `${startTop + dy}px`;
      this.control.style.right = 'auto';
      this.control.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
    });
  }
}

// Create singleton instance
window.floatingControl = new FloatingControl();
