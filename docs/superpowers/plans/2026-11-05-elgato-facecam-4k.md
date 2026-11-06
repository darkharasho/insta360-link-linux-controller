# Elgato Facecam 4K Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect and fully control an Elgato Facecam 4K (`0fd9:0092`) in the existing app, matching Elgato Camera Hub's camera-side settings, including save-to-camera.

**Architecture:** Discovery gains a device `family` (`insta360-link` | `elgato-facecam-4k`). Standard V4L2 controls keep flowing through the existing `V4l2Adapter`. Elgato vendor controls go through two new generic subcommands of the native helper (`xu-get`/`xu-set`), driven by a TypeScript allowlist (`facecam-map.ts`). That allowlist is the **only** code path that can name a selector. Extension-unit IDs are resolved by GUID from the USB descriptors in sysfs. The renderer switches its tab set by family.

**Tech Stack:** Electron 32, TypeScript, React 18, Tailwind, vitest, C (`linux/uvcvideo.h` UVCIOC_CTRL_QUERY), v4l2-ctl.

**Spec:** `docs/superpowers/specs/2026-11-05-elgato-facecam-4k-design.md`. Read it first. Its selector table is the source of truth for every selector, length and range below.

## Global Constraints

- Match the Facecam by exact VID:PID `0fd9:0092`. The Elgato Game Capture Neo `0fd9:008c` must never be listed.
- Discovery stays sysfs-only. No `/dev/video*` open during discovery.
- The app may only write selectors in the spec's table: image 2 (metering), 18 (tint), 21 (HDR), 24 (pan/tilt, but the app uses V4L2 pan/tilt instead); device 3 (NR 2D), 20 (NR 3D), 7 (save). Never write device sel 6 or 21, or any other selector.
- Find extension units by GUID, never by hard-coded unit ID. Image GUID `23e49ed0-1178-4f31-ae52-d2fb8a8d3001`, device GUID `2c49d16a-32b8-4485-3ea8-643a15236002`.
- XU multi-byte values are little-endian. Tint is int16.
- A read whose bytes are all `0xff` is "unavailable" (the ~600 ms after-write quirk) and must not be shown as a value.
- Insta360 Link behaviour must not change: preview 1280×720, wake handling, PTZ, presets, mode tab.
- Tests: `npm run test:run` (vitest `--maxWorkers=2`). Never raise worker count.
- UI follows existing design: neutral dark grays, indigo accent, existing `ui/*` components.
- Commit after each task. Use conventional commit prefixes, as in the git log.

## Review Focus

