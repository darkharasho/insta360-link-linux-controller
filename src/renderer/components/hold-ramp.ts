/**
 * Steps-per-tick multiplier for a held PTZ arrow: starts gentle for fine
 * framing and ramps up every 700ms of hold, capped at 4× for fast slews.
 */
export function holdSpeed(elapsedMs: number): number {
  return Math.min(4, 1 + Math.floor(elapsedMs / 700))
}
