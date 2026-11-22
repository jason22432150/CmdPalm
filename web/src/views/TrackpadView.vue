<script setup lang="ts">
import { Keyboard, KeyboardOff } from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import ClickBar from '@/components/ClickBar.vue'
import Composer from '@/components/Composer.vue'
import ModifierStrip from '@/components/ModifierStrip.vue'
import ScrollRail from '@/components/ScrollRail.vue'
import TrackpadSurface from '@/components/TrackpadSurface.vue'
import { layout, sidewaysTrackpad } from '@/lib/layout'
import { settings } from '@/lib/settings'
import { clearTouchpadDebug, downloadTouchpadDebug, touchpadDebug } from '@/lib/touchpadDebug'

const typing = ref(false)
const composer = ref<InstanceType<typeof Composer>>()
const touched = ref(false)
const root = ref<HTMLElement>()
const size = ref({ width: 0, height: 0 })
let observer: ResizeObserver | undefined
onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    if (entry) size.value = { width: entry.contentRect.width, height: entry.contentRect.height }
  })
  if (root.value) observer.observe(root.value)
})
onBeforeUnmount(() => observer?.disconnect())

const compact = computed(() => layout.compact || sidewaysTrackpad.value)
const sidewaysStyle = computed(() => sidewaysTrackpad.value ? {
  width: `${size.value.height}px`,
  height: `${size.value.width}px`,
  transform: `translate(-50%, -50%) rotate(${settings.sidewaysTrackpadTurn === 'left' ? 90 : -90}deg)`,
} : undefined)

// On a landscape phone the click buttons sit right of the trackpad.
const atEdge = computed(() => !compact.value || typing.value || settings.scrollStripSide !== 'right' || !settings.clickButtons)

async function toggleTyping() {
  typing.value = !typing.value
  if (typing.value) {
    await nextTick()
    composer.value?.focus()
  }
}
</script>

<template>
  <div ref="root" class="relative h-full w-full overflow-hidden">
    <div class="flex h-full flex-col gap-2 px-2 pt-1 pb-2" :class="[compact && 'pt-2', sidewaysTrackpad && 'absolute top-1/2 left-1/2']" :style="sidewaysStyle">
    <!-- Landscape phones put the keys and buttons beside the trackpad. -->
    <div class="flex min-h-0 flex-1 gap-2" :class="!compact && 'flex-col'">
      <ModifierStrip v-if="!typing" :vertical="compact">
        <button
          type="button"
          class="key grid shrink-0 place-items-center rounded-[9px] bg-key text-muted active:bg-key-down"
          :class="compact ? 'min-h-0 flex-1' : 'w-12'"
          aria-label="Type on the Mac"
          @click="toggleTyping"
        >
          <Keyboard :size="19" />
        </button>
      </ModifierStrip>

      <TrackpadSurface class="min-h-0 min-w-0 flex-1" :edge="atEdge" @pointerdown.capture="touched = true">
        <ScrollRail v-if="settings.scrollStrip !== 'off'" />
        <div
          v-if="!touched"
          class="pointer-events-none absolute inset-0 grid place-items-center px-10 text-center text-[13px] leading-relaxed text-muted transition-opacity"
        >
          <p>
            One finger moves the pointer · Two fingers scroll<br />
            <template v-if="settings.tapToClick">Tap to click<span v-if="settings.twoFingerTapRightClick"> · </span></template>
            <template v-if="settings.twoFingerTapRightClick">Two-finger tap to right-click</template>
            <template v-if="!settings.tapToClick && !settings.twoFingerTapRightClick && settings.clickButtons">Use the Click and Right-click buttons</template>
          </p>
        </div>
      </TrackpadSurface>

      <ClickBar v-if="settings.clickButtons && !typing" :vertical="compact" />
    </div>

    <div v-if="settings.touchpadDebug" class="rounded-xl border border-sky-400/40 bg-surface-2 p-2 text-[11px]" role="status" aria-label="Touchpad diagnostics">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <strong class="text-sky-400">Touchpad debug · {{ touchpadDebug.count }} events</strong>
        <div class="flex gap-2">
          <button type="button" class="rounded-lg border border-line px-2 py-1" @click="clearTouchpadDebug">Clear</button>
          <button type="button" class="rounded-lg border border-line px-2 py-1" @click="downloadTouchpadDebug">Export JSON</button>
        </div>
      </div>
      <p class="mt-1 text-muted">Raw {{ touchpadDebug.rawDistance.toFixed(1) }}px · Queued {{ touchpadDebug.queuedDistance.toFixed(1) }}px · Socket {{ touchpadDebug.sentDistance.toFixed(1) }}px</p>
      <p class="text-muted">Last Δ ({{ touchpadDebug.lastDeltaX.toFixed(1) }}, {{ touchpadDebug.lastDeltaY.toFixed(1) }}) · Pointer {{ touchpadDebug.lastPointerId ?? '—' }} · Mac receipt/cursor distance unavailable</p>
      <p v-if="touchpadDebug.overwritten" class="text-amber-400">{{ touchpadDebug.overwritten }} older events overwritten</p>
    </div>

    <div v-if="typing">
      <Composer ref="composer" />
      <button
        type="button"
        class="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-xl text-[13px] font-medium text-muted"
        @click="toggleTyping"
      >
        <KeyboardOff :size="16" /> Hide typing
      </button>
    </div>
    </div>
  </div>
</template>

<style scoped>
.key {
  box-shadow: 0 1px 0 rgb(0 0 0 / 0.35);
}
</style>
