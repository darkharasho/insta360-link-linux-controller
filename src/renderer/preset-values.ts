import type { CameraFamily, Control } from '../shared/types'

const FRAMING = new Set(['pan_absolute', 'tilt_absolute', 'zoom_absolute'])

/**
 * Values a preset captures. Link presets keep every active control (the whole
 * look); Facecam presets are framing only, like Camera Hub's framing presets —
 * its look is saved to the camera instead.
 */
export function presetValuesFor(family: CameraFamily, controls: Control[]): Record<string, number> {
  const keep = (c: Control) => !c.inactive && (family !== 'elgato-facecam-4k' || FRAMING.has(c.name))
  return Object.fromEntries(controls.filter(keep).map((c) => [c.name, c.value]))
}

/** Facecam "reset framing": pan, tilt and zoom back to their defaults (zoom last). */
export function framingHome(controls: Control[]): Array<[string, number]> {
  return ['pan_absolute', 'tilt_absolute', 'zoom_absolute'].flatMap((name) => {
    const c = controls.find((x) => x.name === name)
    return c && c.default !== undefined ? [[name, c.default] as [string, number]] : []
  })
}
