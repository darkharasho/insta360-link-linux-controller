const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)

/**
 * Size of the visible preview canvas: as many pixels as the canvas covers on
 * screen (css width × devicePixelRatio), capped at the source resolution so we
 * never upscale. A fixed small canvas stretched by CSS makes a 4K or zoomed
 * feed look soft and grainy. displayWidth 0 (not laid out yet) = source size.
 */
export function outputSize(
  videoWidth: number,
  videoHeight: number,
  displayWidth: number,
  dpr: number,
): { width: number; height: number } {
  const want = displayWidth > 0 ? displayWidth * (dpr || 1) : videoWidth
  const width = Math.min(videoWidth, want)
  return { width: even(width), height: even((width * videoHeight) / videoWidth) }
}
