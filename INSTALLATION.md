# Installation Guide

## Quick Start

### Prerequisites
- Google Chrome browser (latest stable version)
- Webcam (built-in or USB)
- Node.js (only if rebuilding icons)

### Step-by-Step Installation

1. **Download the Extension**
   ```bash
   git clone https://github.com/yourusername/gaze.git
   cd gaze
   ```

2. **Open Chrome Extensions Page**
   - Open Chrome
   - Navigate to `chrome://extensions/`
   - Or click Menu (⋮) → More Tools → Extensions

3. **Enable Developer Mode**
   - Toggle "Developer mode" switch in the top-right corner

4. **Load the Extension**
   - Click "Load unpacked" button
   - Navigate to and select the `gaze` folder
   - The Gaze icon should appear in your toolbar

5. **Grant Permissions**
   - When first using Gaze, Chrome will ask for camera permission
   - Click "Allow" to enable eye tracking

## First Use

1. **Open a Web Page**
   - Navigate to any article or long-form content
   - Examples: Medium articles, blog posts, documentation

2. **Start Gaze**
   - Click the Gaze extension icon in the toolbar
   - Or use the popup to click "Start"

3. **Complete Calibration**
   - Look at each of the 9 calibration points as they appear
   - Keep your gaze steady for ~0.7 seconds on each point
   - Try to keep your head still during calibration

4. **Start Reading**
   - After calibration, the page will auto-scroll
   - Look near the bottom to scroll down
   - Look near the top to scroll up
   - Look in the middle to stop

## Troubleshooting

### Camera Permission Issues

If Chrome doesn't ask for camera permission:
1. Click the camera icon in the address bar
2. Select "Always allow" for camera access
3. Reload the page

### Extension Not Loading

If the extension fails to load:
1. Check that all files are present in the `gaze` folder
2. Verify that `manifest.json` exists
3. Check the Chrome Extensions page for error messages
4. Try clicking "Reload" on the extension

### WebGazer.js Not Found

If you see errors about missing WebGazer.js:
1. Check that `lib/webgazer.js` exists
2. Download from https://webgazer.cs.brown.edu/webgazer.js
3. Place in the `lib/` folder

## Updating the Extension

To update Gaze:
1. Pull the latest changes: `git pull origin main`
2. Go to `chrome://extensions/`
3. Find Gaze and click the refresh icon
4. Or remove and re-load the extension

## Uninstallation

To remove Gaze:
1. Go to `chrome://extensions/`
2. Find the Gaze extension
3. Click "Remove"
4. Confirm removal

Your calibration data and settings will be removed automatically.

## Building from Source

If you need to rebuild icons:

```bash
# Install dependencies
npm install

# Generate icons
node create_icons.js
node convert_icons.js
```

## System Requirements

- **Browser**: Chrome 88 or later
- **OS**: Windows 10+, macOS 10.14+, or Linux
- **Camera**: 720p or better recommended
- **RAM**: 4GB minimum, 8GB recommended
- **CPU**: Modern dual-core processor or better

## Known Issues

- May not work well in low-light conditions
- Performance may vary based on camera quality
- Some complex web apps may not scroll properly
- Calibration may need to be redone after changing lighting conditions

## Getting Help

- Check the [README.md](README.md) for detailed documentation
- Report issues on GitHub
- See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for common problems

---

**Need more help?** Open an issue on GitHub with:
- Your Chrome version
- Operating system
- Description of the problem
- Browser console errors (if any)
