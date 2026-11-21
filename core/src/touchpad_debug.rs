//! Opt-in, in-memory diagnostic trace for pointer motion on the host.
//! No device tokens, typed text, clipboard, network addresses or file paths.
//! No event is recorded unless explicitly enabled from the Mac's Advanced settings.

use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::{Value, json};

pub const MAX_EVENTS: usize = 4_000;
static ENABLED: AtomicBool = AtomicBool::new(false);
static TRACE: OnceLock<Mutex<Trace>> = OnceLock::new();

#[derive(Default)]
struct Trace {
    started_at_ms: u128,
    next_sequence: u64,
    overwritten: u64,
    events: VecDeque<Value>,
}

fn now_ms() -> u128 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis()
}

fn state() -> &'static Mutex<Trace> {
    TRACE.get_or_init(|| {
        Mutex::new(Trace {
            started_at_ms: now_ms(),
            ..Trace::default()
        })
    })
}

fn lock() -> std::sync::MutexGuard<'static, Trace> {
    state().lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// Hot paths check this before building their JSON values.
#[inline]
pub fn enabled() -> bool {
    ENABLED.load(Ordering::Relaxed)
}

/// Disabling recording retains earlier events until the user clears them.
pub fn set_enabled(value: bool) {
    ENABLED.store(value, Ordering::SeqCst);
    if value {
        let _ = state();
    }
}

pub fn clear() {
    let mut trace = lock();
    *trace = Trace {
        started_at_ms: now_ms(),
        ..Trace::default()
    };
}

/// Sequence numbers correlate transport, engine, and macOS event stages.
/// Events from multiple sessions may interleave.
pub fn record(stage: &'static str, details: Value) {
    if !enabled() {
        return;
    }
    let mut trace = lock();
    if !ENABLED.load(Ordering::SeqCst) {
        return;
    }
    trace.next_sequence += 1;
    if trace.events.len() == MAX_EVENTS {
        trace.events.pop_front();
        trace.overwritten += 1;
    }
    let sequence = trace.next_sequence;
    trace.events.push_back(json!({
        "seq": sequence,
        "atUnixMs": now_ms(),
        "stage": stage,
        "data": details,
    }));
}

pub fn snapshot_json() -> String {
    let trace = lock();
    serde_json::to_string_pretty(&json!({
        "schemaVersion": 1,
        "source": "cmdpalm-mac",
        "startedAtUnixMs": trace.started_at_ms,
        "exportedAtUnixMs": now_ms(),
        "enabled": enabled(),
        "maxEvents": MAX_EVENTS,
        "count": trace.events.len(),
        "overwritten": trace.overwritten,
        "observability": {
            "socketDecoded": true,
            "engineQueued": true,
            "macEventTarget": cfg!(target_os = "macos"),
            "osCursorSample": cfg!(target_os = "macos"),
            "note": "postEvent.target is the intended cursor position, not proof of actual movement. observedAfterImmediate is sampled immediately after CGEventPost and may be stale. Timestamps are approximate across devices; there is no per-packet delivery acknowledgement."
        },
        "events": trace.events,
    }))
    .unwrap_or_else(|_| "{\"error\":\"could not serialize touchpad diagnostics\"}".to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn diagnostics_are_opt_in_bounded_chronological_and_clearable() {
        set_enabled(false);
        clear();
        record("socketDecoded", json!({"dx": 1}));
        let off: Value = serde_json::from_str(&snapshot_json()).unwrap();
        assert_eq!(off["count"], 0);

        set_enabled(true);
        for x in 0..(MAX_EVENTS + 3) {
            record("socketDecoded", json!({"dx": x}));
        }
        set_enabled(false);
        let snapshot: Value = serde_json::from_str(&snapshot_json()).unwrap();
        assert_eq!(snapshot["count"], json!(MAX_EVENTS));
        assert_eq!(snapshot["overwritten"], 3);
        assert_eq!(snapshot["events"][0]["data"]["dx"], 3);
        assert_eq!(snapshot["events"][MAX_EVENTS - 1]["data"]["dx"], json!(MAX_EVENTS + 2));
        assert_eq!(snapshot["enabled"], false);

        clear();
        let cleared: Value = serde_json::from_str(&snapshot_json()).unwrap();
        assert_eq!(cleared["count"], 0);
        assert_eq!(cleared["overwritten"], 0);
    }
}
