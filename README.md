# Gaze - Hands-Free Scrolling Chrome Extension

Gaze is a Chrome extension that enables hands-free scrolling based on eye tracking. Simply look at the bottom of the page to scroll down, or the top to scroll up.

## Features

- **Eye-Tracking Based Scrolling**: Auto-scroll based on where you're looking
- **Quick Calibration**: 9-point calibration process (takes ~10 seconds)
- **Customizable Settings**: Adjust scroll speed, sensitivity, and zone thresholds
- **Smooth Motion**: Velocity-based scrolling with anti-jerk smoothing
- **Fixation Detection**: Only scrolls when your gaze is stable
- **Floating Controls**: In-page control panel for pause/resume and adjustments
- **Automatic Hold**: Pauses scrolling when you type or interact with the page

## Usage

### Getting Started

1. **Click the Gaze icon** in your Chrome toolbar
2. **Complete calibration**: Look at each point as it appears and keep your gaze steady for ~0.7 seconds
3. **Start reading**: The page will automatically scroll based on where you look
   - Look near the **bottom** of the page → scrolls down
   - Look near the **top** of the page → scrolls up
   - Look in the **middle** → stops scrolling

### Controls

#### Popup Settings
Click the extension icon to open detailed settings:

- **Max Scroll Speed**: Maximum downward scroll speed
- **Max Upward Speed**: Maximum upward scroll speed
- **Sensitivity**: Overall sensitivity of scroll response
- **Upper Zone Threshold**: Y-position that triggers upward scroll (0-1)
- **Lower Zone Threshold**: Y-position that triggers downward scroll (0-1)
- **Confidence Threshold**: Minimum confidence required for scrolling
- **Recalibrate**: Run calibration again
- **Reset Calibration**: Clear calibration data
- **Reset Settings**: Restore default settings

### Keyboard Shortcuts

- `Ctrl+Shift+G`: Toggle debug stats panel (shows frame rate, velocity, confidence, fixation status)

### Tips for Best Results

1. **Lighting**: Ensure good lighting on your face (avoid backlighting)
2. **Distance**: Sit at a comfortable distance from the screen (arm's length)
3. **Camera**: Make sure your webcam has a clear view of your face
4. **Head Position**: Minimize head movement for best accuracy
5. **Recalibrate**: If scrolling feels inaccurate, recalibrate from the popup settings
6. **Sensitivity**: Start with default sensitivity (50) and adjust based on preference

## How It Works

Gaze uses the [WebGazer.js](https://webgazer.cs.brown.edu/) library for browser-based eye tracking:

1. **Gaze Estimation**: WebGazer uses your webcam and TensorFlow.js to estimate where you're looking
2. **Calibration**: Collects training data to map eye features to screen coordinates
3. **Fixation Detection**: Detects stable gaze points using dispersion-based algorithm
4. **Zone-Based Scrolling**: Divides viewport into three zones (upper, middle, lower)
5. **Velocity Control**: Calculates scroll velocity based on gaze position within zones
6. **Smoothing**: Applies exponential moving average to prevent jerky motion

### Architecture

```
background/
  service-worker.js       # State management and toolbar interactions

content/
  content.js              # Main orchestrator
  gaze-estimator.js       # WebGazer wrapper
  fixation-detector.js    # Fixation detection algorithm
  scroll-controller.js    # Zone-based scroll logic
  calibration.js          # Calibration UI and flow
  floating-control.js     # In-page control panel
  styles.css              # UI styling

popup/
  popup.html              # Settings popup
  popup.js                # Popup logic
  popup.css               # Popup styling

lib/
  webgazer.js             # WebGazer.js library

icons/
  icon16.png              # Extension icons
  icon32.png
  icon48.png
  icon128.png
```

## Default Settings

- **Max Scroll Speed**: 800 px/s
- **Max Upward Speed**: 400 px/s
- **Sensitivity**: 50 (0-100 scale)
- **Upper Zone Threshold**: 0.30 (top 30% of viewport)
- **Lower Zone Threshold**: 0.70 (bottom 30% of viewport)
- **Fixation Window**: 250 ms
- **Confidence Threshold**: 0.6 (0-1 scale)

## Compatibility

- **Browser**: Chrome (current stable version)
- **Operating Systems**: Windows, macOS, Linux
- **Camera**: Built-in or USB webcam required
- **Performance**: Works on mid-range laptops (targets ≥20 Hz estimation rate)

## Privacy

- **All processing happens locally** in your browser
- **No data is sent to external servers**
- Webcam access is only used for gaze estimation
- Calibration data is stored locally in Chrome's storage
- No tracking or analytics

## Troubleshooting

### Gaze tracking isn't accurate
- Recalibrate from the popup settings
- Ensure good lighting on your face
- Check that your webcam is working properly
- Minimize head movement while using

### Page isn't scrolling
- Check that the status indicator is green (active)
- Verify you're looking near the top or bottom of the viewport
- Adjust sensitivity in the settings
- Make sure the page is scrollable

### Low frame rate or laggy
- Close other browser tabs to free up resources
- Reduce max scroll speed in settings
- Disable "Show gaze dot" to reduce rendering overhead

### Webcam permission denied
- Click the camera icon in Chrome's address bar
- Allow camera access for the extension
- Reload the page and try again

## Limitations (MVP)

- No multi-tab coordination or sync
- No special handling for complex web apps (Google Docs, Figma, etc.)
- No per-site profiles (single global calibration)
- No accessibility or i18n support
- Basic scrollable container detection (works best with simple pages)

## Development

### File Structure

- `manifest.json` - Extension configuration
- `background/` - Background service worker
- `content/` - Content scripts and UI
- `popup/` - Extension popup
- `lib/` - Third-party libraries
- `icons/` - Extension icons

## Future Enhancements

- [ ] Per-site scroll profiles
- [ ] Horizontal scrolling support
- [ ] Customizable keyboard shortcuts
- [ ] Dark mode for UI
- [ ] Advanced fixation algorithms
- [ ] Better handling of dynamic content
- [ ] Accessibility improvements
- [ ] Multi-monitor support
- [ ] Analytics dashboard (local)

## Credits

- Built with [WebGazer.js](https://webgazer.cs.brown.edu/)
- Icons created with SVG and Sharp

## Version History

### v1.0.0 (Current)
- Initial release
- 9-point calibration
- Zone-based scrolling
- Floating control panel
- Settings popup
- Basic fixation detection
- User interaction hold
