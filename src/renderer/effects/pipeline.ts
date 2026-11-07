import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision'
import { NEUTRAL_COLOR, isNeutral, colorFilterMarkup, type ColorCorrection } from './color'
import { NEUTRAL_ORIENT, isNeutralOrient, orientTransform, type Orientation } from './orient'
import { outputSize } from './output-size'

export type EffectKind = 'none' | 'blur' | 'soft' | 'mono' | 'warm'
export interface EffectsConfig {
  effect: EffectKind
  /** Background blur radius in px (only used by the 'blur' effect). */
  blurStrength: number
  /** Per-device software color correction, applied before the effect. */
  color: ColorCorrection
  /** Per-device rotate/mirror, applied where the raw video is first drawn. */
  orient: Orientation
}

/** Fixed size for segmentation and the virtual-camera sink, which keeps their
 * cost predictable. The visible preview is NOT drawn at this size: it follows
 * the source resolution (see outputSize), so 4K and zoomed feeds stay sharp. */
export const PIPELINE_WIDTH = 960
export const PIPELINE_HEIGHT = 540
export const SINK_FPS = 24

/** Blur radii are tuned at PIPELINE_WIDTH; `k` scales them to the output size. */
const FRAME_FILTERS: Record<Exclude<EffectKind, 'blur' | 'none'>, (k: number) => string> = {
  soft: (k) => `blur(${2 * k}px) brightness(1.03)`,
  mono: () => 'grayscale(1) contrast(1.05)',
  warm: () => 'sepia(0.28) saturate(1.2)',
}

let segmenterPromise: Promise<ImageSegmenter> | null = null
function getSegmenter(): Promise<ImageSegmenter> {
  segmenterPromise ??= (async () => {
    const fileset = await FilesetResolver.forVisionTasks('/mediapipe/wasm')
    return ImageSegmenter.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: '/mediapipe/selfie_segmenter.tflite', delegate: 'GPU' },
      runningMode: 'VIDEO',
      outputCategoryMask: true,
      outputConfidenceMasks: false,
    })
  })()
  return segmenterPromise
}

/**
 * Draws the camera video into an output canvas with the selected effect and
 * optionally pushes RGBA frames to a sink (the virtual-camera bridge).
 * Background blur = MediaPipe selfie segmentation: blurred frame underneath,
 * person composited sharp on top.
 */
let filterSeq = 0

export class EffectsPipeline {
  private config: EffectsConfig = {
    effect: 'none',
    blurStrength: 12,
    color: NEUTRAL_COLOR,
    orient: NEUTRAL_ORIENT,
  }
  private sink: ((data: Uint8Array) => void) | null = null
  private raf = 0
  private running = false
  private lastSinkAt = 0
  private segmenter: ImageSegmenter | null = null
  private segmenterFailed = false

  private out: CanvasRenderingContext2D
  /** Pipeline-size copy of the output for the vcam sink's pixel readback. */
  private sinkCanvas = document.createElement('canvas')
  private sinkCtx = this.sinkCanvas.getContext('2d', { willReadFrequently: true })!
  /** Output-size frame the person is cut out of when blurring. */
  private sharp = document.createElement('canvas')
  private sharpCtx = this.sharp.getContext('2d')!
  private bg = document.createElement('canvas')
  private bgCtx = this.bg.getContext('2d')!
  private person = document.createElement('canvas')
  private personCtx = this.person.getContext('2d')!
  private maskCanvas = document.createElement('canvas')
  private maskCtx = this.maskCtx0()
  private maskImage: ImageData | null = null

  /** Hidden SVG hosting the color-correction filter that ctx.filter references
   * by url(#id). It must live in the document for the reference to resolve. */
  private filterId = `color-correction-${++filterSeq}`
  private filterHost: SVGSVGElement
  private appliedColorKey = ''

  constructor(private video: HTMLVideoElement, private canvas: HTMLCanvasElement) {
    canvas.width = PIPELINE_WIDTH
    canvas.height = PIPELINE_HEIGHT
    for (const c of [this.bg, this.person, this.maskCanvas, this.sinkCanvas]) {
      c.width = PIPELINE_WIDTH
      c.height = PIPELINE_HEIGHT
    }
    // No willReadFrequently here: that forces a CPU canvas, too slow at 4K.
    // Pixel readback for the sink happens on the small sinkCanvas instead.
    this.out = canvas.getContext('2d')!
    this.filterHost = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    this.filterHost.setAttribute('width', '0')
    this.filterHost.setAttribute('height', '0')
    this.filterHost.setAttribute('aria-hidden', 'true')
    this.filterHost.style.position = 'absolute'
    document.body.appendChild(this.filterHost)
    this.syncColorFilter()
  }

  private syncColorFilter() {
    const c = this.config.color ?? NEUTRAL_COLOR
    const key = JSON.stringify(c)
    if (key === this.appliedColorKey) return
    this.appliedColorKey = key
    this.filterHost.innerHTML = colorFilterMarkup(this.filterId, c)
  }

