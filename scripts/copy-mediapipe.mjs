// Copies the MediaPipe vision wasm runtime from node_modules into public/
// so Vite serves it in dev and bundles it into builds. The model file is
// committed; the wasm is large and rehydrated from the package instead.
import { cpSync, mkdirSync } from 'node:fs'
mkdirSync('public/mediapipe/wasm', { recursive: true })
for (const f of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm']) {
  cpSync(`node_modules/@mediapipe/tasks-vision/wasm/${f}`, `public/mediapipe/wasm/${f}`)
}
console.log('mediapipe wasm staged')
