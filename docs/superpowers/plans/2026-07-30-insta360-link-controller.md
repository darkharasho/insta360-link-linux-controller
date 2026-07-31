# insta360-link-linux-controller Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A polished Linux Electron app that controls Insta360 Link 1/2 webcams (PTZ, AI tracking, scene modes, presets, image settings) with a live preview, shipped as an auto-updating AppImage.

**Architecture:** Renderer (React/TS) talks only over a typed IPC bridge to the Electron main process, which hosts a camera control service. The service calls two hardware adapters: a `v4l2` adapter that shells out to `v4l2-ctl` for standard controls + discovery, and an `xu` adapter that invokes a bundled `link-xu` C helper for proprietary UVC Extension-Unit commands. Pure parsing/argv/mapping logic is unit-tested with fixtures; hardware is validated manually.

**Tech Stack:** Electron, electron-builder, electron-updater, React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui (Radix), Vitest, electron-store, a small C helper compiled with gcc.

## Global Constraints

- Platform: Linux x86_64 only. No Windows/macOS code paths.
- Node: v24 (matches dev machine). Package manager: npm.
- Vitest MUST run with `--maxWorkers=2` (global machine rule).
- Renderer runs with `contextIsolation: true`, `nodeIntegration: false`. The renderer NEVER imports Node/Electron hardware modules directly — only `window.cameraApi` from the preload.
- All hardware access in the main process goes through the two adapters (`v4l2`, `xu`); no ad-hoc `exec` calls elsewhere.
- Device paths are always explicit `/dev/videoN`; never assume a fixed node.
- Commit after every task with a Conventional Commits message.

---

## File Structure

```
package.json                        # scripts, deps, electron-builder config
electron-builder.yml                # AppImage target, extraResources, publish feed
tsconfig.json / tsconfig.node.json  # TS config for renderer + main
vite.config.ts                      # Vite + React for renderer
vitest.config.ts                    # maxWorkers=2
tailwind.config.js / postcss.config.js
index.html                          # renderer entry

native/link-xu/link-xu.c            # C helper: UVC XU ioctls
native/link-xu/Makefile             # builds link-xu binary

src/main/main.ts                    # Electron app bootstrap, window, updater
src/main/ipc.ts                     # registers typed IPC handlers -> service
src/main/preload.ts                 # exposes window.cameraApi (typed)
src/main/camera/service.ts          # CameraService orchestrator
src/main/camera/v4l2.ts             # v4l2 adapter (exec wrapper)
src/main/camera/v4l2-parse.ts       # PURE: parse list-devices & list-ctrls
src/main/camera/v4l2-argv.ts        # PURE: build v4l2-ctl argv
src/main/camera/xu.ts               # xu adapter (spawns link-xu)
src/main/camera/xu-argv.ts          # PURE: map XU command -> link-xu argv
src/main/camera/presets.ts          # app-side preset store (electron-store)
src/shared/types.ts                 # shared IPC types (Device, Control, etc.)

src/renderer/main.tsx               # React root
src/renderer/App.tsx                # layout shell
src/renderer/api.ts                 # thin wrapper over window.cameraApi
src/renderer/components/*           # CameraPicker, PreviewPane, PtzPad,
                                    #   ImageSettings, AiTracking, SceneModes, Presets
src/renderer/components/ui/*        # shadcn primitives

packaging/99-insta360-link.rules    # udev rule
.github/workflows/build.yml         # CI: test + build AppImage on tag
tests/fixtures/*.txt                # captured v4l2-ctl output

docs/HARDWARE-TEST.md               # manual hardware validation checklist
```

**Shared types** (`src/shared/types.ts`) is the contract every layer depends on. Defined in Task 2, consumed everywhere after.

---

## Phase 0 — Scaffold

### Task 1: Project scaffold + tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `vitest.config.ts`, `tailwind.config.js`, `postcss.config.js`, `index.html`, `src/renderer/main.tsx`, `src/renderer/App.tsx`, `src/renderer/index.css`, `.gitignore` (already exists — extend)
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Produces: npm scripts `dev`, `build`, `test`, `test:run`; a working Vite+React renderer; Vitest configured with `maxWorkers=2`.

- [ ] **Step 1: Write the failing smoke test**

```ts
// tests/smoke.test.ts
import { describe, it, expect } from 'vitest'

describe('toolchain', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 2: Run it to verify the runner is missing**

Run: `npx vitest run --maxWorkers=2`
Expected: FAIL (vitest not installed yet).

- [ ] **Step 3: Create `package.json`**

```json
{
  "name": "insta360-link-linux-controller",
  "version": "0.1.0",
  "description": "Control Insta360 Link webcams on Linux",
  "main": "dist/main/main.js",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build:renderer": "vite build",
    "build:main": "tsc -p tsconfig.node.json",
    "build:native": "make -C native/link-xu",
    "build": "npm run build:native && npm run build:main && npm run build:renderer && electron-builder",
    "test": "vitest --maxWorkers=2",
    "test:run": "vitest run --maxWorkers=2"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "electron": "^32.0.0",
    "electron-builder": "^25.0.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  },
  "dependencies": {
    "electron-store": "^10.0.0",
    "electron-updater": "^6.3.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  }
}
```

- [ ] **Step 4: Create config files**

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: { environment: 'node', maxWorkers: 2, include: ['tests/**/*.test.ts', 'src/**/*.test.ts'] },
})
```

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  root: '.',
  base: './',
  plugins: [react()],
  build: { outDir: 'dist/renderer' },
})
```

```json
// tsconfig.json  (renderer)
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "jsx": "react-jsx", "strict": true, "esModuleInterop": true,
    "skipLibCheck": true, "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"]
  },
  "include": ["src/renderer", "src/shared"]
}
```

```json
// tsconfig.node.json  (main process)
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "strict": true, "esModuleInterop": true, "skipLibCheck": true,
    "outDir": "dist/main", "rootDir": "src"
  },
  "include": ["src/main", "src/shared"]
}
```

```js
// tailwind.config.js
export default { content: ['./index.html', './src/renderer/**/*.{ts,tsx}'], theme: { extend: {} }, plugins: [] }
```

```js
// postcss.config.js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } }
```

- [ ] **Step 5: Create renderer entry files**

```html
<!-- index.html -->
<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Insta360 Link Controller</title></head>
<body><div id="root"></div><script type="module" src="/src/renderer/main.tsx"></script></body></html>
```

```tsx
// src/renderer/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
```

```tsx
// src/renderer/App.tsx
export default function App() {
  return <div className="p-6 text-lg">Insta360 Link Controller</div>
}
```

```css
/* src/renderer/index.css */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 6: Install and run the test**

Run: `npm install && npm run test:run`
Expected: PASS (smoke test green).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold electron+vite+react+ts+tailwind+vitest"
```

---

## Phase 1 — v4l2 adapter (pure logic first)

### Task 2: Shared types + device-discovery parser

**Files:**
- Create: `src/shared/types.ts`, `src/main/camera/v4l2-parse.ts`, `tests/fixtures/list-devices.txt`
- Test: `src/main/camera/v4l2-parse.test.ts`

**Interfaces:**
- Produces:
  - `interface Device { id: string; name: string; captureNode: string; nodes: string[] }`
  - `interface Control { name: string; kind: 'int'|'bool'|'menu'; value: number; min?: number; max?: number; step?: number; default?: number; menu?: Record<number,string>; inactive: boolean }`
  - `interface CameraSnapshot { device: Device; controls: Control[] }`
  - `type AiFraming = 'head'|'half'|'full'`
  - `type Scene = 'normal'|'deskview'|'whiteboard'|'overhead'`
  - `function parseListDevices(raw: string): Device[]` — filters to Insta360 Link cameras; `captureNode` = first `/dev/videoN` node; `id` = the USB bus token in parentheses.

- [ ] **Step 1: Capture the real fixture**

Create `tests/fixtures/list-devices.txt` with the exact captured output:

```
OBS Virtual Camera (platform:v4l2loopback-000):
	/dev/video0

Insta360 Link 2: Insta360 Link  (usb-0000:11:00.4-1.4.1.1):
	/dev/video1
	/dev/video2
	/dev/media0

Elgato Game Capture Neo: Elgato (usb-0000:11:00.4-1.4.3.3):
	/dev/video3
	/dev/video4
	/dev/media1

Insta360 Link 2 Pro: Insta360 L (usb-0000:11:00.4-1.4.3.4):
	/dev/video5
	/dev/video6
	/dev/media2
```

- [ ] **Step 2: Write the failing test**

```ts
// src/main/camera/v4l2-parse.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseListDevices } from './v4l2-parse'

const raw = readFileSync('tests/fixtures/list-devices.txt', 'utf8')

