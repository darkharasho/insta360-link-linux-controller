import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision'

export type EffectKind = 'none' | 'blur' | 'soft' | 'mono' | 'warm'
export interface EffectsConfig {
  effect: EffectKind
  /** Background blur radius in px (only used by the 'blur' effect). */
  blurStrength: number
}

/** Fixed processing size: matches the cameras' 16:9 output and keeps the
 * segmentation + readback cost predictable regardless of source resolution. */
export const PIPELINE_WIDTH = 960
export const PIPELINE_HEIGHT = 540
export const SINK_FPS = 24

const FRAME_FILTERS: Record<Exclude<EffectKind, 'blur' | 'none'>, string> = {
  soft: 'blur(2px) brightness(1.03)',
  mono: 'grayscale(1) contrast(1.05)',
  warm: 'sepia(0.28) saturate(1.2)',
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
export class EffectsPipeline {
  private config: EffectsConfig = { effect: 'none', blurStrength: 12 }
  private sink: ((data: Uint8Array) => void) | null = null
  private raf = 0
  private running = false
  private lastSinkAt = 0
  private segmenter: ImageSegmenter | null = null
  private segmenterFailed = false

  private out: CanvasRenderingContext2D
  private bg = document.createElement('canvas')
  private bgCtx = this.bg.getContext('2d')!
  private person = document.createElement('canvas')
  private personCtx = this.person.getContext('2d')!
  private maskCanvas = document.createElement('canvas')
  private maskCtx = this.maskCtx0()
  private maskImage: ImageData | null = null

  constructor(private video: HTMLVideoElement, private canvas: HTMLCanvasElement) {
    canvas.width = PIPELINE_WIDTH
    canvas.height = PIPELINE_HEIGHT
    for (const c of [this.bg, this.person, this.maskCanvas]) {
      c.width = PIPELINE_WIDTH
      c.height = PIPELINE_HEIGHT
    }
    this.out = canvas.getContext('2d', { willReadFrequently: true })!
  }

  private maskCtx0() {
    return this.maskCanvas.getContext('2d', { willReadFrequently: true })!
  }

  setConfig(c: EffectsConfig) {
    this.config = c
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
  }

  private drawFrame() {
    const { video, out } = this
    if (video.readyState < 2 || video.videoWidth === 0) return
    const w = PIPELINE_WIDTH
    const h = PIPELINE_HEIGHT
    const effect = this.config.effect

    if (effect === 'blur' && this.segmenter) {
      // Work frame at pipeline size so the mask aligns 1:1 with our canvases.
      this.personCtx.globalCompositeOperation = 'source-over'
      this.personCtx.filter = 'none'
      this.personCtx.drawImage(video, 0, 0, w, h)

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

      // Blurred background layer.
      this.bgCtx.filter = `blur(${this.config.blurStrength}px)`
      this.bgCtx.drawImage(video, 0, 0, w, h)
      out.filter = 'none'
      out.drawImage(this.bg, 0, 0)

      if (composited) {
        // Cut the person out of the sharp frame and lay it over the blur.
        this.personCtx.globalCompositeOperation = 'destination-in'
        this.personCtx.drawImage(this.maskCanvas, 0, 0)
        out.drawImage(this.person, 0, 0)
      }
    } else {
      out.filter =
        effect === 'none' || effect === 'blur'
          ? effect === 'blur'
            ? `blur(${this.config.blurStrength}px)` // segmenter unavailable: full-frame fallback
            : 'none'
          : FRAME_FILTERS[effect]
      out.drawImage(video, 0, 0, w, h)
      out.filter = 'none'
    }

    if (this.sink) {
      const now = performance.now()
      if (now - this.lastSinkAt >= 1000 / SINK_FPS) {
        this.lastSinkAt = now
        const img = this.out.getImageData(0, 0, w, h)
        this.sink(new Uint8Array(img.data.buffer))
      }
    }
  }
}
