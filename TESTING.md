# Testing Guide for Gaze Extension

## Setup

1. **Reload the Extension**
   - Go to `chrome://extensions/`
   - Find the Gaze extension
   - Click the refresh/reload icon
   - Or toggle Developer mode off and on

2. **Check for Errors**
   - Click "Errors" button on the extension card (if visible)
   - Open Chrome DevTools Console (F12) on any web page
   - Look for `[Gaze] Content script loaded` message

## Testing Steps

### 1. Test on a Simple Web Page

Open a test page with long content. You can use:
- https://en.wikipedia.org/wiki/Eye_tracking
- https://www.lipsum.com/ (generate long text)
- Any article on Medium or similar

### 2. Check Content Script is Loaded

1. Open the page
2. Press F12 to open DevTools
3. Go to Console tab
4. Look for: `[Gaze] Content script loaded`

If you don't see this message:
- The content script may not have loaded
- Try refreshing the page
- Check the extension is enabled

### 3. Test the Extension Popup

1. Click the Gaze extension icon in the toolbar
2. The popup should open with settings
3. Check that Status shows "Inactive"

### 4. Start Gaze

1. In the popup, click the "Start" button
2. Watch for:
   - Button should change to "Stop"
   - Status should change
   - Badge on toolbar icon should show "CAL" or "ON"

### 5. Complete Calibration

If calibration starts:
1. A dark overlay should appear
2. Look at each calibration point as it appears
3. Keep your gaze steady for ~0.7 seconds
4. Complete all 9 points

If calibration overlay doesn't appear:
- Check the browser console for errors
- Make sure camera permission is granted
- Try clicking the camera icon in the address bar

### 6. Test Scrolling

After calibration:
1. A floating control panel should appear (bottom-right)
2. Look near the **bottom** of the page → should scroll down
3. Look near the **top** of the page → should scroll up
4. Look in the **middle** → should stop

### 7. Test Controls

- Click **Pause** button → scrolling should stop
- Click **Resume** button → scrolling should continue
- Adjust **Speed** slider → scroll speed should change
- Adjust **Sensitivity** slider → responsiveness should change

## Common Issues and Solutions

### Issue: "Could not establish connection" Error

**Cause**: Content script not loaded on the page

**Solutions**:
1. Make sure you're on a regular web page (not chrome:// pages)
2. Refresh the page
3. Reload the extension
4. Check browser console for errors

### Issue: Nothing Happens When Clicking Start

**Possible Causes**:
- Content script not loaded
- WebGazer library not loading
- JavaScript error in content script

**Steps to Debug**:
1. Open DevTools Console (F12)
2. Click Start button
3. Look for error messages
4. Check Network tab for failed requests

### Issue: Calibration Overlay Doesn't Appear

**Possible Causes**:
- Camera permission not granted
- WebGazer initialization failed
- CSS not loading

**Solutions**:
1. Check camera permissions (click camera icon in address bar)
2. Look for errors in console
3. Try reloading the extension
4. Make sure webcam is working (test in another app)

### Issue: Page Doesn't Scroll

**Possible Causes**:
- Not looking at the right zones
- Sensitivity too low
- Confidence threshold too high
- Fixation not detected

**Solutions**:
1. Try looking more deliberately at top/bottom of page
2. Increase sensitivity in settings
3. Lower confidence threshold
4. Make sure you're keeping your gaze steady
5. Press Ctrl+Shift+G to see debug stats

## Debug Mode

Press `Ctrl+Shift+G` to toggle debug statistics panel showing:
- FPS (frame rate)
- Velocity (current scroll speed)
- Confidence (gaze quality)
- Fixation status

This helps diagnose issues with tracking.

## Manual Console Testing

You can test components manually in the browser console:

```javascript
// Check if content script loaded
console.log(window.gazeEstimator);
console.log(window.scrollController);

// Check WebGazer status
console.log(typeof webgazer);

// Test calibration manager
window.calibrationManager.start(5);

// Stop gaze
window.scrollController.stop();
window.gazeEstimator.stop();
```

## Checking Extension Logs

### Background Service Worker Logs
1. Go to `chrome://extensions/`
2. Find Gaze extension
3. Click "service worker" link
4. Check console for background script logs

### Content Script Logs
1. Open the web page
2. Press F12 for DevTools
3. Go to Console tab
4. Filter by "[Gaze]"

### Popup Logs
1. Right-click the extension icon
2. Select "Inspect popup"
3. Check console in the popup DevTools

## Expected Behavior

### Successful Flow:
1. Click Start → Badge shows "CAL"
2. Calibration overlay appears
3. Complete 9 points
4. Badge shows "ON"
5. Floating control appears
6. Page scrolls based on gaze

### Performance Metrics:
- Frame rate: 20-30 FPS
- Scroll should be smooth, not jerky
- Latency: < 100ms from gaze to scroll

## Reporting Issues

If you encounter issues, collect this information:

1. **Chrome Version**: chrome://version/
2. **Operating System**: Windows/Mac/Linux version
3. **Error Messages**: From console
4. **Steps to Reproduce**: What you did
5. **Expected vs Actual**: What should happen vs what happened

Copy console errors and include them in your report.