  /** The ctx.filter fragment for color correction; '' when neutral. */
  private colorFilter(): string {
    return isNeutral(this.config.color ?? NEUTRAL_COLOR) ? '' : `url(#${this.filterId})`
  }

  private maskCtx0() {
    return this.maskCanvas.getContext('2d', { willReadFrequently: true })!
  }

  setConfig(c: EffectsConfig) {
    this.config = c
    this.syncColorFilter()
    if (c.effect === 'blur' && !this.segmenter && !this.segmenterFailed) {
      getSegmenter()
        .then((s) => { this.segmenter = s })
        .catch((err) => {
          console.error('segmenter init failed; falling back to full-frame blur', err)
          this.segmenterFailed = true
        })
    }
  }

  setSink(sink: ((data: Uint8Array) => void) | null) {
    this.sink = sink
  }

  start() {
    if (this.running) return
    this.running = true
    const loop = () => {
      if (!this.running) return
      this.drawFrame()
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this.raf)
    this.filterHost.remove()
  }

  /** Draw the raw video with the configured rotate/mirror applied. Doing it at
   * the source keeps everything downstream (segmentation mask, composite,
   * sink) aligned with the corrected image. */
  private drawVideo(ctx: CanvasRenderingContext2D, w = PIPELINE_WIDTH, h = PIPELINE_HEIGHT) {
    ctx.imageSmoothingQuality = 'high'
    if (isNeutralOrient(this.config.orient)) {
      ctx.drawImage(this.video, 0, 0, w, h)
      return
    }
    const [a, b, c, d, e, f] = orientTransform(this.config.orient, w, h)
    ctx.save()
    ctx.setTransform(a, b, c, d, e, f)
    ctx.drawImage(this.video, 0, 0, w, h)
    ctx.restore()
  }

  /** Match the visible canvas to the source / on-screen size. Resizing a
   * canvas clears it, so only do it when the size actually changes. */
  private syncOutputSize() {
    const { canvas, video } = this
    const s = outputSize(video.videoWidth, video.videoHeight, canvas.clientWidth, window.devicePixelRatio)
    if (canvas.width === s.width && canvas.height === s.height) return
    canvas.width = this.sharp.width = s.width
    canvas.height = this.sharp.height = s.height
  }

  private drawFrame() {
    const { video, out } = this
    if (video.readyState < 2 || video.videoWidth === 0) return
    this.syncOutputSize()
    const w = PIPELINE_WIDTH
    const h = PIPELINE_HEIGHT
    const ow = this.canvas.width
    const oh = this.canvas.height
    const effect = this.config.effect

    if (effect === 'blur' && this.segmenter) {
      // Segment a pipeline-size copy; the mask is scaled up to output size.
      this.drawVideo(this.personCtx)

      let composited = false
      this.segmenter.segmentForVideo(this.person, performance.now(), (result) => {
        const mask = result.categoryMask
        if (!mask) return
        const labels = mask.getAsUint8Array()
        this.maskImage ??= this.maskCtx.createImageData(w, h)
        const px = this.maskImage.data
        // selfie_segmenter: category 0 = person/foreground, non-zero = background.
        // If a future model flips this, swap the ternary.
        for (let i = 0; i < labels.length; i++) {
          px[i * 4 + 3] = labels[i] === 0 ? 255 : 0
        }
        this.maskCtx.putImageData(this.maskImage, 0, 0)
        composited = true
      })

      // Blurred background layer. Color correction is applied on the draws
      // into the output canvas (attached to the document), where the url(#id)
      // filter reference is guaranteed to resolve.
      this.bgCtx.filter = `blur(${this.config.blurStrength}px)`
      this.drawVideo(this.bgCtx)
      out.filter = this.colorFilter() || 'none'
      out.drawImage(this.bg, 0, 0, ow, oh)

      if (composited) {
        // Cut the person out of a full-resolution frame and lay it over the blur.
        const sc = this.sharpCtx
        sc.globalCompositeOperation = 'source-over'
        this.drawVideo(sc, ow, oh)
        sc.globalCompositeOperation = 'destination-in'
        sc.drawImage(this.maskCanvas, 0, 0, ow, oh)
        out.drawImage(this.sharp, 0, 0)
      }
      out.filter = 'none'
    } else {
      const k = ow / PIPELINE_WIDTH
      const effectPart =
        effect === 'none'
          ? ''
          : effect === 'blur'
            ? `blur(${this.config.blurStrength * k}px)` // segmenter unavailable: full-frame fallback
            : FRAME_FILTERS[effect](k)
      // Correct color first, then apply the stylistic effect on top.
      out.filter = [this.colorFilter(), effectPart].filter(Boolean).join(' ') || 'none'
      this.drawVideo(out, ow, oh)
      out.filter = 'none'
    }

    if (this.sink) {
      const now = performance.now()
      if (now - this.lastSinkAt >= 1000 / SINK_FPS) {
        this.lastSinkAt = now
        this.sinkCtx.drawImage(this.canvas, 0, 0, w, h)
        const img = this.sinkCtx.getImageData(0, 0, w, h)
        this.sink(new Uint8Array(img.data.buffer))
      }
    }
  }
}
