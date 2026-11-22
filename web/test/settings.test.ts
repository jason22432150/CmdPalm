import { describe, expect, it } from 'vitest'
import { applyMacGesturePreset, defaultSettings, migrate, settings } from '../src/lib/settings'

describe('migrating stored settings', () => {
  it('defaults to Mac three-finger drag and four-finger desktop navigation', () => {
    const defaults = defaultSettings()
    expect(defaults.threeFingerDrag).toBe(true)
    expect(defaults.fourFinger).toMatchObject({
      left: { kind: 'system', name: 'spaceRight' },
      right: { kind: 'system', name: 'spaceLeft' },
      up: { kind: 'system', name: 'missionControl' },
      down: { kind: 'system', name: 'appExpose' },
    })
  })

  it('applies the Mac gesture preset without clearing unrelated preferences', () => {
    const previous = {
      threeFingerDrag: settings.threeFingerDrag,
      fourFinger: structuredClone(settings.fourFinger),
      scrollSpeed: settings.scrollSpeed,
    }
    try {
      settings.threeFingerDrag = false
      settings.fourFinger.left = { kind: 'system', name: 'nextTab' }
      settings.fourFinger.right = { kind: 'system', name: 'previousTab' }
      settings.scrollSpeed = 2
      applyMacGesturePreset()
      expect(settings.threeFingerDrag).toBe(true)
      expect(settings.fourFinger.left).toEqual({ kind: 'system', name: 'spaceRight' })
      expect(settings.fourFinger.right).toEqual({ kind: 'system', name: 'spaceLeft' })
      expect(settings.scrollSpeed).toBe(2)
    } finally {
      settings.threeFingerDrag = previous.threeFingerDrag
      settings.fourFinger = previous.fourFinger
      settings.scrollSpeed = previous.scrollSpeed
    }
  })

  it('preserves previously saved gesture preferences', () => {
    const out = migrate({
      threeFingerDrag: false,
      fourFinger: { left: { kind: 'system', name: 'nextTab' } },
    })
    expect(out.threeFingerDrag).toBe(false)
    expect(out.fourFinger.left).toEqual({ kind: 'system', name: 'nextTab' })
  })

  it('keeps other settings when a gesture map is null', () => {
    const out = migrate({ pointerSpeed: 2, theme: 'light', threeFinger: null, fourFinger: null })
    expect(out.pointerSpeed).toBe(2)
    expect(out.theme).toBe('light')
    expect(out.threeFinger).toEqual(defaultSettings().threeFinger)
    expect(out.fourFinger).toEqual(defaultSettings().fourFinger)
  })

  it('keeps known gesture slots and drops malformed ones', () => {
    const out = migrate({ threeFinger: { up: null, down: 'nope', tap: { kind: 'mouse', button: 'left' }, extra: null } })
    expect(out.threeFinger.up).toBeNull()
    expect(out.threeFinger.down).toEqual(defaultSettings().threeFinger.down)
    expect(out.threeFinger.tap).toEqual({ kind: 'mouse', button: 'left' })
    expect(out.threeFinger).not.toHaveProperty('extra')
  })

  it('carries the old scroll strip setting over to style and side', () => {
    expect(migrate({ scrollRail: 'off' })).toMatchObject({ scrollStrip: 'off', scrollStripSide: 'right' })
    expect(migrate({ scrollRail: 'left' })).toMatchObject({ scrollStrip: 'short', scrollStripSide: 'left' })
    expect(migrate({ scrollRail: 'off', scrollStrip: 'long', scrollStripSide: 'right' })).toMatchObject({ scrollStrip: 'long', scrollStripSide: 'right' })
    expect(migrate({})).toMatchObject({ scrollStrip: 'short', scrollStripSide: 'right' })
    expect(migrate({ scrollRail: 'left' })).not.toHaveProperty('scrollRail')
  })

  it('drops values of the wrong type or outside the choices', () => {
    const out = migrate({ theme: 'sepia', haptics: 'yes', scrollSpeed: 99, scrollStripWidth: 'huge', showAdvanced: true, pointerSpeed: 1.8 })
    expect(out.theme).toBe('system')
    expect(out.scrollStripWidth).toBe('normal')
    expect(out.haptics).toBe(true)
    expect(out.scrollSpeed).toBe(4)
    expect(out.pointerSpeed).toBe(1.8)
    expect(out).not.toHaveProperty('showAdvanced')
  })
})
