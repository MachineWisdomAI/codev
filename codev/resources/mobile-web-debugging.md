# Mobile Web Debugging: A Practical Guide

> Synthesized from Claude, Gemini, and Codex research (February 2026).
> Focus: debugging tools and techniques, not how to write mobile-friendly code.

---

## Table of Contents

1. [Chrome DevTools Remote Debugging (Android)](#1-chrome-devtools-remote-debugging-android)
2. [Safari Web Inspector (iOS)](#2-safari-web-inspector-ios)
3. [Chrome Device Emulator](#3-chrome-device-emulator)
4. [Cloud Device Services](#4-cloud-device-services)
5. [Debugging Touch Events and Virtual Keyboards](#5-debugging-touch-events-and-virtual-keyboards)
6. [Viewport Issues](#6-viewport-issues)
7. [Debugging WebSocket Connections on Mobile](#7-debugging-websocket-connections-on-mobile)
8. [console.log Alternatives for Mobile](#8-consolelog-alternatives-for-mobile)
9. [Network Throttling and Proxying](#9-network-throttling-and-proxying)
10. [Reproducing Intermittent Mobile-Only Bugs](#10-reproducing-intermittent-mobile-only-bugs)

---

## 1. Chrome DevTools Remote Debugging (Android)

Do not rely on Chrome's device emulator for complex logic, performance, or touch issues. Remote debugging against a real Android device is the gold standard.

### Prerequisites

1. **Enable Developer Options**: Settings > About Phone > tap "Build Number" 7 times.
2. **Enable USB Debugging**: Settings > Developer Options > USB Debugging ON.
3. **Install Chrome** on both desktop and the Android device.

### USB Debugging (Most Reliable)

```bash
# Verify device is connected and authorized
adb devices -l
```

If the device shows **"Offline"**, check for the USB debugging authorization popup on the phone. If nothing appears:

```bash
# Restart the ADB server to force a new handshake
adb kill-server
adb start-server
adb devices -l
```

Then in desktop Chrome:

1. Navigate to `chrome://inspect/#devices`.
2. Ensure **"Discover USB devices"** is checked.
3. Your device and its open Chrome tabs appear in the list.
4. Click **"Inspect"** next to the target page.

### Wi-Fi Debugging (Android 11+)

No cable needed, but both devices must be on the same network.

```bash
# On the phone: Settings > Developer Options > Wireless Debugging > Pair device with pairing code
# Note the IP, port, and 6-digit code shown on the phone

adb pair <IP>:<PAIRING_PORT>
# Enter the 6-digit pairing code when prompted

adb connect <IP>:<DEBUG_PORT>
adb devices -l
```

### Legacy Wi-Fi (Android 10 and below)

Requires an initial USB connection:

```bash
adb tcpip 5555
adb connect <DEVICE_IP>:5555
adb devices
# Now disconnect USB
```

### Direct CDP Port Forward

When `chrome://inspect` is flaky, bypass it and talk to the Chrome DevTools Protocol directly:

```bash
adb forward tcp:9222 localabstract:chrome_devtools_remote
# Then open in desktop browser:
#   http://localhost:9222/json         — list of inspectable targets
#   http://localhost:9222/json/version — browser version info
```

### Common Pitfalls

| Problem | Fix |
|---------|-----|
| Device not appearing | Use a data-capable USB cable (not charge-only); avoid USB hubs |
| Shows "Offline" | Accept the RSA key prompt on the phone; revoke and re-authorize if stale |
| Wi-Fi debugging drops | Corporate Wi-Fi may block mDNS; use `adb connect <IP>:<PORT>` manually |
| chrome://inspect blank | Uncheck and re-check "Discover USB devices"; reconnect cable |

---

## 2. Safari Web Inspector (iOS)

Safari Web Inspector is macOS-only. There is no Windows or Linux equivalent for native iOS debugging.

### macOS Setup

1. Open Safari > Settings > Advanced.
2. Check **"Show features for web developers"** (adds the Develop menu).

### Real Device

1. **On iPhone/iPad**: Settings > Safari > Advanced > toggle **Web Inspector** ON.
2. Connect via USB cable.
3. In Safari on Mac: **Develop** menu > [Your iPhone Name] > select the page to inspect.

Full DevTools capabilities are available: DOM inspection, CSS editing, JS breakpoints, Network tab, Console, Performance profiling.

### iOS Simulator

Web Inspector is enabled by default on simulators.

1. Launch the simulator (Xcode > Open Developer Tool > Simulator, or `open -a Simulator`).
2. Open a page in Safari within the simulator.
3. On Mac: Safari > Develop > [Simulator Name] > select the page.

### When Device Doesn't Appear

- Unplug and replug the USB cable.
- Restart Safari on the Mac.
- Re-check that Web Inspector is enabled on both the Mac and the iOS device.
- Ensure the device is trusted (Settings > General > Device Management on the phone).

### Simulator vs. Real Device

The iOS Simulator is better than Chrome's emulator (it runs actual WebKit), but it still cannot reproduce:

- Thermal throttling and CPU governor behavior.
- Jetsam events (iOS killing tabs for memory pressure).
- Real network interface switching (Wi-Fi to cellular).
- Actual touch pressure and gesture physics.

### Non-Mac Alternatives

If you don't have a Mac:
- **inspect.dev**: Third-party tool for debugging iOS Safari from Windows/Linux.
- **BrowserStack / cloud services**: See Section 4.

---

## 3. Chrome Device Emulator

### How to Use

- Toggle Device Toolbar: `Cmd+Shift+M` (Mac) or `Ctrl+Shift+M` (Win/Linux).
- Or click the device icon in the DevTools top toolbar.

Key features:
- **Device presets**: iPhone, iPad, Pixel, Galaxy, etc.
- **Custom dimensions**: Set arbitrary width/height and DPR.
- **Orientation**: Toggle portrait/landscape.
- **Media queries**: Enable "Show media queries" from the toolbar menu to visualize breakpoints.
- **Touch simulation**: Automatically enabled in device mode.
- **Sensors panel**: Command Menu (`Cmd+Shift+P`) > "Show Sensors" for geolocation and device orientation overrides.

### Limitations vs. Real Devices

The device emulator is a first-order approximation. It **cannot** simulate:

| Aspect | Why It Differs |
|--------|---------------|
| CPU architecture | Desktop x86/ARM vs mobile ARM, different perf characteristics |
| GPU rasterization | Desktop GPU behavior differs from mobile GPUs |
| Browser engine | "iPad" mode still uses Chrome/Blink, not Safari/WebKit |
| Browser chrome | Address bar collapse, pull-to-refresh, bottom nav bars |
| Touch fidelity | Pressure, multi-touch edge cases, gesture physics |
| Hardware sensors | Accelerometer, gyroscope (basic emulation via Sensors panel) |
| Memory constraints | Mobile devices have much less RAM; OOM behavior not reproduced |
| OS-level behavior | Battery saver, background tab throttling, permission dialogs |

**Rule of thumb**: Use the emulator for rapid layout iteration. Validate on real devices for anything involving performance, touch, keyboard behavior, or browser chrome interactions.

---

## 4. Cloud Device Services

Cloud device farms provide access to real devices when you don't own the specific hardware. Essential for debugging "it only happens on Samsung Galaxy S24 Ultra" reports.

### BrowserStack

```bash
# Download the Local binary for your OS, then:
./BrowserStackLocal --key $BROWSERSTACK_ACCESS_KEY --force-local

# --force-local routes ALL traffic (including DNS) through your machine
# Fixes issues with VPNs and private subnets

# Daemon mode (for CI):
./BrowserStackLocal --key $BROWSERSTACK_ACCESS_KEY --daemon start --local-identifier my-tunnel
./BrowserStackLocal --key $BROWSERSTACK_ACCESS_KEY --daemon stop --local-identifier my-tunnel
```

### LambdaTest (TestMu AI)

```bash
# Download LT binary for your OS, then:
LT --user <email> --key <access-key> --tunnelName mobile-debug-01

# Expose a local folder:
LT --user <email> --key <access-key> --dir "/path/to/local/folder"
```

### Sauce Labs (Sauce Connect 5)

```bash
export SAUCE_USERNAME=<username>
export SAUCE_ACCESS_KEY=<access_key>
sc run --tunnel-name mobile-debug-01 --region us-west
```

### Quick Comparison

| Feature | BrowserStack | LambdaTest | Sauce Labs |
|---------|-------------|------------|------------|
| Real devices | 3000+ | 3000+ | 2000+ |
| Starting price | $29/mo | $15/mo | $39/mo |
| Free tier | 100 min/mo | 100 min/mo | Trial only |
| Tunnel binary | `BrowserStackLocal` | `LT` | `sc` (v5) |
| Video recording | Yes | Yes | Yes |
| DevTools access | Yes | Yes | Yes |

**Recommendation**: Pick one primary provider per team. Use a secondary only when a bug is device/OS-specific and unavailable in your primary.

---

## 5. Debugging Touch Events and Virtual Keyboards

### Quick Touch Event Capture (Chrome DevTools Console)

```js
// Monitor touch events on the currently selected element ($0)
monitorEvents($0, "touch");
```

### Comprehensive Event Logging

```js
// Add to your page to log all touch and pointer events
["touchstart", "touchmove", "touchend", "touchcancel",
 "pointerdown", "pointermove", "pointerup", "pointercancel"]
  .forEach(type => {
    window.addEventListener(type, (e) => {
      console.log(type, {
        x: e.clientX ?? e.touches?.[0]?.clientX,
        y: e.clientY ?? e.touches?.[0]?.clientY,
        touches: e.touches?.length,
        target: e.target.tagName,
        timestamp: e.timeStamp
      });
    }, { passive: false });
  });
```

### Debugging Ghost Clicks (Android)

Enable **"Show taps"** in Android Developer Options. This renders a visual dot where the OS registers each touch, letting you compare OS-level tap location vs. where your click listener fires.

### Virtual Keyboard Debugging

The virtual keyboard is a major source of mobile bugs. Android and iOS handle it very differently.

#### VirtualKeyboard API (Chromium, Android)

```js
if ("virtualKeyboard" in navigator) {
  navigator.virtualKeyboard.overlaysContent = true;

  navigator.virtualKeyboard.addEventListener("geometrychange", (e) => {
    const { x, y, width, height } = e.target.boundingRect;
    console.log("Keyboard geometry:", { x, y, width, height });
    document.documentElement.style.setProperty("--kb-height", `${height}px`);
  });
}
```

In CSS, you can use `env(keyboard-inset-height)` for automatic padding when the keyboard is visible.

#### iOS vs. Android Differences

| Behavior | Android (Chrome) | iOS (Safari) |
|----------|-----------------|--------------|
| Keyboard opens | Fires `resize` event, shrinks viewport | Does NOT fire `resize`, does NOT shrink layout viewport |
| Viewport adjustment | Content pushed up, viewport height decreases | Keyboard overlays content |
| VirtualKeyboard API | Supported in Chromium | Not supported |
| Best detection method | `resize` event or VirtualKeyboard API | Visual Viewport API |

#### Visual Viewport API (Cross-Browser, Best for iOS)

```js
window.visualViewport.addEventListener("resize", () => {
  console.log("Visual viewport:", {
    width: window.visualViewport.width,
    height: window.visualViewport.height,
    offsetTop: window.visualViewport.offsetTop,
    scale: window.visualViewport.scale
  });
});
```

On iOS, when the keyboard opens, `visualViewport.height` shrinks while `window.innerHeight` stays the same. This is the most reliable cross-platform detection method.

---

## 6. Viewport Issues

### The Two Viewports

- **Layout viewport**: The area CSS uses for layout. Fixed during pinch-zoom. Used by media queries.
- **Visual viewport**: What's actually visible on screen. Changes during pinch-zoom and when the keyboard opens.

### The 100vh Problem

`100vh` equals the **largest possible viewport height** (browser UI fully hidden). On first page load, browser UI is visible, so content set to `100vh` gets clipped below the fold.

### Modern Viewport Units (2026)

| Unit | Meaning | Best For |
|------|---------|----------|
| `svh` | Small viewport height (browser UI visible) | Hero sections, initial load |
| `lvh` | Large viewport height (browser UI hidden) | Background effects |
| `dvh` | Dynamic viewport height (updates as UI shows/hides) | Adaptive full-screen layouts |

```css
/* Layered fallback pattern */
.full-height {
  min-height: 100vh;    /* fallback for older browsers */
  min-height: 100svh;   /* safe: visible area on load */
  min-height: 100dvh;   /* dynamic: best fit on supported browsers */
}
```

Browser support for `svh`/`lvh`/`dvh`: all major browsers as of 2023+.

### JavaScript Fallback (Legacy Browsers)

```js
function setViewportHeight() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty("--vh", `${vh}px`);
}
setViewportHeight();
window.addEventListener("resize", setViewportHeight);
```

```css
.full-height {
  height: calc(var(--vh, 1vh) * 100);
}
```

### Safe Area Insets (Notched Devices)

Required for iPhone X+ and devices with notches, rounded corners, or dynamic islands.

**Step 1**: Enable full-screen layout in the viewport meta tag:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
```

**Step 2**: Use `env()` CSS variables:

```css
.header {
  padding-top: env(safe-area-inset-top);
}
.footer {
  padding-bottom: env(safe-area-inset-bottom);
}
/* Combined with minimum padding */
.bottom-bar {
  padding-bottom: calc(16px + env(safe-area-inset-bottom));
}
```

`env()` returns `0px` on devices without notches. Without `viewport-fit=cover`, the values are always `0px`.

### Visual Viewport Debug Helper

```js
const vv = window.visualViewport;
if (vv) {
  const log = () => console.log({
    width: vv.width,
    height: vv.height,
    offsetTop: vv.offsetTop,
    offsetLeft: vv.offsetLeft,
    scale: vv.scale
  });
  vv.addEventListener("resize", log);
  vv.addEventListener("scroll", log);
}
```

---

## 7. Debugging WebSocket Connections on Mobile

### Chrome DevTools (via Remote Debugging)

1. Set up remote debugging (Section 1).
2. DevTools > **Network** tab > click the **WS** filter button.
3. Click the WebSocket connection.
4. Switch to the **Messages** tab to see individual frames.
   - Green arrows (up): sent frames.
   - Red arrows (down): received frames.

### Safari Web Inspector

Safari's Web Inspector also shows WebSocket connections in the Network tab. However, Safari is notorious for aggressively killing WebSocket connections to save battery when the app is backgrounded.

### Key Debugging Techniques

**Monitor readyState before sending:**

```js
function safeSend(ws, data) {
  console.log("readyState:", ws.readyState);
  // 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(data);
  } else {
    console.error("Cannot send, WebSocket not open");
  }
}
```

**Diagnose disconnections:**

```js
ws.onclose = (event) => {
  console.log("WebSocket closed:", {
    code: event.code,     // 1000=normal, 1001=going away, 1006=abnormal
    reason: event.reason,
    wasClean: event.wasClean
  });
};
```

**Monitor for backpressure:**

```js
const interval = setInterval(() => {
  console.log("Buffered bytes:", ws.bufferedAmount);
  if (ws.bufferedAmount > 1024 * 1024) {
    console.warn("Backpressure detected - 1MB+ buffered");
  }
}, 1000);
ws.onclose = () => clearInterval(interval);
```

**Collect Android system logs for WebSocket issues:**

```bash
adb logcat | grep -iE "websocket|okhttp|net|ssl|cronet"
```

### Common Mobile WebSocket Failure Modes

| Trigger | Symptom | Debug Approach |
|---------|---------|---------------|
| Screen lock / backgrounding | Close code 1006 (abnormal) | Check `visibilitychange` event handling |
| Network switch (Wi-Fi to cellular) | Connection drops silently | Monitor `navigator.connection` changes |
| iOS Safari battery optimization | Aggressive disconnection | Implement reconnect logic with backoff |
| Proxy/corporate firewall | Handshake fails | Check upgrade headers in Network tab |

### Proxy Note

mitmproxy supports WebSocket inspection but has limitations: no client/server replay for WebSocket connections. For raw TCP/TLS frame inspection when browser tools are insufficient, route through a proxy.

---

## 8. console.log Alternatives for Mobile

When you can't connect a USB cable (field debugging, testing on someone else's device, production debugging).

### Eruda (Full Mobile DevTools)

The most comprehensive on-device debugging tool. Provides Console, Network, Elements, Storage, and more as a floating overlay.

```html
<!-- Add to page (staging builds only) -->
<script src="https://cdn.jsdelivr.net/npm/eruda"></script>
<script>eruda.init();</script>
```

**Production-safe conditional loading:**

```js
if (location.hostname === "localhost" || location.search.includes("debug")) {
  const s = document.createElement("script");
  s.src = "https://cdn.jsdelivr.net/npm/eruda";
  s.onload = () => eruda.init();
  document.body.appendChild(s);
}
```

A floating gear icon appears. Tap to open the DevTools overlay with tabs for Console, Network, Elements, Storage, and more.

### vConsole (Lightweight Console)

Lighter alternative from Tencent (~30KB vs Eruda's ~80KB). Best when you just need console output.

```html
<script src="https://cdn.jsdelivr.net/npm/vconsole"></script>
<script>new VConsole();</script>
```

### Comparison

| Feature | Eruda | vConsole |
|---------|-------|---------|
| Size | ~80KB | ~30KB |
| Console | Full-featured | Basic |
| Network inspector | Detailed | Basic |
| DOM inspector | Yes | Limited |
| Source viewer | Yes | No |
| Best for | Full debugging | Quick log viewing |

### Remote Logging (No Device Access Needed)

**Custom remote logging:**

```js
const originalLog = console.log;
const originalError = console.error;

function remoteLog(level, args) {
  originalLog.apply(console, args);
  navigator.sendBeacon("/api/logs", JSON.stringify({
    level,
    message: args.map(String).join(" "),
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    url: location.href
  }));
}

console.log = (...args) => remoteLog("log", args);
console.error = (...args) => remoteLog("error", args);
```

Using `navigator.sendBeacon` instead of `fetch` ensures logs are sent even during page unload or crashes.

**Commercial services:**
- **Sentry**: Error tracking with breadcrumbs and session replay.
- **LogRocket**: Full session replay with console logs synced to video.

### The `sendBeacon` Debugger (For Heisenbugs)

For race conditions that vanish when you attach a debugger, use `navigator.sendBeacon` to fire logs to an endpoint immediately before the crash. Unlike `console.log`, it doesn't require a live DevTools connection and survives page unloads.

```js
navigator.sendBeacon("/api/debug", JSON.stringify({
  event: "pre-crash-state",
  state: getAppState(),
  timestamp: performance.now()
}));
```

---

## 9. Network Throttling and Proxying

### Chrome DevTools Throttling

1. DevTools > **Network** tab > **Throttling** dropdown.
2. Select a preset: Slow 3G, Fast 3G, Offline.
3. Or create a custom profile: Throttling dropdown > **Add...** and set download/upload speed (kbps) and latency (ms).

| Preset | Download | Upload | Latency |
|--------|----------|--------|---------|
| Slow 3G | 400 Kbps | 400 Kbps | 2000ms |
| Fast 3G | 1.44 Mbps | 675 Kbps | 563ms |

**Note**: DevTools throttling is applied at the browser level ("fake" — it sleeps the connection). For realistic network simulation on real devices, use a proxy.

### Charles Proxy

Intercepts HTTP/HTTPS traffic at the OS level. Paid ($50 one-time) with a 30-day trial.

**Desktop setup:**

1. Open Charles. Note your machine's IP (Help > Local IP Address).
2. Default proxy port: **8888**.

**Mobile device setup** (same Wi-Fi network):

1. Settings > Wi-Fi > select network > Configure Proxy > Manual.
2. Server: your machine's IP. Port: 8888.

**SSL certificate** (required for HTTPS):

1. With proxy configured, visit `chls.pro/ssl` on the mobile browser.
2. iOS: Settings > General > VPN & Device Management > Install the profile. Then Settings > General > About > Certificate Trust Settings > enable full trust.
3. Android: Settings > Security > Install from storage.
4. In Charles: Proxy > SSL Proxying Settings > add the hosts you want to inspect.

**Throttling:**

```
Proxy > Throttle Settings
  [x] Enable Throttling
  Bandwidth: 256 kbps
  Utilisation: 100%
  Round-trip latency: 200ms
  MTU: 1500

  [x] Only for selected hosts (optional)
  Add: example.com
```

Toggle with `Cmd+T` (Mac) / `Ctrl+T` (Windows).

### mitmproxy (Free, Open Source)

```bash
# Install
brew install mitmproxy     # macOS
pip install mitmproxy       # or via pip

# Start interactive proxy
mitmproxy                   # Terminal UI, port 8080

# Or web interface
mitmweb                     # Browser at http://localhost:8081

# Explicit mode and port
mitmweb --mode regular --listen-port 8080
```

**Mobile setup** (same as Charles):

1. Configure phone's Wi-Fi proxy to `<YOUR_IP>:8080`.
2. Visit `mitm.it` on the phone and install the certificate for your OS.
3. iOS: must also enable full trust in Certificate Trust Settings.

**Android 7+ SSL limitation**: Apps ignore user-installed certificates by default. Workarounds:
- Use an Android emulator (easier to install system certs).
- The target app must explicitly opt-in via `network_security_config.xml`.

**WireGuard mode** (captures traffic even from apps that ignore proxy settings):

```bash
mitmweb --mode wireguard
```

### macOS Network Link Conditioner (System-Wide)

Part of Xcode Additional Tools. Throttles all system network traffic, not just browser traffic:

1. Download "Additional Tools for Xcode" from Apple Developer.
2. Install the Network Link Conditioner preference pane.
3. Choose a profile (3G, WiFi, High Latency DNS, etc.) and enable.

### Proxyman (macOS, Free Tier Available)

Native macOS proxy tool, similar to Charles but with better Mac integration and performance. Free version supports basic features.

---

## 10. Reproducing Intermittent Mobile-Only Bugs

The hardest category of mobile debugging. These strategies move from cheapest/fastest to most thorough.

### Strategy 1: Capture Everything at the Point of Failure

Add comprehensive error reporting that captures the full device context:

```js
window.addEventListener("error", (event) => {
  navigator.sendBeacon("/api/error-log", JSON.stringify({
    // Error details
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    stack: event.error?.stack,

    // Device context (critical for reproduction)
    userAgent: navigator.userAgent,
    viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio },
    connection: navigator.connection?.effectiveType,
    orientation: screen.orientation?.type,
    memory: navigator.deviceMemory,
    timestamp: new Date().toISOString(),
    url: location.href
  }));
});
```

Build a **reproduction checklist** from collected data:
- Device model, OS version, browser version
- Network type (Wi-Fi/cellular/slow)
- Battery saver on/off
- Keyboard language, orientation at time of crash
- Exact sequence of user actions

### Strategy 2: Session Replay

Session replay tools record DOM mutations, console logs, network requests, and user interactions, then let you play them back frame by frame.

**Open source:**
- **rrweb** (rrweb.io): Records and replays DOM snapshots. Can be self-hosted.

**Commercial:**
- **LogRocket**: Full session replay with console logs synced to video.
- **Sentry Replay**: Adds visual replay to Sentry's error tracking.
- **FullStory**: Session replay with heatmaps and analytics.

### Strategy 3: Automated Replay with Playwright

Use Playwright's built-in device emulation and tracing to automate reproduction attempts.

**Generate a test from manual interaction:**

```bash
npx playwright codegen --device="iPhone 13" https://your-site.example
```

This opens a browser in device emulation mode, records your actions, and generates a test script.

**Run with tracing enabled:**

```bash
npx playwright test --trace on
```

**View the trace** (includes DOM snapshots, network, console, screenshots):

```bash
npx playwright show-trace path/to/trace.zip
```

**Config for automatic tracing on failure:**

```ts
// playwright.config.ts
export default {
  use: {
    ...devices["Pixel 5"],
    hasTouch: true,
    isMobile: true,
    trace: "on-first-retry",  // Capture trace only on retry
  },
};
```

### Strategy 4: Puppeteer with Network Simulation

```js
const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch({ headless: false, devtools: true });
  const page = await browser.newPage();

  // Emulate a specific device
  await page.emulate(puppeteer.devices["iPhone 12"]);

  // Simulate slow network
  const client = await page.createCDPSession();
  await client.send("Network.emulateNetworkConditions", {
    offline: false,
    downloadThroughput: 500 * 1024 / 8,   // 500 Kbps
    uploadThroughput: 500 * 1024 / 8,
    latency: 400
  });

  await page.goto("https://your-site.example");
  // ... interact and observe
  await browser.close();
})();
```

**Debug Puppeteer itself:**

```bash
DEBUG="puppeteer:*" node script.js
```

### Strategy 5: Device Farm Parallel Testing

Run the same test simultaneously across 10+ real devices to statistically reproduce intermittent bugs.

**Cloud device farms** (see Section 4):
- BrowserStack Automate: parallel real-device execution with video recording.
- Sauce Labs: extended debugging with HAR files and screenshots.
- AWS Device Farm: pay-per-minute, real Android and iOS devices.
- Firebase Test Lab: Robo tests for automated exploration (free tier: 10 tests/day).

### Strategy 6: Monitor Non-Deterministic Inputs

Intermittent bugs often stem from non-deterministic inputs. Instrument these:

```js
// Record timing of async operations
const asyncLog = [];
const originalFetch = window.fetch;
window.fetch = function (...args) {
  const start = performance.now();
  return originalFetch.apply(this, args).then((response) => {
    asyncLog.push({
      type: "fetch",
      url: args[0],
      duration: performance.now() - start,
      status: response.status,
      timestamp: Date.now()
    });
    return response;
  });
};
```

Key non-deterministic inputs to monitor:
- Network response timing and ordering
- `requestAnimationFrame` / `setTimeout` timing
- Sensor data (accelerometer, GPS)
- `visibilitychange` and backgrounding events
- Network type transitions (`navigator.connection`)

### Quick Reference: Debugging Decision Tree

```
Bug reported on mobile
  |
  +-- Can you reproduce on desktop Chrome device emulator?
  |     YES -> Debug normally with DevTools
  |     NO  -> Continue below
  |
  +-- Do you have the specific device?
  |     YES -> USB remote debug (Section 1 or 2)
  |     NO  -> Use cloud device farm (Section 4)
  |
  +-- Can you reproduce reliably?
  |     YES -> Step through with remote DevTools
  |     NO  -> Continue below
  |
  +-- Is it a layout / viewport issue?
  |     YES -> Check viewport units, safe areas, keyboard (Sections 5-6)
  |     NO  -> Continue below
  |
  +-- Is it a network-dependent issue?
  |     YES -> Proxy with Charles/mitmproxy (Section 9)
  |     NO  -> Continue below
  |
  +-- Intermittent / impossible to reproduce?
        -> Add error telemetry + session replay (Section 10)
        -> Run automated tests across device farm
        -> Monitor non-deterministic inputs
```

---

## References

### Official Documentation
- [Chrome Remote Debugging](https://developer.chrome.com/docs/devtools/remote-debugging)
- [Android ADB](https://developer.android.com/tools/adb)
- [Chrome Device Mode](https://developer.chrome.com/docs/devtools/device-mode)
- [Chrome Console Utilities (monitorEvents)](https://developer.chrome.com/docs/devtools/console/utilities)
- [Chrome Network Throttling](https://developer.chrome.com/docs/devtools/settings/throttling)
- [Safari Web Inspector](https://webkit.org/web-inspector/enabling-web-inspector/)
- [Apple Develop Menu](https://support.apple.com/guide/safari/use-the-developer-tools-in-the-develop-menu-sfri20948/mac)

### Web Platform APIs
- [MDN: VisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport)
- [MDN: VirtualKeyboard API](https://developer.mozilla.org/en-US/docs/Web/API/VirtualKeyboard_API)
- [MDN: env() CSS function](https://developer.mozilla.org/en-US/docs/Web/CSS/env)
- [MDN: Viewport units (svh, lvh, dvh)](https://developer.mozilla.org/en-US/docs/Web/CSS/length)

### Tools
- [Eruda](https://eruda.liriliri.io/) — Mobile DevTools overlay
- [vConsole](https://github.com/nickliu-tencent/vConsole) — Lightweight mobile console
- [Charles Proxy](https://www.charlesproxy.com/documentation/) — HTTP/HTTPS proxy
- [mitmproxy](https://docs.mitmproxy.org/stable/) — Open-source proxy
- [rrweb](https://www.rrweb.io/) — Session replay
- [Playwright](https://playwright.dev/docs/emulation) — Browser automation
- [Puppeteer](https://pptr.dev/guides/debugging) — Chrome automation

### Cloud Device Farms
- [BrowserStack Local](https://www.browserstack.com/docs/local-testing/binary-params)
- [LambdaTest Tunnel](https://www.lambdatest.com/support/docs/local-testing-for-macos/)
- [Sauce Connect 5](https://docs.saucelabs.com/secure-connections/sauce-connect-5/quickstart/)
