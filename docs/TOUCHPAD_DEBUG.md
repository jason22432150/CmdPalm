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

**Not measured:** host-received deltas and actual Mac cursor movement. The current CmdPalm wire protocol has no acknowledgement or host cursor telemetry. The exported `observability` object states this explicitly. Do not infer either metric from the Socket value.

The ring buffer is capped at **2,000 entries**; `overwritten` reports how many older entries were discarded. No background upload is performed. Captures remain in memory only until cleared or the page reloads. Traces are not automatically included in device settings backups.

### Troubleshooting interpretation

- Raw unexpectedly tiny when the finger visibly moves: inspect pointer capture, unexpected cancellation, browser gesture interception, or transformed coordinates.
- Raw substantial but queued tiny: inspect gesture recognition, pointer gain and multi-finger state.
- Queued substantial but Socket tiny: inspect coalescing and WebSocket congestion. Opposing deltas can legitimately cancel in a coalesced packet.
- All stages substantial but Mac cursor barely moves: investigate host input processing separately. This capture cannot distinguish host rejection from OS-level pointer handling.

For a sideways trackpad, compare physical `clientX/clientY` with `localX/localY` and `surfaceTransform`. If the rotated viewport changes coordinate mapping, test both orientation choices after the sideways-trackpad feature branch is integrated.

References: [W3C Pointer Events](https://www.w3.org/TR/pointerevents3/), [MDN getCoalescedEvents](https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/getCoalescedEvents), [MDN WebSocket.send](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/send).