1. **Descriptor parsing across interfaces.** The VideoStreaming interface reuses subtype `0x06` for VS_FORMAT_MJPEG (seen live at offset 232 of the Facecam's descriptors). The parser must only read extension units inside a VideoControl interface (class `0x0e`, subclass `0x01`), or it reports a bogus unit. Test is in Task 3.
2. **Link-only commands sent to the Facecam.** AI, framing, scene and reset go to `link-xu` unit 9, which the Facecam lacks. Preset recall currently sends `scene normal` unconditionally. For a Facecam these must be skipped, not attempted-and-logged. Tests are in Task 5.
3. **Stale `0xff` reads after a write.** Reading back right after a slider move shows garbage (e.g. tint 65535 → −1) unless decode returns `null` and the UI keeps the last value. Tests are in Task 4 (decode) and Task 7 (hook keeps last value).
4. **"In use by" counting our own process or the audio stack.** Our own renderer's preview, and system daemons holding a node, must not show as "In use by Discord". Exclude our own process tree. Show daemons (`pipewire`, `wireplumber`) by name, not as an error. Tests are in Task 6.
5. **Facecam unplugged or replugged mid-session.** Its node moves (seen at `/dev/video6`, then `/dev/video8`) and its unit IDs are re-resolved. The unit-ID cache must be keyed by the USB sysfs path plus `devnum`, so a replug never reuses stale data. Test is in Task 4.

---

### Task 1: Generic XU get/set in the native helper

**Files:**
- Modify: `native/link-xu/link-xu.c`. Add subcommands and a unit parameter, and leave existing commands untouched.
- Modify: `src/main/camera/xu-argv.ts` and `src/main/camera/xu-argv.test.ts`
- Modify: `src/main/camera/xu.ts`. Add `query()` returning stdout.

**Interfaces:**
- Produces (CLI):
  - `link-xu <dev> xu-get <unit> <sel>[,<sel>...]` prints one line per selector.
    - Readable selector: `sel=<n> len=<n> info=<2hex> cur=<hex>`. When `len<=16`, the line adds ` min=<hex> max=<hex> def=<hex>`.
    - SET-only selector: `sel=<n> len=<n> info=<2hex>`.
    - Failure: `sel=<n> err=<strerror>`.
    - Hex is lowercase, bytes in device order, no separators.
    - Exits 0 even if individual selectors fail.
  - `link-xu <dev> xu-set <unit> <sel> <hex>` exits 1 if `strlen(hex)/2 != GET_LEN`, 3 on ioctl failure, 0 on success.
- Produces (TS):
  - In `xu-argv.ts`: `xuGetArgv(dev: string, unit: number, sels: number[]): string[]` and `xuSetArgv(dev: string, unit: number, sel: number, hex: string): string[]`
  - In `xu.ts`: `XuAdapter.query(argv: string[]): Promise<string>` (raw stdout)
  - In `xu-argv.ts`: `parseXuGet(stdout: string): Map<number, XuReading>`, where `XuReading = { len: number; info: number; cur?: Uint8Array; min?: Uint8Array; max?: Uint8Array; def?: Uint8Array; err?: string }`

- [ ] **Step 1: Write failing tests** in `xu-argv.test.ts`:
  - `xuGetArgv('/dev/video8', 6, [2, 18])` returns `['/dev/video8','xu-get','6','2,18']`.
  - `xuSetArgv('/dev/video8', 6, 18, 'd4fe')` returns `['/dev/video8','xu-set','6','18','d4fe']`.
  - `parseXuGet` on `"sel=18 len=2 info=03 cur=0000 min=d4fe max=2c01 def=0000\nsel=7 len=1 info=02\nsel=9 err=Input/output error\n"`:
    - `.get(18)!.min` equals `Uint8Array [0xd4,0xfe]`
    - `.get(7)!.cur` is undefined
    - `.get(9)!.err` equals `'Input/output error'`

- [ ] **Step 2: Run** `npx vitest run --maxWorkers=2 src/main/camera/xu-argv.test.ts`. Expected: FAIL (functions not exported).

- [ ] **Step 3: Implement the TS functions, then the C subcommands.**
  - In C, unit is a runtime argument for these two subcommands only. Reuse a `query(fd, unit, sel, q, buf, len)` helper and open the device once per invocation.
  - `xu-get` issues GET_LEN and GET_INFO. It sends GET_CUR only if `info & 1` and `len` is in 1..4096. It sends GET_MIN, GET_MAX and GET_DEF only if `len <= 16`.
  - `xu-set` checks GET_LEN first.

- [ ] **Step 4: Verify**
  - Run `npm run build:native && npx vitest run --maxWorkers=2 src/main/camera/xu-argv.test.ts`. Expected: PASS.
  - Hardware, read-only: find the Facecam node with `for d in /sys/class/video4linux/video*; do echo $d $(cat $d/name); done`. Then run `native/link-xu/link-xu /dev/videoN xu-get 6 2,18,21`. Expected:
    - `sel=18 len=2 info=03 cur=0000 min=d4fe max=2c01 def=0000`
    - `sel=21 … max=01`

- [ ] **Step 5: Commit** `feat(xu): generic xu-get/xu-set subcommands in the native helper`

---

### Task 2: Hardware gate — save-to-camera, HDR, readout identity

This is a manual verification task with the owner present. Its outcome decides whether Task 10 is built. Only Task 1's helper is needed, with units 6 (image) and 7 (device) as measured.

**Files:**
- Modify: `docs/HARDWARE-TEST.md`. Add a "Elgato Facecam 4K (fw 2.49)" section with the results.

- [ ] **Step 1: Record a baseline.** Run `v4l2-ctl -d /dev/videoN --list-ctrls` and `link-xu /dev/videoN xu-get 6 2,18,21` and `link-xu /dev/videoN xu-get 7 3,20`.

- [ ] **Step 2: Change one value of each kind.**
  - `v4l2-ctl -d /dev/videoN --set-ctrl=contrast=150,zoom_absolute=200`
  - `link-xu /dev/videoN xu-set 6 18 6400` (tint +100)
  - `link-xu /dev/videoN xu-set 7 3 2d` (NR 2D 45)
  - `link-xu /dev/videoN xu-set 6 2 02` (metering 2)

  Read them back after 1 s. Make these writes with nothing streaming, so they also answer whether the Facecam needs the Link's wake-before-write. If every value reads back, record "no wake needed". The Task 5 implementer may then skip `waker.ensureAwake` for the facecam family.

- [ ] **Step 3: Save.** Run `link-xu /dev/videoN xu-set 7 7 01`. Expected: exit 0. Then ask the owner to unplug and replug the Facecam. Re-discover the node and re-read everything from Step 1.

- [ ] **Step 4: Classify the outcome** and write it in HARDWARE-TEST.md as one of:
  - **full**: contrast, zoom, tint, NR 2D and metering all persisted.
  - **partial**: list exactly which persisted.
  - **none**: nothing persisted.

  Then restore the defaults (contrast 116, zoom 100, tint 0, NR 2D 30, metering 0) and save again.

- [ ] **Step 5: HDR.**
  - Start a 30 fps stream: `ffmpeg -f v4l2 -input_format mjpeg -video_size 1920x1080 -framerate 30 -i /dev/videoN -f null -`, in the background. Toggle `xu-set 6 21 01` and `00`. Ask the owner whether the picture visibly changes; that needs a backlit scene.
  - Repeat at `-framerate 60`.
  - Record whether HDR has an effect at 60 fps, and whether the write is rejected there.

- [ ] **Step 6: Readouts.** With auto exposure on, read `xu-get 6 8,11,17,19` with the lens uncovered, then with it covered by a hand.
  - The one that rises when covered is gain/ISO.
  - The one that changes inversely is shutter.
  - Record the decoded uint32 values and the units, assigned by comparing with `exposure_time_absolute` (100 µs units in UVC).

- [ ] **Step 7: Commit** `docs(hardware): Facecam 4K save, HDR and readout verification`

---

### Task 3: Discovery — device family, USB path, GUID→unit lookup, udev, scope docs

**Files:**
- Create: `src/main/camera/usb-descriptors.ts` and `src/main/camera/usb-descriptors.test.ts`
- Modify: `src/main/camera/sysfs.ts` and `src/main/camera/sysfs.test.ts`
- Modify: `src/shared/types.ts`
- Modify: `packaging/99-insta360-link.rules`, `README.md` (Facecam section and rule note), `CLAUDE.md`. In CLAUDE.md, change "Out of scope: Support for non-Insta360 Link cameras" to "Support for cameras other than Insta360 Link 1/2 and the Elgato Facecam 4K".

**Interfaces:**
- Produces:
  - `type CameraFamily = 'insta360-link' | 'elgato-facecam-4k'`
  - `Device.family: CameraFamily`
  - `Device.usbPath?: string`: the USB device sysfs dir (e.g. `/sys/devices/…/8-1.4.3.4`), i.e. the existing `deviceDir`
  - `Device.devnum?: string`
- Produces:
  - `parseExtensionUnits(buf: Uint8Array): Array<{ unit: number; guid: string }>`
  - `readExtensionUnits(usbPath: string, io?: SysfsIo & { readBinary(p: string): Promise<Uint8Array> }): Promise<Array<{unit:number;guid:string}>>`. Reads `${usbPath}/descriptors`.

- [ ] **Step 1: Write failing `usb-descriptors.test.ts`.** Build the fixture by concatenating these hex strings:
  - VC interface `09040000010e010000`
  - Real XU 6: `1d240606d09ee4237811314fae52d2fb8a8d30010e010404e707970000`
  - Real XU 7: `1d2406076ad1492cb83285443ea8643a1523600216010404ff1df81f00`
  - VS interface `09040100000e020000`
  - Real MJPEG format `0b24060107000100000001`.

  Assert `parseExtensionUnits(fixture)` equals:
  ```ts
  [{ unit: 6, guid: '23e49ed0-1178-4f31-ae52-d2fb8a8d3001' },
   { unit: 7, guid: '2c49d16a-32b8-4485-3ea8-643a15236002' }]
  ```
  The VS subtype-6 descriptor must be ignored. Add a second test: a zero-length descriptor mid-buffer stops parsing without throwing.

- [ ] **Step 2: Add failing tests to `sysfs.test.ts`**, extending the existing fake-fs fixtures:
  - A `name` of `Elgato Facecam 4K` with ids `0fd9`/`0092` is listed with `family: 'elgato-facecam-4k'` and `label: 'Elgato Facecam 4K'`.
  - A `name` of `Elgato Game Capture Neo: Elgato` with ids `0fd9`/`008c` is not listed.
  - An `Elgato Facecam 4K` name with pid `0093` is not listed.
  - Existing Links get `family: 'insta360-link'`.
  - Every device has `usbPath` equal to its device dir.

- [ ] **Step 3: Run** `npx vitest run --maxWorkers=2 src/main/camera/usb-descriptors.test.ts src/main/camera/sysfs.test.ts`. Expected: FAIL.

- [ ] **Step 4: Implement.**
  - **Descriptors:** walk the descriptors by `bLength`. Track the current interface from type-0x04 descriptors (class at offset 5, subclass at 6). Accept `0x24/0x06` only while in class 0x0e, subclass 0x01. The GUID's first three fields are little-endian (bytes 4–7, 8–9, 10–11) and the last 8 bytes are in order.
  - **sysfs:** prefilter names with `/Insta360 Link|Elgato Facecam 4K/i`. After reading the ids, classify:
    - `insta360-link`: name matches `/Insta360 Link/i`
    - `elgato-facecam-4k`: ids are exactly `0fd9:0092`
    - anything else: drop

    Also read `devnum` from the device dir alongside `idVendor`/`idProduct`.

- [ ] **Step 5: Add the udev rule** `SUBSYSTEM=="video4linux", ATTRS{idVendor}=="0fd9", ATTRS{idProduct}=="0092", MODE="0660", TAG+="uaccess"`. Keep the file name, to avoid changing the README install path. Update its header comment.

- [ ] **Step 6: Run** the same tests, then `npm run test:run`. Expected: all PASS.

- [ ] **Step 7: Commit** `feat(discovery): detect the Elgato Facecam 4K and resolve its extension units by GUID`

---

### Task 4: Facecam control map and adapter

**Files:**
- Create: `src/main/camera/facecam-map.ts`, `src/main/camera/facecam.ts`, `src/main/camera/facecam.test.ts`
- Modify: `src/shared/types.ts`

**Interfaces:**
- Consumes: `xuGetArgv`, `xuSetArgv`, `parseXuGet`, `XuAdapter.query` (Task 1); `readExtensionUnits` (Task 3).
- Produces in `types.ts`:
  ```ts
  type FacecamKey = 'metering' | 'tint' | 'hdr' | 'nr2d' | 'nr3d'
  interface FacecamControl { key: FacecamKey; value: number; min: number; max: number; default: number }
  interface FacecamReadouts { gain: number | null; shutter: number | null; wbKelvin: number | null; tint: number | null }
  interface FacecamState { firmware: string; serial: string; controls: FacecamControl[] }
  ```
- Produces in `facecam-map.ts`:
  - `FACECAM_GUID = { image: '23e49ed0-…3001', device: '2c49d16a-…6002' }` (full strings)
  - `FACECAM_CONTROLS: Record<FacecamKey, { xu: 'image' | 'device'; sel: number; len: 1 | 2; signed: boolean }>`, with these values:
    - metering: image 2, len 1
    - tint: image 18, len 2, signed
    - hdr: image 21, len 1
    - nr2d: device 3, len 1
    - nr3d: device 20, len 1
  - `FACECAM_READOUTS`: gain, shutter, wbKelvin and tint as image sel 8/11/17/19, each 4 bytes, tint signed. Use the gain/shutter assignment from Task 2's results.
  - `FACECAM_SAVE = { xu: 'device', sel: 7, payload: '01' }`
  - `FACECAM_INFO = { xu: 'device', sel: 1 }`
  - `decodeLE(bytes: Uint8Array, signed: boolean): number | null`. Returns null when every byte is `0xff`.
  - `encodeLE(value: number, len: 1 | 2, signed: boolean): string`
  - `decodeInfo(bytes: Uint8Array): { firmware: string; serial: string }`
- Produces in `facecam.ts`, class `FacecamAdapter`, `constructor(xu: XuAdapter, readUnits = readExtensionUnits)`:
  - `state(dev: string, usb: { path: string; devnum: string }): Promise<FacecamState>`. Omits controls whose reading has `err`, lacks `cur`, or has `min === max`. That makes the capability-driven UI fall out of the data, e.g. HDR on fw 2.26 reports 0..0.
  - `set(dev, usb, key: FacecamKey, value: number): Promise<void>`
  - `save(dev, usb): Promise<void>`
  - `readouts(dev, usb): Promise<FacecamReadouts>`

- [ ] **Step 1: Write failing tests** in `facecam.test.ts`, using a fake `XuAdapter.query` that records argv and returns canned `xu-get` stdout.
  - `decodeLE(Uint8Array.of(0xd4, 0xfe), true)` returns `-300`.
  - `decodeLE(Uint8Array.of(0xff, 0xff), true)` returns `null`.
  - `encodeLE(-300, 2, true)` returns `'d4fe'`.
  - `encodeLE(100, 2, true)` returns `'6400'`.
  - `decodeInfo` on the real device-sel-1 prefix gives `{ firmware: '2.49', serial: 'A9T9D62710MUGG' }`.
    - The prefix: bytes 0–1 `02 31` (fw 2.49 = 0x02, 0x31), padded with zeros to byte 32, then ASCII `A9T9D62710MUGG\0`.
    - The probe saw `02 1a` on 2.26, so the minor version is decimal in the byte.
  - `state()` with the HDR reading `min=00 max=00` omits `hdr`. With `max=01` it includes `hdr`.
  - `set(dev, usb, 'tint', -300)` issues `['…','xu-set','6','18','d4fe']`, where 6 is the unit resolved by GUID from the injected `readUnits`.
  - Unit IDs are resolved by GUID: with `readUnits` returning image at unit 7 and device at unit 8 (the MK.2 layout), `set('nr2d', 45)` issues unit `8`.
  - The unit cache is keyed by `path + devnum`: two calls with the same key make one `readUnits` call. Changing `devnum` triggers a re-read.
  - `set(dev, usb, 'bogus' as FacecamKey, 1)` rejects with `/unknown facecam control/`, and no `xu-set` is issued.
  - `save()` issues `xu-set <deviceUnit> 7 01`.

- [ ] **Step 2: Run** `npx vitest run --maxWorkers=2 src/main/camera/facecam.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** the map and adapter. Before writing, `set` clamps the value to the min/max last read by `state()`. If `state()` was never called, it reads the range first.

- [ ] **Step 4: Run** the tests. Expected: PASS.

- [ ] **Step 5: Commit** `feat(facecam): vendor control map and adapter`

---

### Task 5: Service and IPC wiring, with Link-only guards

**Files:**
- Modify: `src/main/camera/service.ts`, `src/main/camera/service.test.ts`, `src/main/ipc.ts`, `src/shared/ipc.ts`, `src/main/preload.cts`, `src/main/main.ts`, `src/renderer/api.ts`

**Interfaces:**
- Consumes: `FacecamAdapter` (Task 4); `Device.family`, `usbPath`, `devnum` (Task 3).
- Produces: `CameraService` constructor gains an optional `facecam?: FacecamAdapter`, as the last parameter. New methods:
  - `facecamState(dev: string): Promise<FacecamState>`
  - `facecamSet(dev: string, key: FacecamKey, value: number): Promise<void>`
  - `facecamSave(dev: string): Promise<void>`
  - `facecamReadouts(dev: string): Promise<FacecamReadouts>`

  The service resolves `dev` to the `Device` it last returned from `listDevices()`. It throws `not a Facecam: <dev>` for other families.
- Produces new `CH` channels and matching `CameraApi` methods with the same names: `facecamState`, `facecamSet`, `facecamSave`, `facecamReadouts`.

- [ ] **Step 1: Write failing tests** in `service.test.ts`, using the existing mocking style:
  - After `listDevices()` returns a facecam device on `/dev/video8`, `setAi('/dev/video8', true)`, `setScene(…)`, `setFraming(…)` and `reset(…)` each reject with `/not supported on Elgato Facecam 4K/`, and `xu.send` is never called.
  - `applyAppPreset` on a facecam preset `{ values: { zoom_absolute: 200, pan_absolute: 3600 } }` sends no `xu.send` call at all, writes pan via the combined pan+tilt write, and writes zoom last.
  - `facecamSet('/dev/video1', 'tint', 0)` on a Link rejects with `/not a Facecam/`.
  - Link behaviour is unchanged: the existing tests pass unmodified.

- [ ] **Step 2: Run** `npx vitest run --maxWorkers=2 src/main/camera/service.test.ts`. Expected: new tests FAIL.

- [ ] **Step 3: Implement.** Keep a `Map<captureNode, Device>` refreshed in `listDevices()`. Guard the four Link-only methods, and skip mode/scene handling in `applyAppPreset` for the facecam family. Wire the IPC, preload, `main.ts` (`new FacecamAdapter(xuAdapter)`, sharing the link-xu path) and `api.ts`.

- [ ] **Step 4: Run** `npm run test:run`. Expected: PASS.

- [ ] **Step 5: Commit** `feat(facecam): service and IPC; keep Link-only commands off the Facecam`

---

### Task 6: Video modes and "in use by" detection

**Files:**
- Create: `src/main/camera/stream-usage.ts`, `src/main/camera/stream-usage.test.ts`, `src/main/camera/formats.ts`, `src/main/camera/formats.test.ts`
- Modify: `src/main/camera/service.ts`, the IPC files from Task 5, `src/shared/types.ts`

**Interfaces:**
- Produces in `types.ts`:
  - `interface VideoMode { width: number; height: number; fps: number }`
  - `interface StreamUsage { holders: string[]; mode: VideoMode | null }`
- Produces in `formats.ts`:
  - `parseFormats(listFormatsExtStdout: string): VideoMode[]`. MJPG section only, since that's what Chromium and Discord use for high modes. Sorted by width desc, then fps desc. Deduped.
  - `parseCurrentMode(stdout: string): VideoMode | null`, from `--get-fmt-video --get-parm` output.
- Produces in `stream-usage.ts`:
  - `findHolders(node: string, io: ProcIo, selfPid: number): Promise<string[]>`. Returns process display names. Excludes `selfPid` and every process whose ppid chain reaches `selfPid`. Name comes from `/proc/<pid>/comm`.
  - `interface ProcIo { listPids(): Promise<number[]>; fdTargets(pid: number): Promise<string[]>; comm(pid: number): Promise<string>; ppid(pid: number): Promise<number> }`
- Service methods and channels: `listModes(dev): Promise<VideoMode[]>` and `streamUsage(dev): Promise<StreamUsage>`.
  - `streamUsage` reads the mode only when `holders.length > 0`. G_FMT reports the last-set format even when idle.
  - Both are Facecam-only; they throw `not a Facecam` otherwise.

- [ ] **Step 1: Write failing tests.**
  - `parseFormats`: use the MJPG excerpt of the real `--list-formats-ext` output (the 7 sizes × {60,30}). Expect 14 modes, first `{3840,2160,60}`. YUYV/NV12 sections are ignored.
  - `parseCurrentMode`: the real output (`Width/Height : 3840/2160` … `Frames per second: 30.000 (30/1)`) gives `{3840,2160,30}`. Garbage gives `null`.
  - `findHolders` with fake `ProcIo`:
    - pid 100 = self
    - pid 101 (ppid 100, comm `electron`) holds `/dev/video8`
    - pid 200 (comm `Discord`) holds `/dev/video8`
    - pid 300 (comm `wireplumber`) holds `/dev/video8`
    - pid 400 holds `/dev/video9`

    Result: `['Discord', 'wireplumber']`.
  - A pid that vanishes mid-scan (`fdTargets` rejects) is skipped without failing.

- [ ] **Step 2: Run** the new tests. Expected: FAIL.

- [ ] **Step 3: Implement.** The real `ProcIo` uses `fs.readdir('/proc')`, `readlink` on `/proc/<pid>/fd/*`, `/proc/<pid>/comm`, and field 4 of `/proc/<pid>/stat`. Ignore EACCES. Mode reads use `v4l2-ctl -d <dev> --list-formats-ext` and `--get-fmt-video --get-parm` through the existing `Runner`.

- [ ] **Step 4: Run** `npm run test:run`. Expected: PASS.

- [ ] **Step 5: Commit** `feat(facecam): list video modes and report which app holds the camera`

---

### Task 7: Renderer — Facecam tabs: Image, Quality, Device

**Files:**
- Create:
  - `src/renderer/components/ControlRow.tsx`: extracted from `ImageSettings.tsx`, which then uses it
  - `src/renderer/components/facecam/FacecamImagePanel.tsx`
  - `src/renderer/components/facecam/FacecamQualityPanel.tsx`
  - `src/renderer/components/facecam/FacecamDevicePanel.tsx`
  - `src/renderer/useFacecam.ts`
  - `src/renderer/facecam-nr.ts` and `src/renderer/facecam-nr.test.ts`
  - `src/renderer/useFacecam.test.ts`
- Modify: `src/renderer/App.tsx`, `src/renderer/components/widget.ts` (labels), `src/renderer/useCamera.ts` (`captureCurrent` framing-only for Facecam)

**Interfaces:**
- Consumes: the `cameraApi.facecam*` methods (Task 5).
- Produces:
  - `useFacecam(dev: string | null): { state: FacecamState | null; readouts: FacecamReadouts | null; set(key: FacecamKey, v: number): void; save(): Promise<boolean>; saving: boolean }`
    - Writes are debounced at 60 ms, like `useCamera`.
    - Readouts poll every 1000 ms while the Device tab or Image tab is visible.
    - A `null` readout field keeps the previous non-null value.
  - In `facecam-nr.ts`:
    - `NR_PRESETS = { off: [0, 0], low: [30, 30], medium: [50, 50], high: [80, 80] } as const` (values are the builder's call per the spec; `[nr2d, nr3d]`)
    - `nrPresetFor(nr2d: number, nr3d: number): keyof typeof NR_PRESETS | 'custom'`

**Layout:**
- For `family === 'elgato-facecam-4k'`, the tabs are **Image · Quality · Effects · Presets · Device**. There is no Mode tab, and the grid has 5 columns. Links keep their current 4 tabs.
- **Image:**
  - *Exposure* section: auto_exposure, exposure_time_absolute, gain, metering (Center/Spot/Average for 0/1/2), power_line_frequency, backlight_compensation.
  - *Color* section: white_balance_automatic, white_balance_temperature, tint (−300..300), brightness, contrast, saturation, sharpness.
  - Then the existing Orientation and Color-correction panels, unchanged.
- **Quality:**
  - HDR switch, with helper text "Works at 30 fps".
  - Noise reduction: a segmented Off/Low/Medium/High/Custom control. Custom reveals the 2D and 3D sliders.
  - Picking a preset writes both values.
  - Hide any control that's missing from `state.controls`.
- **Device:**
  - Firmware and serial.
  - Live readouts (ISO/gain, shutter, white balance K, tint), shown as "—" when null.
  - A **Save to camera** button with a confirm line: "Saved — settings will survive replugging." On failure, show the error via `lastError`.

- [ ] **Step 1: Write failing tests.**
  - `facecam-nr.test.ts`: `nrPresetFor(30,30) === 'low'`, `nrPresetFor(0,0) === 'off'` and `nrPresetFor(30,50) === 'custom'`.
  - `useFacecam.test.ts`: the project has no `@testing-library/react`, so don't add it. Test the pure `mergeReadouts(prev, next)` helper exported from `useFacecam.ts`: `mergeReadouts({gain:5,shutter:1,wbKelvin:4500,tint:0},{gain:null,shutter:2,wbKelvin:null,tint:3})` equals `{gain:5,shutter:2,wbKelvin:4500,tint:3}`.
  - A `useCamera` capture filter test: export a pure `presetValuesFor(family, controls)` from `useCamera.ts`. For the facecam family it keeps only `pan_absolute`, `tilt_absolute` and `zoom_absolute`. For Links it keeps all active controls, as today.

- [ ] **Step 2: Run** `npx vitest run --maxWorkers=2 src/renderer`. Expected: new tests FAIL.

- [ ] **Step 3: Implement** the components and hooks above. Extend `LABELS` in `widget.ts` with: `auto_exposure: 'Exposure mode'`, `exposure_time_absolute: 'Shutter'`, `backlight_compensation: 'Backlight compensation'`, `power_line_frequency: 'Anti-flicker'`.

- [ ] **Step 4: Run** `npm run test:run`. Expected: PASS.

- [ ] **Step 5: Verify in the running app** (`npm run dev`, with the Facecam selected):
  - The tabs show without Mode.
  - Tint moves the image's magenta/green balance.
  - Noise reduction presets switch.
  - Save to camera reports success.
  - Selecting the Link 2 Pro still shows Mode/Image/Effects/Presets.

- [ ] **Step 6: Commit** `feat(facecam): Image, Quality and Device panels`

---

### Task 8: Preview mode picker and "in use" banner (Facecam only)

**Files:**
- Create: `src/renderer/preview-mode.ts`, `src/renderer/preview-mode.test.ts`, `src/renderer/components/facecam/PreviewModePicker.tsx`
- Modify: `src/renderer/components/PreviewPane.tsx`, `src/renderer/App.tsx`

**Interfaces:**
- Consumes: `listModes` and `streamUsage` (Task 6); the `hdr` value from `useFacecam` (Task 7).
- Produces in `preview-mode.ts`:
  - `previewVideoConstraints(mode: VideoMode | null): MediaTrackConstraints`. `null` gives `{ width: { ideal: 1280 }, height: { ideal: 720 } }`, today's Link behaviour. A mode gives `{ width: { exact }, height: { exact }, frameRate: { exact } }`.
  - `loadPreviewMode(deviceId: string): VideoMode | null` and `savePreviewMode(deviceId: string, m: VideoMode | null): void`. These use localStorage key `preview-mode:<deviceId>` and the best-effort pattern of `preview-pref.ts`.
  - `usageNotice(u: StreamUsage, hdrOn: boolean): string | null`
    - With no holders: `null`.
    - Otherwise: `"In use by Discord · 1280×720 @ 30"`, with holders joined by ", " and the mode omitted when null.
    - When `hdrOn` and fps > 30, it appends `" — HDR only works at 30 fps"`.

**Behaviour:**
- The picker (a `ui/select` of `listModes` plus "Auto") sits in the preview header for the Facecam only.
- `PreviewPane` gets an optional `videoConstraints` prop. When it's absent, it uses the existing 1280×720 ideal, so Links are unchanged.
- The banner polls `streamUsage` every 3 s while the Facecam is selected. It renders above the preview.

- [ ] **Step 1: Write failing tests** in `preview-mode.test.ts`:
  - `previewVideoConstraints(null)` deep-equals today's constraints.
  - The exact form for `{1920,1080,60}`.
  - `usageNotice({holders:['Discord'],mode:{width:1280,height:720,fps:30}}, false)` returns `'In use by Discord · 1280×720 @ 30'`.
  - HDR on at fps 60 appends the HDR text.
  - No holders returns `null`.
  - Load/save round-trips, and returns null when localStorage throws.

- [ ] **Step 2: Run** `npx vitest run --maxWorkers=2 src/renderer/preview-mode.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.** If `exact` fails with `OverconstrainedError`, fall back to the default constraints and clear the saved mode.

- [ ] **Step 4: Run** `npm run test:run`. Expected: PASS.

- [ ] **Step 5: Verify in the running app.**
  - Choosing 3840×2160 @ 30 shows a 4K preview.
  - With preview off and `ffplay -f v4l2 -framerate 60 -video_size 1280x720 /dev/videoN` running, the banner reads "In use by ffplay · 1280×720 @ 60". With HDR on, it adds the HDR note.
  - Link preview is unchanged.

- [ ] **Step 6: Commit** `feat(facecam): preview mode picker and in-use banner`

---

### Task 9: Release prep

**Files:**
- Modify: `README.md` (supported cameras, Facecam features, udev note)
- Modify: `docs/HARDWARE-TEST.md` (link to Task 2 results)

- [ ] **Step 1:** Run `npm run test:run` and `npm run build:main && npm run build:renderer`. Expected: both succeed.
- [ ] **Step 2:** Do a full manual pass on all three cameras: discovery, controls, presets, preview. Confirm the Game Capture Neo is absent from the picker.
- [ ] **Step 3: Commit** `docs: document Elgato Facecam 4K support`. Don't tag a release; the owner decides when.

---

### Task 10 (conditional): Re-apply fallback — only if Task 2's result is **partial** or **none**

If Task 2 recorded **full**, skip this task and note "not needed" in the PR.

**Files:**
- Create: `src/main/facecam-memory.ts` and its test, `src/main/autostart.ts` and its test, `src/main/tray.ts`
- Modify: `src/main/main.ts`, `src/renderer/components/facecam/FacecamDevicePanel.tsx`

**Interfaces:**
- `FacecamMemory` (electron-store key `facecamSettings`, keyed by `Device.id`):
  - `remember(deviceId, v4l2: Record<string, number>, xu: Partial<Record<FacecamKey, number>>)`
  - `get(deviceId)`

  Only the settings Task 2 found **not** persisting are remembered and re-applied.
- `reapplyOnConnect(prev: Device[], next: Device[], apply: (d: Device) => Promise<void>)`: calls `apply` for each facecam present in `next` but not in `prev`. It's wired into the `DeviceWatcher` callback.
- `autostart.ts`:
  - `autostartEntry(appImagePath: string): string` returns `.desktop` content with `Exec="<path>" --hidden`, `X-GNOME-Autostart-enabled=true`
  - `setAutostart(on: boolean, io)` writes or removes `~/.config/autostart/insta360-link-controller.desktop`. It needs `process.env.APPIMAGE`. Without it (dev runs), the toggle is disabled.
- Tray: with "Start at login" on, closing the window hides it to a tray icon (Show / Quit) instead of quitting. `--hidden` starts with no window.

- [ ] **Step 1: Write failing tests:**
  - `reapplyOnConnect` fires only for newly appeared Facecams, not for Links or for an already-present Facecam.
  - `autostartEntry('/home/u/App.AppImage')` contains `Exec="/home/u/App.AppImage" --hidden`.
  - `setAutostart(false)` removes the file.
  - `FacecamMemory` round-trips.
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement.** The Device tab gets a "Start at login and keep settings applied" switch, and its help text explains why.
- [ ] **Step 4: Run** `npm run test:run`, then the hardware check: change a non-persisting setting, quit the window to the tray, replug the Facecam, and confirm it's re-applied within ~3 s (one watcher poll plus the write).
- [ ] **Step 5: Commit** `feat(facecam): keep settings applied on reconnect when the camera can't store them`
