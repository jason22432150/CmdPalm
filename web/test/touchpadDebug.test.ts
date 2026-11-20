import { beforeEach, describe, expect, it } from 'vitest'
import { settings } from '../src/lib/settings'
import {
  MAX_TOUCHPAD_DEBUG_EVENTS,
  clearTouchpadDebug,
  recordGestureMove,
  recordPointer,
  recordTouchpadReset,
  recordWebSocketMove,
  touchpadDebug,
  touchpadDebugSnapshot,
} from '../src/lib/touchpadDebug'

const event = (pointerId: number, x: number, y: number, timeStamp: number) =>
  ({ pointerId, clientX: x, clientY: y, timeStamp, pointerType: 'touch' }) as PointerEvent

beforeEach(() => {
  settings.touchpadDebug = false
  clearTouchpadDebug()
})

describe('opt-in touchpad diagnostics', () => {
  it('does not collect events while disabled', () => {
    recordPointer('pointerdown', event(7, 10, 20, 1), 10, 20, 1)
    recordWebSocketMove(20, 5, true, 0)
    expect(touchpadDebugSnapshot().events).toEqual([])
  })

  it('records coalesced pointer deltas, gain output and socket acceptance as distinct stages', () => {
    settings.touchpadDebug = true
    recordPointer('pointerdown', event(7, 10, 20, 1), 10, 20, 1)
    recordPointer('pointermove', event(7, 25, 20, 2), 25, 20, 1, true)
    recordPointer('pointermove', event(7, 35, 20, 3), 35, 20, 1, true)
    recordGestureMove(7, 25, 0, 2, 1.5)
    recordWebSocketMove(37.5, 0, true, 32)
    recordPointer('pointerup', event(7, 35, 20, 4), 35, 20, 0)
    const snap = touchpadDebugSnapshot()
    expect(snap.events.map((e) => e.stage)).toEqual([
      'pointerdown', 'pointermove', 'pointermove', 'gestureMove', 'websocketMove', 'pointerup',
    ])
    expect(snap.events[1]).toMatchObject({ pointerId: 7, deltaX: 15, deltaY: 0, coalesced: true })
    expect(snap.events[2]).toMatchObject({ deltaX: 10, deltaY: 0 })
    expect(snap.events[3]).toMatchObject({ queuedX: 37.5, queuedY: 0, gain: 1.5 })
    expect(snap.events[4]).toMatchObject({ sentX: 37.5, socketAccepted: true })
    expect(snap.counters.rawDistance).toBe(25)
    expect(snap.counters.queuedDistance).toBe(37.5)
    expect(snap.counters.sentDistance).toBe(37.5)
    expect(snap.observability.macCursorTravel).toBe(false)
  })

  it('does not claim failed sends were transmitted', () => {
    settings.touchpadDebug = true
    recordWebSocketMove(10, 4, false, 65536)
    expect(touchpadDebug.sentDistance).toBe(0)
    expect(touchpadDebugSnapshot().events[0].socketAccepted).toBe(false)
  })

  it('keeps a bounded chronological ring buffer and supports clearing', () => {
    settings.touchpadDebug = true
    for (let i = 0; i < MAX_TOUCHPAD_DEBUG_EVENTS + 9; i++) recordTouchpadReset('test-' + i)
    const snap = touchpadDebugSnapshot()
    expect(snap.events).toHaveLength(MAX_TOUCHPAD_DEBUG_EVENTS)
    expect(snap.overwritten).toBe(9)
    expect(snap.events[0].reason).toBe('test-9')
    expect(snap.events.at(-1)?.reason).toBe('test-' + (MAX_TOUCHPAD_DEBUG_EVENTS + 8))
    clearTouchpadDebug()
    expect(touchpadDebugSnapshot().events).toEqual([])
  })
})
