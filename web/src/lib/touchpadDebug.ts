// Opt-in, device-local touchpad diagnostics. Never send logs to the Mac.
import { reactive, watch } from 'vue'
import { settings } from './settings'

export const MAX_TOUCHPAD_DEBUG_EVENTS = 2000
export type PointerKind = 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel' | 'lostpointercapture'

export interface DebugEvent {
  seq: number
  stage: PointerKind | 'gestureMove' | 'websocketMove' | 'reset'
  timeStamp: number
  pointerId?: number
  pointerType?: string
  clientX?: number
  clientY?: number
  localX?: number
  localY?: number
  deltaX?: number
  deltaY?: number
  fingers?: number
  coalesced?: boolean
  dt?: number
  gain?: number
  queuedX?: number
  queuedY?: number
  sentX?: number
  sentY?: number
  socketAccepted?: boolean
  bufferedBytes?: number
  viewportWidth?: number
  viewportHeight?: number
  angle?: number | null
  orientation?: string | null
  visualScale?: number
  devicePixelRatio?: number
  surfaceTransform?: string
  reason?: string
}

let events: DebugEvent[] = []
let head = 0
let sequence = 0
let overwritten = 0
let startedAt = new Date().toISOString()
const lastPosition = new Map<number, { x: number; y: number }>()

export const touchpadDebug = reactive({
  count: 0,
  overwritten: 0,
  rawDistance: 0,
  queuedDistance: 0,
  sentDistance: 0,
  lastDeltaX: 0,
  lastDeltaY: 0,
  lastPointerId: null as number | null,
})

function append(stage: DebugEvent['stage'], timeStamp: number, details: Partial<DebugEvent> = {}) {
  if (!settings.touchpadDebug) return
  const entry: DebugEvent = { ...details, seq: ++sequence, stage, timeStamp }
  if (events.length < MAX_TOUCHPAD_DEBUG_EVENTS) {
    events.push(entry)
  } else {
    events[head] = entry
    head = (head + 1) % MAX_TOUCHPAD_DEBUG_EVENTS
    overwritten++
  }
  touchpadDebug.count = events.length
  touchpadDebug.overwritten = overwritten
}

export function clearTouchpadDebug() {
  events = []
  head = 0
  sequence = 0
  overwritten = 0
  startedAt = new Date().toISOString()
  lastPosition.clear()
  touchpadDebug.count = 0
  touchpadDebug.overwritten = 0
  touchpadDebug.rawDistance = 0
  touchpadDebug.queuedDistance = 0
  touchpadDebug.sentDistance = 0
  touchpadDebug.lastDeltaX = 0
  touchpadDebug.lastDeltaY = 0
  touchpadDebug.lastPointerId = null
}

watch(
  () => settings.touchpadDebug,
  (enabled) => {
    if (enabled) clearTouchpadDebug()
    else lastPosition.clear()
  },
)

export function recordPointer(
  stage: PointerKind,
  event: PointerEvent,
  localX: number,
  localY: number,
  fingers: number,
  coalesced = false,
  surfaceTransform = 'none',
) {
  if (!settings.touchpadDebug) return
  const previous = lastPosition.get(event.pointerId)
  const deltaX = stage === 'pointermove' && previous ? event.clientX - previous.x : 0
  const deltaY = stage === 'pointermove' && previous ? event.clientY - previous.y : 0
  if (stage === 'pointerdown' || stage === 'pointermove') lastPosition.set(event.pointerId, { x: event.clientX, y: event.clientY })
  else lastPosition.delete(event.pointerId)

  if (stage === 'pointermove') {
    touchpadDebug.rawDistance += Math.hypot(deltaX, deltaY)
    touchpadDebug.lastDeltaX = deltaX
    touchpadDebug.lastDeltaY = deltaY
  }
  touchpadDebug.lastPointerId = event.pointerId
  const orientation = typeof screen !== 'undefined' ? screen.orientation : undefined
  append(stage, event.timeStamp, {
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    clientX: event.clientX,
    clientY: event.clientY,
    localX,
    localY,
    deltaX,
    deltaY,
    fingers,
    coalesced,
    viewportWidth: typeof window !== 'undefined' ? window.innerWidth : 0,
    viewportHeight: typeof window !== 'undefined' ? window.innerHeight : 0,
    angle: orientation?.angle ?? null,
    orientation: orientation?.type ?? null,
    visualScale: typeof window !== 'undefined' ? window.visualViewport?.scale ?? 1 : 1,
    devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
    surfaceTransform,
  })
}

export function recordGestureMove(pointerId: number | null, dx: number, dy: number, dt: number, gain: number) {
  if (!settings.touchpadDebug) return
  touchpadDebug.queuedDistance += Math.hypot(dx * gain, dy * gain)
  append('gestureMove', performance.now(), {
    pointerId: pointerId ?? undefined,
    deltaX: dx,
    deltaY: dy,
    dt,
    gain,
    queuedX: dx * gain,
    queuedY: dy * gain,
  })
}

/** Socket acceptance is NOT proof that the Mac received or applied the delta. */
export function recordWebSocketMove(dx: number, dy: number, accepted: boolean, bufferedBytes: number) {
  if (!settings.touchpadDebug) return
  if (accepted) touchpadDebug.sentDistance += Math.hypot(dx, dy)
  append('websocketMove', performance.now(), {
    sentX: dx,
    sentY: dy,
    socketAccepted: accepted,
    bufferedBytes,
  })
}

export function recordTouchpadReset(reason: string) {
  if (!settings.touchpadDebug) return
  lastPosition.clear()
  append('reset', performance.now(), { reason })
}

export function touchpadDebugSnapshot() {
  return {
    schemaVersion: 1,
    startedAt,
    exportedAt: new Date().toISOString(),
    maxEvents: MAX_TOUCHPAD_DEBUG_EVENTS,
    overwritten,
    counters: { ...touchpadDebug },
    observability: {
      browserPointerEvents: true,
      gestureOutputQueued: true,
      websocketSendAttempt: true,
      macReceivedDelta: false,
      macCursorTravel: false,
      note: 'WebSocket acceptance does not acknowledge Mac reception. Actual Mac pointer travel and host-received deltas are unavailable without a host-side diagnostic protocol.',
    },
    events: [...events.slice(head), ...events.slice(0, head)],
  }
}

/** Export locally on the phone; contains positions but never credentials or typed text. */
export function downloadTouchpadDebug() {
  if (typeof document === 'undefined') return
  const blob = new Blob([JSON.stringify(touchpadDebugSnapshot(), null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'cmdpalm-touchpad-debug-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json'
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
