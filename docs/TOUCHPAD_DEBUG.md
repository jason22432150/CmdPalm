# Touchpad diagnostics (opt-in)

CmdPalm's mobile web trackpad can show the finger's actual path and export a bounded JSON trace to help diagnose cases where the mouse cursor barely moves or jitters.

## Capture a trace

1. On the phone open **Settings → Trackpad → Touchpad debug mode**. This is **off by default** and enables recording only in the phone browser.
2. Return to **Trackpad**. A cyan line traces the finger's path. The diagnostics bar shows **Raw**, **Queued**, and **Socket** travel totals (CSS pixels). Keep one finger down and reproduce the problem.
3. Tap **Export JSON** on the diagnostics bar to save the trace locally. Tap **Clear** to start a new capture; disable the setting to stop collecting events.
4. Share the JSON with a developer only after reviewing it. It contains touch positions and timing, which may reveal gestures but does **not** intentionally include typed text, pairing tokens, or device identifiers.

### Meaning of the three stages

- **Raw**: sum of absolute lengths between consecutive browser PointerEvent positions for each pointer, including coalesced samples. It is *not* the Mac cursor's displacement.
- **Queued**: recognizer `move(dx, dy, dt)` output after CmdPalm applies pointer speed / acceleration. Gestures that resolve to scrolling or zooming will not produce ordinary pointer movement.
- **Socket**: sum of lengths of aggregated pointer move packets successfully handed to the browser WebSocket API. A packet may combine opposite movements, so this total can differ from queued travel even when the transport is healthy. This is **not** proof of delivery to macOS.

Each JSON event includes a sequence number and monotonic timestamp; pointer event type, ID, pointer type, screen and local coordinates, per-sample delta, finger count, coalesced flag, viewport, orientation angle, visual viewport scale, device pixel ratio and surface CSS transform. Gesture outputs include `dt`, gain and queued deltas. Socket records include accepted status, sent deltas and buffered bytes. Lifecycle resets are included.

**Not measured in the phone JSON:** host-received deltas and actual Mac cursor movement. The current CmdPalm wire protocol has no acknowledgement or host cursor telemetry. Use the separate Mac-side trace (below) for those intermediate stages; neither file is proof of application-level cursor acceptance.

The ring buffer is capped at **2,000 entries**; `overwritten` reports how many older entries were discarded. No background upload is performed. Captures remain in memory only until cleared or the page reloads. Traces are not automatically included in device settings backups.

## Capture a Mac-side trace

The Mac app now offers a separate, opt-in trace under **CmdPalm → Settings → Advanced → Troubleshooting**:

1. Turn on **Capture touchpad diagnostics** on the Mac. This is off by default on every app launch and does not enable itself when the phone's option is enabled.
2. On the phone, clear the existing mobile capture and reproduce the failure with one finger. For easier comparisons, move the Mac cursor to the centre of a display first.
3. On the Mac, turn off capture to freeze the event buffer. Click **Export Touchpad JSON** and select a destination; click **Clear Capture** when ready for another test.
4. Export the mobile JSON from the phone. Share the two JSON files together, ideally from the same short reproduction.

The Mac trace is **in-memory only**, capped at **4,000 entries** (a separate ring buffer from the phone's 2,000). It is not written into the normal CmdPalm.log, never uploaded automatically, and never intentionally includes device tokens, keyboard input, clipboard contents or IP addresses. The `overwritten` count tells you whether older events were replaced.

| Mac stage | What it means |
| --- | --- |
| `socketDecoded` | A validated binary Move packet was decoded by the Mac's WebSocket session. Includes session number and relative dx/dy. |
| `engineQueued` | The input engine accepted the relative movement into its pacer. Includes queued delta and pending pacer totals. |
| `engineDropped` | The input engine ignored movement because control was paused or the session was stopped. |
| `accessibilityDenied` | The Mac's Accessibility permission check did not allow synthesized control; the usual permission notice is also emitted. |
| `enginePosted` | The pacer emitted a movement event toward the platform input sink. |
| `macEventPosted` | macOS event posting was invoked. Includes starting coordinate, clamped target, whether the display edge was hit, and OS cursor position sampled *immediately after* posting. |
| `macEventCreationFailed` | macOS could not construct a mouse event. |

**Important:** `macEventPosted.targetX/Y` is where CmdPalm *asked* the pointer to move. `observedAfterImmediateX/Y` is an actual OS cursor query immediately after CGEvent posting, but it can return an older position because posting is asynchronous. They must not be treated as a guaranteed eventual cursor position or an acknowledgement. App-level responsiveness also depends on macOS Accessibility permission and the foreground application.

Mac events have `atUnixMs` (wall clock milliseconds) and `seq` (local processing order). Phone event timestamps are based on its own clock and browser time origin. Align the captures approximately with a distinctive movement; there is **no shared per-packet ID or guaranteed clock synchronization**. Multiple paired devices can interleave.

### Troubleshooting interpretation

- Raw unexpectedly tiny when the finger visibly moves: inspect pointer capture, unexpected cancellation, browser gesture interception, or transformed coordinates.
- Raw substantial but queued tiny: inspect gesture recognition, pointer gain and multi-finger state.
- Queued substantial but Socket tiny: inspect coalescing and WebSocket congestion. Opposing deltas can legitimately cancel in a coalesced packet.
- Phone Socket moves but no Mac `socketDecoded` events: inspect the connection or Mac-side session before the input engine. Browser WebSocket acceptance is not delivery acknowledgement.
- Mac `socketDecoded` but no `engineQueued`: inspect `engineDropped`, paused state and session interruption.
- An `accessibilityDenied` event indicates that macOS control permission needs to be repaired before pointer behavior can be judged.
- Mac `engineQueued` / `enginePosted` but macOS targets stay at the screen boundary: inspect `macEventPosted.clamped`.
- Mac targets move, but immediate OS observations remain still: examine the Mac's accessibility permission, posting behavior and delayed cursor samples; immediate observations may be stale.

For a sideways trackpad, compare physical `clientX/clientY` with `localX/localY` and `surfaceTransform`. If the rotated viewport changes coordinate mapping, test both orientation choices after the sideways-trackpad feature branch is integrated.

References: [W3C Pointer Events](https://www.w3.org/TR/pointerevents3/), [MDN getCoalescedEvents](https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/getCoalescedEvents), [MDN WebSocket.send](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/send).
