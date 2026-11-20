// Screen-shape decisions shared by the shell and the views.

import { computed, reactive } from 'vue'
import { settings } from './settings'

// A phone on its side: too short for a header, a bottom tab bar and a useful
// trackpad, so the chrome moves into a side rail.
const compactQuery = typeof matchMedia === 'function' ? matchMedia('(orientation: landscape) and (max-height: 500px)') : null

export const layout = reactive({
  compact: compactQuery?.matches ?? false,
  portrait: typeof matchMedia === 'function' ? matchMedia('(orientation: portrait)').matches : false,
})

compactQuery?.addEventListener('change', (event) => (layout.compact = event.matches))

const portraitQuery = typeof matchMedia === 'function' ? matchMedia('(orientation: portrait)') : null
portraitQuery?.addEventListener('change', (event) => (layout.portrait = event.matches))

/** Rotate only the trackpad page, not the browser or other tabs. */
export const sidewaysTrackpad = computed(() => settings.sidewaysTrackpad && layout.portrait)