describe('parseListDevices', () => {
  it('returns only Insta360 Link cameras', () => {
    const d = parseListDevices(raw)
    expect(d.map((x) => x.name)).toEqual([
      'Insta360 Link 2: Insta360 Link',
      'Insta360 Link 2 Pro: Insta360 L',
    ])
  })
  it('picks the first video node as the capture node', () => {
    const d = parseListDevices(raw)
    expect(d[0].captureNode).toBe('/dev/video1')
    expect(d[1].captureNode).toBe('/dev/video5')
  })
  it('uses the USB token as a stable id', () => {
    expect(parseListDevices(raw)[0].id).toBe('usb-0000:11:00.4-1.4.1.1')
  })
  it('ignores non-video nodes for captureNode', () => {
    const d = parseListDevices(raw)
    expect(d[0].captureNode.startsWith('/dev/video')).toBe(true)
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run --maxWorkers=2 src/main/camera/v4l2-parse.test.ts`
Expected: FAIL ("parseListDevices is not a function").

- [ ] **Step 4: Implement types + parser**

```ts
// src/shared/types.ts
export interface Device { id: string; name: string; captureNode: string; nodes: string[] }
export interface Control {
  name: string
  kind: 'int' | 'bool' | 'menu'
  value: number
  min?: number; max?: number; step?: number; default?: number
  menu?: Record<number, string>
  inactive: boolean
}
export interface CameraSnapshot { device: Device; controls: Control[] }
export type AiFraming = 'head' | 'half' | 'full'
export type Scene = 'normal' | 'deskview' | 'whiteboard' | 'overhead'
```

```ts
// src/main/camera/v4l2-parse.ts
import type { Device } from '../../shared/types'

export function parseListDevices(raw: string): Device[] {
  const blocks = raw.split(/\n(?=\S)/) // split on non-indented header lines
  const devices: Device[] = []
  for (const block of blocks) {
    const lines = block.split('\n')
    const header = lines[0]
    if (!/Insta360 Link/i.test(header)) continue
    const idMatch = header.match(/\(([^)]*)\)\s*:/)
    const id = idMatch ? idMatch[1] : header.trim()
    const name = header.replace(/\s*\([^)]*\)\s*:\s*$/, '').trim()
    const nodes = lines
      .map((l) => l.trim())
      .filter((l) => l.startsWith('/dev/'))
    const captureNode = nodes.find((n) => n.startsWith('/dev/video')) ?? ''
    if (!captureNode) continue
    devices.push({ id, name, captureNode, nodes })
  }
  return devices
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run --maxWorkers=2 src/main/camera/v4l2-parse.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/main/camera/v4l2-parse.ts src/main/camera/v4l2-parse.test.ts tests/fixtures/list-devices.txt
git commit -m "feat(v4l2): parse list-devices into Insta360 Device list"
```

---

### Task 3: Control-descriptor parser

**Files:**
- Modify: `src/main/camera/v4l2-parse.ts`
- Create: `tests/fixtures/list-ctrls.txt`
- Test: `src/main/camera/v4l2-parse.test.ts` (add cases)

**Interfaces:**
- Consumes: `Control` from `src/shared/types.ts`.
- Produces: `function parseControls(raw: string): Control[]` — parses `v4l2-ctl --list-ctrls-menus` output into `Control[]`, including menu entries and the `inactive` flag.

- [ ] **Step 1: Create the fixture**

Create `tests/fixtures/list-ctrls.txt`:

```
User Controls

                     brightness 0x00980900 (int)    : min=0 max=100 step=1 default=50 value=50 flags=has-min-max
        white_balance_automatic 0x0098090c (bool)   : default=1 value=1
           power_line_frequency 0x00980918 (menu)   : min=0 max=2 default=3 value=2 (60 Hz)
				0: Disabled
				1: 50 Hz
				2: 60 Hz
      white_balance_temperature 0x0098091a (int)    : min=2000 max=10000 step=1 default=6400 value=3222 flags=inactive, has-min-max

Camera Controls

                   pan_absolute 0x009a0908 (int)    : min=-522000 max=522000 step=3600 default=0 value=0 flags=has-min-max
                  zoom_absolute 0x009a090d (int)    : min=100 max=400 step=1 default=100 value=257 flags=has-min-max
```

- [ ] **Step 2: Write failing tests**

```ts
// append to src/main/camera/v4l2-parse.test.ts
import { parseControls } from './v4l2-parse'
const ctrls = readFileSync('tests/fixtures/list-ctrls.txt', 'utf8')

describe('parseControls', () => {
  it('parses int controls with ranges', () => {
    const c = parseControls(ctrls).find((x) => x.name === 'brightness')!
    expect(c).toMatchObject({ kind: 'int', min: 0, max: 100, step: 1, default: 50, value: 50, inactive: false })
  })
  it('parses bool controls', () => {
    const c = parseControls(ctrls).find((x) => x.name === 'white_balance_automatic')!
    expect(c.kind).toBe('bool'); expect(c.value).toBe(1)
  })
  it('parses menu controls with entries', () => {
    const c = parseControls(ctrls).find((x) => x.name === 'power_line_frequency')!
    expect(c.kind).toBe('menu')
    expect(c.menu).toEqual({ 0: 'Disabled', 1: '50 Hz', 2: '60 Hz' })
  })
  it('flags inactive controls', () => {
    const c = parseControls(ctrls).find((x) => x.name === 'white_balance_temperature')!
    expect(c.inactive).toBe(true)
  })
  it('parses camera controls too', () => {
    expect(parseControls(ctrls).find((x) => x.name === 'zoom_absolute')!.max).toBe(400)
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run --maxWorkers=2 src/main/camera/v4l2-parse.test.ts`
Expected: FAIL ("parseControls is not a function").

- [ ] **Step 4: Implement `parseControls`**

```ts
// add to src/main/camera/v4l2-parse.ts
import type { Control } from '../../shared/types'

export function parseControls(raw: string): Control[] {
  const controls: Control[] = []
  const lines = raw.split('\n')
  const ctrlLine = /^\s*(\w+)\s+0x[0-9a-f]+\s+\((int|bool|menu)\)\s*:\s*(.*)$/
  let current: Control | null = null
  for (const line of lines) {
    const m = line.match(ctrlLine)
    if (m) {
      const [, name, kind, rest] = m
      const num = (key: string) => {
        const mm = rest.match(new RegExp(`${key}=(-?\\d+)`))
        return mm ? Number(mm[1]) : undefined
      }
      current = {
        name, kind: kind as Control['kind'],
        value: num('value') ?? 0,
        min: num('min'), max: num('max'), step: num('step'), default: num('default'),
        inactive: /flags=[^\n]*inactive/.test(rest),
        ...(kind === 'menu' ? { menu: {} } : {}),
      }
      controls.push(current)
      continue
    }
    const menuEntry = line.match(/^\s+(\d+):\s+(.*)$/)
    if (menuEntry && current && current.menu) {
      current.menu[Number(menuEntry[1])] = menuEntry[2].trim()
    }
  }
  return controls
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run --maxWorkers=2 src/main/camera/v4l2-parse.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/camera/v4l2-parse.ts src/main/camera/v4l2-parse.test.ts tests/fixtures/list-ctrls.txt
git commit -m "feat(v4l2): parse list-ctrls-menus into Control descriptors"
```

---

### Task 4: v4l2-ctl argv builder

**Files:**
- Create: `src/main/camera/v4l2-argv.ts`
- Test: `src/main/camera/v4l2-argv.test.ts`

**Interfaces:**
- Produces:
  - `function listDevicesArgv(): string[]` → `['--list-devices']`
  - `function listControlsArgv(dev: string): string[]` → `['-d', dev, '--list-ctrls-menus']`
  - `function setControlArgv(dev: string, name: string, value: number): string[]` → `['-d', dev, '--set-ctrl', 'name=value']`
  - `function getControlArgv(dev: string, name: string): string[]` → `['-d', dev, '--get-ctrl', name]`
  These return argv arrays (never a shell string) so the adapter can spawn without a shell.

- [ ] **Step 1: Write failing tests**

```ts
// src/main/camera/v4l2-argv.test.ts
import { describe, it, expect } from 'vitest'
import { listDevicesArgv, listControlsArgv, setControlArgv, getControlArgv } from './v4l2-argv'

describe('v4l2 argv', () => {
  it('lists devices', () => expect(listDevicesArgv()).toEqual(['--list-devices']))
  it('lists controls for a device', () =>
    expect(listControlsArgv('/dev/video1')).toEqual(['-d', '/dev/video1', '--list-ctrls-menus']))
  it('sets a control', () =>
    expect(setControlArgv('/dev/video1', 'zoom_absolute', 200))
      .toEqual(['-d', '/dev/video1', '--set-ctrl', 'zoom_absolute=200']))
  it('gets a control', () =>
    expect(getControlArgv('/dev/video1', 'pan_absolute'))
      .toEqual(['-d', '/dev/video1', '--get-ctrl', 'pan_absolute']))
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run --maxWorkers=2 src/main/camera/v4l2-argv.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/main/camera/v4l2-argv.ts
export function listDevicesArgv(): string[] { return ['--list-devices'] }
export function listControlsArgv(dev: string): string[] { return ['-d', dev, '--list-ctrls-menus'] }
export function setControlArgv(dev: string, name: string, value: number): string[] {
  return ['-d', dev, '--set-ctrl', `${name}=${value}`]
}
export function getControlArgv(dev: string, name: string): string[] {
  return ['-d', dev, '--get-ctrl', name]
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run --maxWorkers=2 src/main/camera/v4l2-argv.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/camera/v4l2-argv.ts src/main/camera/v4l2-argv.test.ts
git commit -m "feat(v4l2): build v4l2-ctl argv arrays"
```

---

### Task 5: v4l2 adapter (exec wrapper)

**Files:**
- Create: `src/main/camera/v4l2.ts`
- Test: `src/main/camera/v4l2.test.ts`

**Interfaces:**
- Consumes: parsers (Task 2/3), argv builders (Task 4).
- Produces a `V4l2Adapter` with an injectable runner so it is testable without hardware:
  - `type Runner = (bin: string, argv: string[]) => Promise<string>`
  - `class V4l2Adapter { constructor(run?: Runner); listDevices(): Promise<Device[]>; getControls(dev: string): Promise<Control[]>; setControl(dev: string, name: string, value: number): Promise<void>; }`
  - Default runner uses `execFile('v4l2-ctl', argv)`.

- [ ] **Step 1: Write failing tests (mock runner)**

```ts
// src/main/camera/v4l2.test.ts
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { V4l2Adapter } from './v4l2'

const devicesOut = readFileSync('tests/fixtures/list-devices.txt', 'utf8')
const ctrlsOut = readFileSync('tests/fixtures/list-ctrls.txt', 'utf8')

describe('V4l2Adapter', () => {
  it('lists devices via runner', async () => {
    const run = vi.fn().mockResolvedValue(devicesOut)
    const a = new V4l2Adapter(run)
    const d = await a.listDevices()
    expect(run).toHaveBeenCalledWith('v4l2-ctl', ['--list-devices'])
    expect(d).toHaveLength(2)
  })
  it('gets controls for a device', async () => {
    const run = vi.fn().mockResolvedValue(ctrlsOut)
    const a = new V4l2Adapter(run)
    const c = await a.getControls('/dev/video1')
    expect(run).toHaveBeenCalledWith('v4l2-ctl', ['-d', '/dev/video1', '--list-ctrls-menus'])
    expect(c.find((x) => x.name === 'zoom_absolute')).toBeTruthy()
  })
  it('sets a control', async () => {
    const run = vi.fn().mockResolvedValue('')
    await new V4l2Adapter(run).setControl('/dev/video1', 'zoom_absolute', 300)
    expect(run).toHaveBeenCalledWith('v4l2-ctl', ['-d', '/dev/video1', '--set-ctrl', 'zoom_absolute=300'])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run --maxWorkers=2 src/main/camera/v4l2.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the adapter**

```ts
// src/main/camera/v4l2.ts
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Device, Control } from '../../shared/types'
import { parseListDevices, parseControls } from './v4l2-parse'
import { listDevicesArgv, listControlsArgv, setControlArgv } from './v4l2-argv'

const pExecFile = promisify(execFile)
export type Runner = (bin: string, argv: string[]) => Promise<string>
const defaultRunner: Runner = async (bin, argv) => (await pExecFile(bin, argv)).stdout

export class V4l2Adapter {
  constructor(private run: Runner = defaultRunner) {}
  async listDevices(): Promise<Device[]> {
    return parseListDevices(await this.run('v4l2-ctl', listDevicesArgv()))
  }
  async getControls(dev: string): Promise<Control[]> {
    return parseControls(await this.run('v4l2-ctl', listControlsArgv(dev)))
  }
  async setControl(dev: string, name: string, value: number): Promise<void> {
    await this.run('v4l2-ctl', setControlArgv(dev, name, value))
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run --maxWorkers=2 src/main/camera/v4l2.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/camera/v4l2.ts src/main/camera/v4l2.test.ts
git commit -m "feat(v4l2): adapter with injectable runner over v4l2-ctl"
```

---

## Phase 2 — link-xu C helper + xu adapter

### Task 6: XU command → link-xu argv mapping

**Files:**
- Create: `src/main/camera/xu-argv.ts`
- Test: `src/main/camera/xu-argv.test.ts`

**Interfaces:**
- Consumes: `AiFraming`, `Scene` from shared types.
- Produces:
  - `type XuCommand = { kind: 'ai'; on: boolean } | { kind: 'framing'; mode: AiFraming } | { kind: 'scene'; scene: Scene } | { kind: 'preset-recall'; slot: number } | { kind: 'preset-save'; slot: number } | { kind: 'reset' }`
  - `function xuArgv(dev: string, cmd: XuCommand): string[]` — maps to `link-xu` argv, e.g. `[dev, 'ai', 'on']`, `[dev, 'framing', 'half']`, `[dev, 'preset', 'recall', '3']`, `[dev, 'reset']`. Throws on preset slot outside 1..6.

- [ ] **Step 1: Write failing tests**

```ts
// src/main/camera/xu-argv.test.ts
import { describe, it, expect } from 'vitest'
import { xuArgv } from './xu-argv'
const D = '/dev/video1'

describe('xuArgv', () => {
  it('ai on/off', () => {
    expect(xuArgv(D, { kind: 'ai', on: true })).toEqual([D, 'ai', 'on'])
    expect(xuArgv(D, { kind: 'ai', on: false })).toEqual([D, 'ai', 'off'])
  })
  it('framing', () => expect(xuArgv(D, { kind: 'framing', mode: 'half' })).toEqual([D, 'framing', 'half']))
  it('scene', () => expect(xuArgv(D, { kind: 'scene', scene: 'deskview' })).toEqual([D, 'scene', 'deskview']))
  it('preset recall/save', () => {
    expect(xuArgv(D, { kind: 'preset-recall', slot: 3 })).toEqual([D, 'preset', 'recall', '3'])
    expect(xuArgv(D, { kind: 'preset-save', slot: 6 })).toEqual([D, 'preset', 'save', '6'])
  })
  it('reset', () => expect(xuArgv(D, { kind: 'reset' })).toEqual([D, 'reset']))
  it('rejects invalid preset slots', () => {
    expect(() => xuArgv(D, { kind: 'preset-recall', slot: 0 })).toThrow()
    expect(() => xuArgv(D, { kind: 'preset-recall', slot: 7 })).toThrow()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run --maxWorkers=2 src/main/camera/xu-argv.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/main/camera/xu-argv.ts
import type { AiFraming, Scene } from '../../shared/types'

export type XuCommand =
  | { kind: 'ai'; on: boolean }
  | { kind: 'framing'; mode: AiFraming }
  | { kind: 'scene'; scene: Scene }
  | { kind: 'preset-recall'; slot: number }
  | { kind: 'preset-save'; slot: number }
  | { kind: 'reset' }

function assertSlot(slot: number) {
  if (!Number.isInteger(slot) || slot < 1 || slot > 6) throw new Error(`preset slot out of range: ${slot}`)
}

export function xuArgv(dev: string, cmd: XuCommand): string[] {
  switch (cmd.kind) {
    case 'ai': return [dev, 'ai', cmd.on ? 'on' : 'off']
    case 'framing': return [dev, 'framing', cmd.mode]
    case 'scene': return [dev, 'scene', cmd.scene]
    case 'preset-recall': assertSlot(cmd.slot); return [dev, 'preset', 'recall', String(cmd.slot)]
    case 'preset-save': assertSlot(cmd.slot); return [dev, 'preset', 'save', String(cmd.slot)]
    case 'reset': return [dev, 'reset']
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run --maxWorkers=2 src/main/camera/xu-argv.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/camera/xu-argv.ts src/main/camera/xu-argv.test.ts
git commit -m "feat(xu): map XU commands to link-xu argv"
```

---

### Task 7: link-xu C helper

**Files:**
- Create: `native/link-xu/link-xu.c`, `native/link-xu/Makefile`
- Test: manual compile + `--help` (documented); no Vitest (C binary).

**Interfaces:**
- Produces a `link-xu` binary. CLI: `link-xu <dev> ai on|off | framing head|half|full | scene normal|deskview|whiteboard|overhead | preset recall|save <1-6> | reset`. Exit 0 on success, non-zero with stderr message on failure. `link-xu --help` prints usage and exits 0.

> **Porting note (Open item from spec):** The exact XU unit id, control selector, and byte payloads must be transcribed from the original project's `uinsta360link.pas` and verified against hardware in Task 15. This task lays down the CLI + ioctl plumbing with clearly marked payload tables to fill in. Use `UVCIOC_CTRL_QUERY` with `UVC_SET_CUR`. If a Link 1 vs Link 2 payload differs, branch on an env/arg later; for now target Link 2.

- [ ] **Step 1: Write the C helper skeleton with ioctl plumbing**

```c
/* native/link-xu/link-xu.c */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <fcntl.h>
#include <unistd.h>
#include <errno.h>
#include <sys/ioctl.h>
#include <linux/uvcvideo.h>
#include <linux/usb/video.h>

/* XU unit id and selector — VERIFY against original uinsta360link.pas (Task 15). */
#define XU_UNIT_ID 4

/* Send a SET_CUR to the XU. selector + payload come from the command tables below. */
static int xu_set(const char *dev, uint8_t selector, const uint8_t *data, uint16_t len) {
    int fd = open(dev, O_RDWR);
    if (fd < 0) { fprintf(stderr, "open %s: %s\n", dev, strerror(errno)); return 2; }
    struct uvc_xu_control_query q;
    memset(&q, 0, sizeof(q));
    q.unit = XU_UNIT_ID;
    q.selector = selector;
    q.query = UVC_SET_CUR;
    q.size = len;
    q.data = (uint8_t *)data;
    int rc = ioctl(fd, UVCIOC_CTRL_QUERY, &q);
    if (rc < 0) fprintf(stderr, "ioctl UVCIOC_CTRL_QUERY: %s\n", strerror(errno));
    close(fd);
    return rc < 0 ? 3 : 0;
}

static void usage(void) {
    printf("usage: link-xu <dev> <command>\n"
           "  ai on|off\n  framing head|half|full\n"
           "  scene normal|deskview|whiteboard|overhead\n"
           "  preset recall|save <1-6>\n  reset\n");
}

/* ---- Command payload tables: FILL IN verified selectors/bytes (Task 15) ----
   Each entry is {selector, {bytes...}, len}. Placeholders are marked TODO-HW
   and MUST be replaced with values transcribed from the original project. */

int main(int argc, char **argv) {
    if (argc == 2 && strcmp(argv[1], "--help") == 0) { usage(); return 0; }
    if (argc < 3) { usage(); return 1; }
    const char *dev = argv[1];
    const char *cmd = argv[2];

    /* NOTE: selector/payload values below are structural placeholders.
       Task 15 replaces each xu_set(...) payload with hardware-verified bytes. */
    if (strcmp(cmd, "ai") == 0 && argc == 4) {
        uint8_t on = strcmp(argv[3], "on") == 0 ? 1 : 0;
        uint8_t data[2] = { /*TODO-HW selector-specific*/ on, 0 };
        return xu_set(dev, /*TODO-HW selector*/ 0x01, data, sizeof(data));
    }
    if (strcmp(cmd, "framing") == 0 && argc == 4) {
        uint8_t m = strcmp(argv[3], "head") == 0 ? 0 : strcmp(argv[3], "half") == 0 ? 1 : 2;
        uint8_t data[2] = { m, 0 };
        return xu_set(dev, /*TODO-HW selector*/ 0x02, data, sizeof(data));
    }
    if (strcmp(cmd, "scene") == 0 && argc == 4) {
        uint8_t s = !strcmp(argv[3],"normal")?0:!strcmp(argv[3],"deskview")?1:!strcmp(argv[3],"whiteboard")?2:3;
        uint8_t data[2] = { s, 0 };
        return xu_set(dev, /*TODO-HW selector*/ 0x03, data, sizeof(data));
    }
    if (strcmp(cmd, "preset") == 0 && argc == 5) {
        int slot = atoi(argv[4]);
        if (slot < 1 || slot > 6) { fprintf(stderr, "slot out of range\n"); return 1; }
        uint8_t save = strcmp(argv[3], "save") == 0 ? 1 : 0;
        uint8_t data[2] = { (uint8_t)slot, save };
        return xu_set(dev, /*TODO-HW selector*/ 0x04, data, sizeof(data));
    }
    if (strcmp(cmd, "reset") == 0) {
        uint8_t data[1] = { 1 };
        return xu_set(dev, /*TODO-HW selector*/ 0x05, data, sizeof(data));
    }
    usage();
    return 1;
}
```

- [ ] **Step 2: Write the Makefile**

```makefile
# native/link-xu/Makefile
CC ?= gcc
CFLAGS ?= -O2 -Wall -Wextra
link-xu: link-xu.c
	$(CC) $(CFLAGS) -o link-xu link-xu.c
clean:
	rm -f link-xu
.PHONY: clean
```

- [ ] **Step 3: Compile and smoke-test**

Run: `make -C native/link-xu && ./native/link-xu/link-xu --help`
Expected: compiles clean; prints usage; exit 0.

- [ ] **Step 4: Verify a bad-args path returns non-zero**

Run: `./native/link-xu/link-xu /dev/video1 bogus; echo "exit=$?"`
Expected: usage printed, `exit=1`.

- [ ] **Step 5: Commit**

```bash
git add native/link-xu/link-xu.c native/link-xu/Makefile
git commit -m "feat(xu): link-xu C helper with UVC XU ioctl plumbing (payloads TBD-HW)"
```

---

### Task 8: xu adapter (spawns link-xu)

**Files:**
- Create: `src/main/camera/xu.ts`
- Test: `src/main/camera/xu.test.ts`

**Interfaces:**
- Consumes: `xuArgv`, `XuCommand` (Task 6).
- Produces:
  - `class XuAdapter { constructor(binPath: string, run?: Runner); send(dev: string, cmd: XuCommand): Promise<void> }` reusing `Runner` type shape `(bin, argv) => Promise<string>`.
  - Default runner spawns the `link-xu` binary at `binPath`. `binPath` is resolved by the service (Task 10) from `process.resourcesPath` in production or `native/link-xu/link-xu` in dev.

- [ ] **Step 1: Write failing tests (mock runner)**

```ts
// src/main/camera/xu.test.ts
import { describe, it, expect, vi } from 'vitest'
import { XuAdapter } from './xu'

describe('XuAdapter', () => {
  it('spawns link-xu with mapped argv', async () => {
    const run = vi.fn().mockResolvedValue('')
    const a = new XuAdapter('/opt/link-xu', run)
    await a.send('/dev/video1', { kind: 'framing', mode: 'full' })
    expect(run).toHaveBeenCalledWith('/opt/link-xu', ['/dev/video1', 'framing', 'full'])
  })
  it('propagates preset validation errors', async () => {
    const run = vi.fn().mockResolvedValue('')
    const a = new XuAdapter('/opt/link-xu', run)
    await expect(a.send('/dev/video1', { kind: 'preset-recall', slot: 9 })).rejects.toThrow()
    expect(run).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run --maxWorkers=2 src/main/camera/xu.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/main/camera/xu.ts
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { xuArgv, type XuCommand } from './xu-argv'

const pExecFile = promisify(execFile)
export type Runner = (bin: string, argv: string[]) => Promise<string>
const defaultRunner: Runner = async (bin, argv) => (await pExecFile(bin, argv)).stdout

export class XuAdapter {
  constructor(private binPath: string, private run: Runner = defaultRunner) {}
  async send(dev: string, cmd: XuCommand): Promise<void> {
    const argv = xuArgv(dev, cmd) // throws before spawn on invalid input
    await this.run(this.binPath, argv)
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run --maxWorkers=2 src/main/camera/xu.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/camera/xu.ts src/main/camera/xu.test.ts
git commit -m "feat(xu): adapter spawning link-xu with validated argv"
```

---

## Phase 3 — service, presets, IPC, preload

### Task 9: App-side preset store

**Files:**
- Create: `src/main/camera/presets.ts`
- Test: `src/main/camera/presets.test.ts`

**Interfaces:**
- Produces:
  - `interface AppPreset { name: string; values: Record<string, number> }`
  - `class PresetStore { constructor(backend?: Map<string, AppPreset[]>); list(deviceId: string): AppPreset[]; save(deviceId: string, p: AppPreset): void; remove(deviceId: string, name: string): void }`
  - Uses an in-memory `Map` backend by default (injected in tests); the service wires it to `electron-store`. Saving a preset with an existing name overwrites it.

- [ ] **Step 1: Write failing tests**

```ts
// src/main/camera/presets.test.ts
import { describe, it, expect } from 'vitest'
import { PresetStore } from './presets'

describe('PresetStore', () => {
  it('saves and lists presets per device', () => {
    const s = new PresetStore()
    s.save('cam1', { name: 'Desk', values: { zoom_absolute: 200 } })
    expect(s.list('cam1')).toEqual([{ name: 'Desk', values: { zoom_absolute: 200 } }])
    expect(s.list('cam2')).toEqual([])
  })
  it('overwrites a preset with the same name', () => {
    const s = new PresetStore()
    s.save('cam1', { name: 'Desk', values: { zoom_absolute: 100 } })
    s.save('cam1', { name: 'Desk', values: { zoom_absolute: 400 } })
    expect(s.list('cam1')).toHaveLength(1)
    expect(s.list('cam1')[0].values.zoom_absolute).toBe(400)
  })
  it('removes a preset', () => {
    const s = new PresetStore()
    s.save('cam1', { name: 'Desk', values: {} })
    s.remove('cam1', 'Desk')
    expect(s.list('cam1')).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run --maxWorkers=2 src/main/camera/presets.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/main/camera/presets.ts
export interface AppPreset { name: string; values: Record<string, number> }

export class PresetStore {
  constructor(private backend: Map<string, AppPreset[]> = new Map()) {}
  list(deviceId: string): AppPreset[] { return this.backend.get(deviceId) ?? [] }
  save(deviceId: string, p: AppPreset): void {
    const arr = this.list(deviceId).filter((x) => x.name !== p.name)
    arr.push(p)
    this.backend.set(deviceId, arr)
  }
  remove(deviceId: string, name: string): void {
    this.backend.set(deviceId, this.list(deviceId).filter((x) => x.name !== name))
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run --maxWorkers=2 src/main/camera/presets.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/camera/presets.ts src/main/camera/presets.test.ts
git commit -m "feat(presets): app-side preset store with per-device overwrite"
```

---

### Task 10: CameraService orchestrator

**Files:**
- Create: `src/main/camera/service.ts`
- Test: `src/main/camera/service.test.ts`

**Interfaces:**
- Consumes: `V4l2Adapter`, `XuAdapter`, `PresetStore`, `XuCommand`, shared types.
- Produces `class CameraService` (adapters injected for tests):
  - `constructor(v4l2: V4l2Adapter, xu: XuAdapter, presets: PresetStore)`
  - `listDevices(): Promise<Device[]>`
  - `getSnapshot(dev: string): Promise<Control[]>`
  - `setControl(dev: string, name: string, value: number): Promise<void>`
  - `setAi(dev: string, on: boolean): Promise<void>`
  - `setFraming(dev: string, mode: AiFraming): Promise<void>`
  - `setScene(dev: string, scene: Scene): Promise<void>`
  - `recallHwPreset(dev: string, slot: number): Promise<void>` / `saveHwPreset(dev, slot)` / `reset(dev)`
  - `listAppPresets(deviceId: string): AppPreset[]`
  - `saveAppPreset(deviceId: string, name: string, values: Record<string,number>): void`
  - `applyAppPreset(dev: string, deviceId: string, name: string): Promise<void>` — replays `setControl` for each saved value.
  - `removeAppPreset(deviceId: string, name: string): void`

- [ ] **Step 1: Write failing tests (mock adapters)**

```ts
// src/main/camera/service.test.ts
import { describe, it, expect, vi } from 'vitest'
import { CameraService } from './service'
import { PresetStore } from './presets'

function makeService() {
  const v4l2 = { listDevices: vi.fn(), getControls: vi.fn(), setControl: vi.fn().mockResolvedValue(undefined) } as any
  const xu = { send: vi.fn().mockResolvedValue(undefined) } as any
  const svc = new CameraService(v4l2, xu, new PresetStore())
  return { svc, v4l2, xu }
}

describe('CameraService', () => {
  it('routes AI toggle to xu adapter', async () => {
    const { svc, xu } = makeService()
    await svc.setAi('/dev/video1', true)
    expect(xu.send).toHaveBeenCalledWith('/dev/video1', { kind: 'ai', on: true })
  })
  it('routes scene to xu adapter', async () => {
    const { svc, xu } = makeService()
    await svc.setScene('/dev/video1', 'whiteboard')
    expect(xu.send).toHaveBeenCalledWith('/dev/video1', { kind: 'scene', scene: 'whiteboard' })
  })
  it('applies an app preset by replaying setControl', async () => {
    const { svc, v4l2 } = makeService()
    svc.saveAppPreset('cam1', 'Desk', { zoom_absolute: 250, pan_absolute: 0 })
    await svc.applyAppPreset('/dev/video1', 'cam1', 'Desk')
    expect(v4l2.setControl).toHaveBeenCalledWith('/dev/video1', 'zoom_absolute', 250)
    expect(v4l2.setControl).toHaveBeenCalledWith('/dev/video1', 'pan_absolute', 0)
  })
  it('throws applying an unknown preset', async () => {
    const { svc } = makeService()
    await expect(svc.applyAppPreset('/dev/video1', 'cam1', 'Nope')).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run --maxWorkers=2 src/main/camera/service.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/main/camera/service.ts
import type { Device, Control, AiFraming, Scene } from '../../shared/types'
import type { V4l2Adapter } from './v4l2'
import type { XuAdapter } from './xu'
import { PresetStore, type AppPreset } from './presets'

export class CameraService {
  constructor(private v4l2: V4l2Adapter, private xu: XuAdapter, private presets: PresetStore) {}

  listDevices(): Promise<Device[]> { return this.v4l2.listDevices() }
  getSnapshot(dev: string): Promise<Control[]> { return this.v4l2.getControls(dev) }
  setControl(dev: string, name: string, value: number): Promise<void> {
    return this.v4l2.setControl(dev, name, value)
  }
  setAi(dev: string, on: boolean) { return this.xu.send(dev, { kind: 'ai', on }) }
  setFraming(dev: string, mode: AiFraming) { return this.xu.send(dev, { kind: 'framing', mode }) }
  setScene(dev: string, scene: Scene) { return this.xu.send(dev, { kind: 'scene', scene }) }
  recallHwPreset(dev: string, slot: number) { return this.xu.send(dev, { kind: 'preset-recall', slot }) }
  saveHwPreset(dev: string, slot: number) { return this.xu.send(dev, { kind: 'preset-save', slot }) }
  reset(dev: string) { return this.xu.send(dev, { kind: 'reset' }) }

  listAppPresets(deviceId: string): AppPreset[] { return this.presets.list(deviceId) }
  saveAppPreset(deviceId: string, name: string, values: Record<string, number>) {
    this.presets.save(deviceId, { name, values })
  }
  removeAppPreset(deviceId: string, name: string) { this.presets.remove(deviceId, name) }
  async applyAppPreset(dev: string, deviceId: string, name: string) {
    const preset = this.presets.list(deviceId).find((p) => p.name === name)
    if (!preset) throw new Error(`unknown preset: ${name}`)
    for (const [k, v] of Object.entries(preset.values)) await this.v4l2.setControl(dev, k, v)
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run --maxWorkers=2 src/main/camera/service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/camera/service.ts src/main/camera/service.test.ts
git commit -m "feat(service): CameraService orchestrating v4l2 + xu + presets"
```

---

### Task 11: IPC channel contract + handlers + preload bridge

**Files:**
- Create: `src/shared/ipc.ts`, `src/main/ipc.ts`, `src/main/preload.ts`
- Test: `src/shared/ipc.test.ts`

**Interfaces:**
- Produces:
  - `src/shared/ipc.ts`: `const CH = { listDevices:'camera:list', getSnapshot:'camera:snapshot', setControl:'camera:setControl', setAi:'camera:setAi', setFraming:'camera:setFraming', setScene:'camera:setScene', recallHwPreset:'camera:recallHwPreset', saveHwPreset:'camera:saveHwPreset', reset:'camera:reset', listAppPresets:'camera:listAppPresets', saveAppPreset:'camera:saveAppPreset', applyAppPreset:'camera:applyAppPreset', removeAppPreset:'camera:removeAppPreset' } as const` plus `type CameraApi` interface describing the renderer-facing methods.
  - `registerIpc(ipcMain, service)` in `src/main/ipc.ts` wiring each channel to a `CameraService` method.
  - `preload.ts` exposing `window.cameraApi` implementing `CameraApi` via `ipcRenderer.invoke`.

- [ ] **Step 1: Write failing test for the channel map + registration**

```ts
// src/shared/ipc.test.ts
import { describe, it, expect, vi } from 'vitest'
import { CH } from './ipc'
import { registerIpc } from '../main/ipc'

describe('ipc channels', () => {
  it('has a stable channel for every camera action', () => {
    expect(CH.listDevices).toBe('camera:list')
    expect(CH.setControl).toBe('camera:setControl')
    expect(Object.values(CH).every((c) => c.startsWith('camera:'))).toBe(true)
  })
  it('registers a handler for each channel', () => {
    const handlers: Record<string, unknown> = {}
    const ipcMain = { handle: (ch: string, fn: unknown) => { handlers[ch] = fn } }
    const service = {
      listDevices: vi.fn(), getSnapshot: vi.fn(), setControl: vi.fn(),
      setAi: vi.fn(), setFraming: vi.fn(), setScene: vi.fn(),
      recallHwPreset: vi.fn(), saveHwPreset: vi.fn(), reset: vi.fn(),
      listAppPresets: vi.fn(), saveAppPreset: vi.fn(), applyAppPreset: vi.fn(), removeAppPreset: vi.fn(),
    }
    registerIpc(ipcMain as any, service as any)
    for (const ch of Object.values(CH)) expect(handlers[ch]).toBeTypeOf('function')
  })
  it('invokes the service when a handler is called', async () => {
    const handlers: Record<string, Function> = {}
    const ipcMain = { handle: (ch: string, fn: Function) => { handlers[ch] = fn } }
    const service = { setControl: vi.fn().mockResolvedValue(undefined) } as any
    // register a minimal service; others default to no-op
    registerIpc(ipcMain as any, { ...service,
      listDevices: vi.fn(), getSnapshot: vi.fn(), setAi: vi.fn(), setFraming: vi.fn(),
      setScene: vi.fn(), recallHwPreset: vi.fn(), saveHwPreset: vi.fn(), reset: vi.fn(),
      listAppPresets: vi.fn(), saveAppPreset: vi.fn(), applyAppPreset: vi.fn(), removeAppPreset: vi.fn() })
    await handlers[CH.setControl]({}, '/dev/video1', 'zoom_absolute', 300)
    expect(service.setControl).toHaveBeenCalledWith('/dev/video1', 'zoom_absolute', 300)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run --maxWorkers=2 src/shared/ipc.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `src/shared/ipc.ts`**

```ts
// src/shared/ipc.ts
import type { Device, Control, AiFraming, Scene } from './types'
import type { AppPreset } from '../main/camera/presets'

export const CH = {
  listDevices: 'camera:list',
  getSnapshot: 'camera:snapshot',
  setControl: 'camera:setControl',
  setAi: 'camera:setAi',
  setFraming: 'camera:setFraming',
  setScene: 'camera:setScene',
  recallHwPreset: 'camera:recallHwPreset',
  saveHwPreset: 'camera:saveHwPreset',
  reset: 'camera:reset',
  listAppPresets: 'camera:listAppPresets',
  saveAppPreset: 'camera:saveAppPreset',
  applyAppPreset: 'camera:applyAppPreset',
  removeAppPreset: 'camera:removeAppPreset',
} as const

export interface CameraApi {
  listDevices(): Promise<Device[]>
  getSnapshot(dev: string): Promise<Control[]>
  setControl(dev: string, name: string, value: number): Promise<void>
  setAi(dev: string, on: boolean): Promise<void>
  setFraming(dev: string, mode: AiFraming): Promise<void>
  setScene(dev: string, scene: Scene): Promise<void>
  recallHwPreset(dev: string, slot: number): Promise<void>
  saveHwPreset(dev: string, slot: number): Promise<void>
  reset(dev: string): Promise<void>
  listAppPresets(deviceId: string): Promise<AppPreset[]>
  saveAppPreset(deviceId: string, name: string, values: Record<string, number>): Promise<void>
  applyAppPreset(dev: string, deviceId: string, name: string): Promise<void>
  removeAppPreset(deviceId: string, name: string): Promise<void>
}
```

- [ ] **Step 4: Implement `src/main/ipc.ts`**

```ts
// src/main/ipc.ts
import type { IpcMain } from 'electron'
import { CH } from '../shared/ipc'
import type { CameraService } from './camera/service'

export function registerIpc(ipcMain: IpcMain, s: CameraService) {
  ipcMain.handle(CH.listDevices, () => s.listDevices())
  ipcMain.handle(CH.getSnapshot, (_e, dev: string) => s.getSnapshot(dev))
  ipcMain.handle(CH.setControl, (_e, dev: string, name: string, value: number) => s.setControl(dev, name, value))
  ipcMain.handle(CH.setAi, (_e, dev: string, on: boolean) => s.setAi(dev, on))
  ipcMain.handle(CH.setFraming, (_e, dev: string, mode) => s.setFraming(dev, mode))
  ipcMain.handle(CH.setScene, (_e, dev: string, scene) => s.setScene(dev, scene))
  ipcMain.handle(CH.recallHwPreset, (_e, dev: string, slot: number) => s.recallHwPreset(dev, slot))
  ipcMain.handle(CH.saveHwPreset, (_e, dev: string, slot: number) => s.saveHwPreset(dev, slot))
  ipcMain.handle(CH.reset, (_e, dev: string) => s.reset(dev))
  ipcMain.handle(CH.listAppPresets, (_e, id: string) => s.listAppPresets(id))
  ipcMain.handle(CH.saveAppPreset, (_e, id: string, name: string, values) => s.saveAppPreset(id, name, values))
  ipcMain.handle(CH.applyAppPreset, (_e, dev: string, id: string, name: string) => s.applyAppPreset(dev, id, name))
  ipcMain.handle(CH.removeAppPreset, (_e, id: string, name: string) => s.removeAppPreset(id, name))
}
```

- [ ] **Step 5: Implement `src/main/preload.ts`**

```ts
// src/main/preload.ts
import { contextBridge, ipcRenderer } from 'electron'
import { CH, type CameraApi } from '../shared/ipc'

const api: CameraApi = {
  listDevices: () => ipcRenderer.invoke(CH.listDevices),
  getSnapshot: (dev) => ipcRenderer.invoke(CH.getSnapshot, dev),
  setControl: (dev, name, value) => ipcRenderer.invoke(CH.setControl, dev, name, value),
  setAi: (dev, on) => ipcRenderer.invoke(CH.setAi, dev, on),
  setFraming: (dev, mode) => ipcRenderer.invoke(CH.setFraming, dev, mode),
  setScene: (dev, scene) => ipcRenderer.invoke(CH.setScene, dev, scene),
  recallHwPreset: (dev, slot) => ipcRenderer.invoke(CH.recallHwPreset, dev, slot),
  saveHwPreset: (dev, slot) => ipcRenderer.invoke(CH.saveHwPreset, dev, slot),
  reset: (dev) => ipcRenderer.invoke(CH.reset, dev),
  listAppPresets: (id) => ipcRenderer.invoke(CH.listAppPresets, id),
  saveAppPreset: (id, name, values) => ipcRenderer.invoke(CH.saveAppPreset, id, name, values),
  applyAppPreset: (dev, id, name) => ipcRenderer.invoke(CH.applyAppPreset, dev, id, name),
  removeAppPreset: (id, name) => ipcRenderer.invoke(CH.removeAppPreset, id, name),
}
contextBridge.exposeInMainWorld('cameraApi', api)
```

- [ ] **Step 6: Run to verify pass**

Run: `npx vitest run --maxWorkers=2 src/shared/ipc.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/shared/ipc.ts src/shared/ipc.test.ts src/main/ipc.ts src/main/preload.ts
git commit -m "feat(ipc): typed channel contract, handlers, and preload bridge"
```

---

### Task 12: Electron main bootstrap + updater + wiring

**Files:**
- Create: `src/main/main.ts`
- Modify: none
- Test: manual launch (no Vitest; requires Electron runtime).

**Interfaces:**
- Consumes: `CameraService`, `V4l2Adapter`, `XuAdapter`, `PresetStore`, `registerIpc`, `electron-store`, `electron-updater`.
- Produces the running app: creates the service (resolving `link-xu` path), registers IPC, creates the BrowserWindow with the preload, loads the renderer, and wires `electron-updater` on packaged builds.

- [ ] **Step 1: Implement main bootstrap**

```ts
// src/main/main.ts
import { app, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import Store from 'electron-store'
import electronUpdater from 'electron-updater'
import { V4l2Adapter } from './camera/v4l2'
import { XuAdapter } from './camera/xu'
import { PresetStore, type AppPreset } from './camera/presets'
import { CameraService } from './camera/service'
import { registerIpc } from './ipc'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function resolveLinkXu(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'link-xu')
    : path.join(__dirname, '../../native/link-xu/link-xu')
}

function buildService(): CameraService {
  const store = new Store<{ presets: Record<string, AppPreset[]> }>({ defaults: { presets: {} }})
  const backend = new Map<string, AppPreset[]>(Object.entries(store.get('presets')))
  const presets = new PresetStore(backend)
  // persist on every mutation by re-serializing the map
  const persist = () => store.set('presets', Object.fromEntries(backend))
  const wrapped = new Proxy(presets, {
    get(target, prop, recv) {
      const val = Reflect.get(target, prop, recv)
      if (typeof val === 'function' && (prop === 'save' || prop === 'remove')) {
        return (...args: unknown[]) => { const r = (val as Function).apply(target, args); persist(); return r }
      }
      return typeof val === 'function' ? val.bind(target) : val
    },
  }) as PresetStore
  return new CameraService(new V4l2Adapter(), new XuAdapter(resolveLinkXu()), wrapped)
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1180, height: 780, minWidth: 960, minHeight: 640,
    backgroundColor: '#0b0b0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  })
  if (app.isPackaged) win.loadFile(path.join(__dirname, '../renderer/index.html'))
  else win.loadURL(process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173')
}

app.whenReady().then(() => {
  registerIpc(ipcMain, buildService())
  createWindow()
  if (app.isPackaged) electronUpdater.autoUpdater.checkForUpdatesAndNotify()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
```

- [ ] **Step 2: Build main + preload**

Run: `npm run build:main`
Expected: `dist/main/main.js` and `dist/main/preload.js` produced with no TS errors.

- [ ] **Step 3: Launch against the dev server**

Run: in one terminal `npm run dev`; in another `VITE_DEV_SERVER_URL=http://localhost:5173 npx electron dist/main/main.js`
Expected: window opens showing the renderer; no console errors about preload or `cameraApi`.

- [ ] **Step 4: Commit**

```bash
git add src/main/main.ts
git commit -m "feat(main): electron bootstrap wiring service, IPC, preload, updater"
```

---

## Phase 4 — Renderer UI

### Task 13: Renderer API wrapper + state hook + shadcn setup

**Files:**
- Create: `src/renderer/api.ts`, `src/renderer/useCamera.ts`, `src/renderer/components/ui/` (shadcn primitives: button, slider, switch, select, card, tabs), `src/renderer/lib/utils.ts`
- Modify: `src/renderer/App.tsx`, `tailwind.config.js` (shadcn tokens)
- Test: `src/renderer/useCamera.test.ts`

**Interfaces:**
- Consumes: `window.cameraApi` (`CameraApi`).
- Produces:
  - `src/renderer/api.ts`: `export const cameraApi: CameraApi = window.cameraApi` with a typed `declare global` for `window`.
  - `useCamera()` hook returning `{ devices, current, controls, selectDevice, refresh, setControl, setAi, setFraming, setScene, recallHwPreset, ... }`. `setControl` updates local state optimistically then calls the API (debounced 60ms per control name).

> shadcn/ui setup: add primitives by copying from the shadcn CLI output OR hand-create the minimal Radix-based components listed. Install `@radix-ui/react-slider`, `@radix-ui/react-switch`, `@radix-ui/react-select`, `@radix-ui/react-tabs`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`.

- [ ] **Step 1: Write failing test for the debounce/optimistic hook logic**

Extract the debounce into a pure helper so it is unit-testable:

```ts
// src/renderer/useCamera.test.ts
import { describe, it, expect, vi } from 'vitest'
import { makeDebouncer } from './debounce'

describe('makeDebouncer', () => {
  it('coalesces rapid calls per key', async () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const d = makeDebouncer(fn, 60)
    d('zoom_absolute', 100); d('zoom_absolute', 200); d('zoom_absolute', 300)
    vi.advanceTimersByTime(60)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('zoom_absolute', 300)
    vi.useRealTimers()
  })
  it('keeps different keys independent', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const d = makeDebouncer(fn, 60)
    d('zoom_absolute', 100); d('pan_absolute', 5)
    vi.advanceTimersByTime(60)
    expect(fn).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run --maxWorkers=2 src/renderer/useCamera.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the debouncer**

```ts
// src/renderer/debounce.ts
export function makeDebouncer<T extends unknown[]>(fn: (...args: T) => void, ms: number) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  return (key: string, ...rest: unknown[]) => {
    const existing = timers.get(key)
    if (existing) clearTimeout(existing)
    timers.set(key, setTimeout(() => { timers.delete(key); fn(key, ...(rest as unknown[]) as any) }, ms))
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run --maxWorkers=2 src/renderer/useCamera.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement `api.ts` and `useCamera.ts`**

```ts
// src/renderer/api.ts
import type { CameraApi } from '../shared/ipc'
declare global { interface Window { cameraApi: CameraApi } }
export const cameraApi: CameraApi = window.cameraApi
```

```ts
// src/renderer/useCamera.ts
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Device, Control, AiFraming, Scene } from '../shared/types'
import { cameraApi } from './api'
import { makeDebouncer } from './debounce'

export function useCamera() {
  const [devices, setDevices] = useState<Device[]>([])
  const [current, setCurrent] = useState<Device | null>(null)
  const [controls, setControls] = useState<Control[]>([])

  const refreshDevices = useCallback(async () => {
    const d = await cameraApi.listDevices()
    setDevices(d)
    setCurrent((c) => c ?? d[0] ?? null)
  }, [])

  const refresh = useCallback(async () => {
    if (!current) return
    setControls(await cameraApi.getSnapshot(current.captureNode))
  }, [current])

  useEffect(() => { refreshDevices() }, [refreshDevices])
  useEffect(() => { refresh() }, [refresh])

  const debouncedWrite = useMemo(
    () => makeDebouncer((name: string, value: number) => {
      if (current) cameraApi.setControl(current.captureNode, name, value)
    }, 60),
    [current],
  )

  const setControl = useCallback((name: string, value: number) => {
    setControls((cs) => cs.map((c) => (c.name === name ? { ...c, value } : c)))
    debouncedWrite(name, value)
  }, [debouncedWrite])

  const dev = current?.captureNode ?? ''
  return {
    devices, current, controls,
    selectDevice: setCurrent, refresh,
    setControl,
    setAi: (on: boolean) => cameraApi.setAi(dev, on),
    setFraming: (m: AiFraming) => cameraApi.setFraming(dev, m),
    setScene: (s: Scene) => cameraApi.setScene(dev, s),
    recallHwPreset: (slot: number) => cameraApi.recallHwPreset(dev, slot),
    reset: () => cameraApi.reset(dev),
  }
}
```

- [ ] **Step 6: Add shadcn primitives + tailwind tokens**

Install deps and create `src/renderer/lib/utils.ts` with `cn()` and the `ui/` primitives (button, slider, switch, select, tabs, card). Update `tailwind.config.js` `content` and theme tokens per shadcn. Verify the renderer still builds:

Run: `npm install @radix-ui/react-slider @radix-ui/react-switch @radix-ui/react-select @radix-ui/react-tabs class-variance-authority clsx tailwind-merge lucide-react && npm run build:renderer`
Expected: renderer builds with no errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(renderer): typed api wrapper, useCamera hook, shadcn primitives"
```

---

### Task 14: UI components + layout

**Files:**
- Create: `src/renderer/components/CameraPicker.tsx`, `PreviewPane.tsx`, `PtzPad.tsx`, `ImageSettings.tsx`, `AiTracking.tsx`, `SceneModes.tsx`, `Presets.tsx`
- Modify: `src/renderer/App.tsx`
- Test: `src/renderer/components/ImageSettings.control.test.ts` (pure control→widget mapping helper)

**Interfaces:**
- Consumes: `useCamera()`, shadcn primitives, `Control` type.
- Produces the assembled UI. Preview uses `getUserMedia({ video: { deviceId } })` mapping the selected camera; on failure shows the "camera in use" placeholder.

- [ ] **Step 1: Write failing test for the control→widget mapping helper**

```ts
// src/renderer/components/ImageSettings.control.test.ts
import { describe, it, expect } from 'vitest'
import { widgetFor } from './widget'
import type { Control } from '../../shared/types'

const int: Control = { name: 'brightness', kind: 'int', value: 50, min: 0, max: 100, step: 1, inactive: false }
const bool: Control = { name: 'wb_auto', kind: 'bool', value: 1, inactive: false }
const menu: Control = { name: 'plf', kind: 'menu', value: 2, menu: { 0: 'Off', 1: '50', 2: '60' }, inactive: false }

describe('widgetFor', () => {
  it('maps int to slider', () => expect(widgetFor(int)).toBe('slider'))
  it('maps bool to switch', () => expect(widgetFor(bool)).toBe('switch'))
  it('maps menu to select', () => expect(widgetFor(menu)).toBe('select'))
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run --maxWorkers=2 src/renderer/components/ImageSettings.control.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the mapping helper**

```ts
// src/renderer/components/widget.ts
import type { Control } from '../../shared/types'
export type Widget = 'slider' | 'switch' | 'select'
export function widgetFor(c: Control): Widget {
  if (c.kind === 'bool') return 'switch'
  if (c.kind === 'menu') return 'select'
  return 'slider'
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run --maxWorkers=2 src/renderer/components/ImageSettings.control.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement components**

Implement each component using shadcn primitives and `useCamera()`. Key contracts:
- `CameraPicker`: `<Select>` over `devices`, calls `selectDevice`.
- `PreviewPane`: on `current` change, `navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: <matched> } } })`; matches by enumerating `mediaDevices` and pairing label to `current.name`; on reject render placeholder card "Camera in use or preview unavailable — controls still work".
- `PtzPad`: directional buttons; press-and-hold repeatedly calls `setControl('pan_absolute'|'tilt_absolute', current±step)` on an interval; zoom `<Slider>` bound to `zoom_absolute`.
- `ImageSettings`: iterate the non-PTZ controls, render `widgetFor(c)` bound to `setControl`; disable when `c.inactive`.
- `AiTracking`: `<Switch>` → `setAi`; `<Tabs>` head/half/full → `setFraming`.
- `SceneModes`: 4-way `<Tabs>`/segmented → `setScene`.
- `Presets`: 6 hardware buttons → `recallHwPreset(slot)`; app-preset list with save-current/apply/delete via `cameraApi.saveAppPreset/applyAppPreset/removeAppPreset`; reset button → `reset()`.
- `App.tsx`: compose top bar (CameraPicker + status), main (PreviewPane + PtzPad), right rail (`<Tabs>`: AI, Scene, Image, Presets).

- [ ] **Step 6: Build the renderer**

Run: `npm run build:renderer`
Expected: builds with no errors.

- [ ] **Step 7: Launch and eyeball**

Run: `npm run dev` + `VITE_DEV_SERVER_URL=http://localhost:5173 npx electron dist/main/main.js`
Expected: full UI renders; camera picker lists both Insta360 cameras; sliders/toggles present. (Hardware effects verified in Task 15.)

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(renderer): camera picker, preview, PTZ, image, AI, scene, presets UI"
```

---

## Phase 5 — Hardware verification of XU payloads

### Task 15: Verify + fill in link-xu payloads against real cameras

**Files:**
- Modify: `native/link-xu/link-xu.c` (replace TODO-HW selectors/payloads with verified values)
- Create: `docs/HARDWARE-TEST.md`

**Interfaces:**
- Consumes: the running app + physical Link 2 / Link 2 Pro.
- Produces: verified XU selectors/payloads and a repeatable manual test checklist. No new code interfaces.

- [ ] **Step 1: Transcribe the original's XU constants**

From the original project's `uinsta360link.pas` (and `linkctl.pas`), record the XU unit id, selector(s), and byte payloads for: AI on/off, framing head/half/full, scene normal/deskview/whiteboard/overhead, preset recall/save, reset. Note them in `docs/HARDWARE-TEST.md` as a reference table.

- [ ] **Step 2: Replace placeholders in `link-xu.c`**

Update each `xu_set(...)` call's selector and `data[]` bytes with the transcribed values. Rebuild:

Run: `make -C native/link-xu`
Expected: clean compile.

- [ ] **Step 3: Verify each command on the Link 2 (device from discovery)**

For `/dev/video1` (Link 2), run each and visually confirm on the camera / in preview:

```bash
./native/link-xu/link-xu /dev/video1 ai on
./native/link-xu/link-xu /dev/video1 framing half
./native/link-xu/link-xu /dev/video1 scene deskview
./native/link-xu/link-xu /dev/video1 preset recall 1
./native/link-xu/link-xu /dev/video1 reset
```

Expected: each exits 0 and produces the visible behavior. Record pass/fail per command in `docs/HARDWARE-TEST.md`.

- [ ] **Step 4: Confirm preset save behavior (spec open item)**

Run: `./native/link-xu/link-xu /dev/video1 preset save 2` then move the gimbal and `preset recall 2`.
Expected: either it restores (save supported) OR errors/no-ops. Document the actual result; if unsupported, note that the UI's app-side presets cover this case.

- [ ] **Step 5: Repeat the AI/framing/scene checks on the Link 2 Pro (`/dev/video5`)**

Expected: same behavior; note any payload differences between Link 2 and Link 2 Pro in `docs/HARDWARE-TEST.md`.

- [ ] **Step 6: Commit**

```bash
git add native/link-xu/link-xu.c docs/HARDWARE-TEST.md
git commit -m "fix(xu): hardware-verified XU selectors/payloads + manual test checklist"
```

---

## Phase 6 — Packaging, CI, permissions

### Task 16: electron-builder config + udev rule

**Files:**
- Create: `electron-builder.yml`, `packaging/99-insta360-link.rules`
- Modify: `package.json` (build block references), `src/main/main.ts` (already resolves resourcesPath)

**Interfaces:**
- Produces a local AppImage build embedding `link-xu` as a resource.

- [ ] **Step 1: Write the udev rule**

```
# packaging/99-insta360-link.rules
# Grant access to Insta360 Link cameras. Reload: sudo udevadm control --reload && sudo udevadm trigger
SUBSYSTEM=="video4linux", ATTRS{idVendor}=="2e1a", MODE="0660", TAG+="uaccess"
```

> Note: confirm Insta360 USB vendor id (`2e1a` placeholder) via `lsusb` during Task 15; update if different.

- [ ] **Step 2: Write `electron-builder.yml`**

```yaml
appId: com.insta360linkcontroller.app
productName: Insta360 Link Controller
directories:
  output: release
files:
  - dist/**
extraResources:
  - from: native/link-xu/link-xu
    to: link-xu
linux:
  target: [AppImage]
  category: Utility
  executableName: insta360-link-controller
publish:
  provider: github
  releaseType: release
```

- [ ] **Step 3: Build the AppImage locally**

Run: `npm run build`
Expected: `release/*.AppImage` produced; `link-xu` present under the AppImage resources.

- [ ] **Step 4: Smoke-run the AppImage**

Run: `chmod +x release/*.AppImage && ./release/*.AppImage`
Expected: app launches; camera picker lists cameras; XU commands work (verified earlier). Fix path resolution if `link-xu` isn't found.

- [ ] **Step 5: Commit**

```bash
git add electron-builder.yml packaging/99-insta360-link.rules package.json
git commit -m "build: electron-builder AppImage config + udev rule; bundle link-xu"
```

---

### Task 17: GitHub Actions CI + auto-update publish

**Files:**
- Create: `.github/workflows/build.yml`
- Create: `docs/HARDWARE-TEST.md` reference already exists; add README install/udev notes to `README.md`

**Interfaces:**
- Produces CI that runs tests on push/PR and, on tag, builds + publishes the AppImage with the electron-updater feed to GitHub Releases.

- [ ] **Step 1: Write the workflow**

```yaml
# .github/workflows/build.yml
name: build
on:
  push:
    branches: [main]
    tags: ['v*']
  pull_request:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '24', cache: 'npm' }
      - run: sudo apt-get update && sudo apt-get install -y v4l-utils
      - run: npm ci
      - run: npm run build:native
      - run: npm run test:run
  release:
    if: startsWith(github.ref, 'refs/tags/v')
    needs: test
    runs-on: ubuntu-latest
    permissions: { contents: write }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '24', cache: 'npm' }
      - run: npm ci
      - run: npm run build:native
      - run: npm run build:main && npm run build:renderer
      - run: npx electron-builder --linux AppImage --publish always
        env: { GH_TOKEN: '${{ secrets.GITHUB_TOKEN }}' }
```

- [ ] **Step 2: Add install/permissions notes to README**

Document: download AppImage from Releases, `chmod +x`, install the udev rule for device access, and that auto-update pulls from GitHub Releases.

- [ ] **Step 3: Validate the workflow locally (lint the YAML + dry types)**

Run: `npm run test:run && npm run build:main`
Expected: green (proves the CI steps' core commands pass locally). Push a branch and confirm the `test` job passes on GitHub.

- [ ] **Step 4: Tag a pre-release to exercise publish (optional but recommended)**

Run: `git tag v0.1.0 && git push --tags`
Expected: `release` job builds the AppImage and attaches it + `latest-linux.yml` to a GitHub Release. Then use `sai_watch_github_run` to monitor.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/build.yml README.md
git commit -m "ci: test on PR, build+publish AppImage with update feed on tag"
```

---

## Self-Review

**Spec coverage:**
- Control Link 1 & 2 (PTZ/AI/presets/image) → Tasks 2–10, 13–15. ✅ (control descriptors are read live so Link 1 differences self-adapt; XU payload differences captured in Task 15.)
- Modern beautiful UI → Tasks 13–14 (Tailwind + shadcn). ✅
- v4l2/UVC XU approach reused → Tasks 5, 7, 8, 15. ✅
- AppImage via GitHub Actions + Releases → Tasks 16–17. ✅
- Auto-updates → Task 12 (electron-updater) + Task 17 (publish feed). ✅
- Live preview with graceful degradation → Task 14 (PreviewPane). ✅
- Multi-camera → Tasks 2, 13, 14 (picker). ✅
- App-side + hardware presets → Tasks 9, 10, 14. ✅
- Persistence → Task 12 (electron-store) + Task 9. ✅
- udev permissions → Tasks 16 (rule), 17 (README). ✅

**Placeholder scan:** The only intentionally-deferred values are the XU selectors/payloads and USB vendor id — these are genuine hardware unknowns, explicitly quarantined in `link-xu.c` (marked `TODO-HW`) and resolved with real code in Task 15/16, not vague plan prose. All TS/argv/parse tasks contain complete code.

**Type consistency:** `Device`, `Control`, `AiFraming`, `Scene`, `AppPreset`, `XuCommand`, `CameraApi`, `CH` names are defined once (Tasks 2, 6, 9, 11) and reused verbatim in later tasks. `captureNode` (not `device`/`path`) is the device node field used consistently in the hook and adapters. Runner shape `(bin, argv) => Promise<string>` is identical across v4l2/xu adapters.
