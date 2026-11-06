/**
 * Noise-reduction presets as [2D, 3D] strengths (0–100). The Facecam has no
 * preset selector of its own; these mirror Camera Hub's Off/Low/Medium/High.
 * Low matches the camera's own default (30/30); the rest are our choice.
 */
export const NR_PRESETS = {
  off: [0, 0],
  low: [30, 30],
  medium: [50, 50],
  high: [80, 80],
} as const

export type NrPreset = keyof typeof NR_PRESETS | 'custom'

export function nrPresetFor(nr2d: number, nr3d: number): NrPreset {
  for (const [name, [a, b]] of Object.entries(NR_PRESETS)) {
    if (a === nr2d && b === nr3d) return name as NrPreset
  }
  return 'custom'
}
