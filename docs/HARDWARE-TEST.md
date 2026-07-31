# Insta360 Link XU — Hardware Verification (Task 15)

This document records the reverse-engineered UVC Extension-Unit (XU) protocol
used by `native/link-xu/link-xu.c`, its provenance, and the results of running
each subcommand against real hardware.

## Cameras under test

| Model               | Capture node   | USB id      | Mode-control (Sel 2) length |
|---------------------|----------------|-------------|-----------------------------|
| Insta360 Link 2     | `/dev/video1`  | `2e1a:4c04` | 60 bytes (device-reported)  |
| Insta360 Link 2 Pro | `/dev/video5`  | `2e1a:4c06` | 61 bytes (device-reported)  |

USB vendor id `2e1a` confirmed via `lsusb`. (The udev rule already targets
`2e1a`, which is correct.)

## Provenance / reference table

All XU protocol values are transcribed from the original project
**vrwallace/Insta360-Link-1-and-2-Controller-for-Linux**
(commit `216124b`), primarily `uv4l2.pas` (const block, lines ~117–178), which
documents them as "CONFIRMED via Windows Kernel-Streaming property monitoring
against the official Insta360 Link Controller desktop app". Cross-referenced
with the implementation in `uinsta360link.pas` and the usage docs in
`linkctl.pas`.

| Function            | XU unit | Selector | Payload (bytes)                          | Source (repo file / lines)                     |
|---------------------|---------|----------|------------------------------------------|------------------------------------------------|
| **AI tracking ON**  | 9       | 2 (mode) | `byte[0]=0x01, byte[1]=0x00`, rest 0     | uv4l2.pas L151–164; uinsta360link.pas L876–899 |
| **AI tracking OFF** | 9       | 2 (mode) | `byte[0]=0x00, byte[1]=0x00`, rest 0     | uv4l2.pas L154 (XU_MODE_OFF); L882–884         |
| **Scene normal**    | 9       | 2 (mode) | `byte[0]=0x00`, rest 0                   | uv4l2.pas L154; uinsta360link.pas L1057–1061   |
| **Scene deskview**  | 9       | 2 (mode) | `byte[0]=0x06, byte[1]=0x10`, rest 0     | uv4l2.pas L158,L164; L1071–1094                |
| **Scene whiteboard**| 9       | 2 (mode) | `byte[0]=0x04, byte[1]=0x01`, rest 0     | uv4l2.pas L156,L162; L1096–1119                |
| **Scene overhead**  | 9       | 2 (mode) | `byte[0]=0x05, byte[1]=0x03`, rest 0     | uv4l2.pas L157,L163; L1121–1144                |
| **Framing head**    | 9       | 19       | `0x01` (1 byte)                          | uv4l2.pas L168–171; uinsta360link.pas L912–930 |
| **Framing half**    | 9       | 19       | `0x02` (1 byte)                          | uv4l2.pas L170                                 |
| **Framing full**    | 9       | 19       | `0x03` (1 byte)                          | uv4l2.pas L171                                 |
| **Gimbal reset**    | 9       | 14       | `0x01` (1 byte, SET-only)                | uv4l2.pas L148; uinsta360link.pas L844–872     |
| **Preset save/recall** | —    | —        | **No hardware XU control exists**        | See "Preset finding" below                     |

### Mode-control (Selector 2) buffer length

The master mode control is a single padded buffer: `byte[0]` = mode ID,
`byte[1]` = mode flag, remaining bytes = 0. Its **total length is
model-specific** and must be read from the device, not hardcoded:

- Link 1 (per original repo): 52 bytes
- Link 2 (`/dev/video1`, measured `UVC_GET_LEN`): **60 bytes**
- Link 2 Pro (`/dev/video5`, measured `UVC_GET_LEN`): **61 bytes**

The original project handles this by caching each selector's `GET_LEN` and
padding to it (`XU_SetPadded` in `uinsta360link.pas`). `link-xu.c` does the same:
`xu_set_mode()` issues `UVC_GET_LEN` for selector 2 at runtime and sends exactly
that many bytes. Hardcoding 52 produced `ENOBUFS` on both Link 2 units, which is
what first revealed the length difference.

### XU unit id

Unit **9** is the main proprietary control unit (verified: `GET_LEN` on unit 9
selectors 2/14/19 returns sensible sizes on both cameras). The original also
uses units 10/11 for other features (tracking target on unit 10 selector 1), but
none of the subcommands implemented here (ai/framing/scene/reset) use them.

## Exit-code results per command per camera

Command form: `./native/link-xu/link-xu <dev> <cmd>`. Exit 0 = the `SET_CUR`
ioctl was accepted by the driver+camera (valid unit + selector + length).

| Command              | Link 2 `/dev/video1` | Link 2 Pro `/dev/video5` |
|----------------------|:--------------------:|:------------------------:|
| `ai on`              | exit 0               | exit 0                   |
| `ai off`             | exit 0               | exit 0                   |
| `framing head`       | exit 0               | exit 0                   |
| `framing half`       | exit 0               | exit 0                   |
| `framing full`       | exit 0               | exit 0                   |
| `scene normal`       | exit 0               | exit 0                   |
| `scene deskview`     | exit 0               | exit 0                   |
| `scene whiteboard`   | exit 0               | exit 0                   |
| `scene overhead`     | exit 0               | exit 0                   |
| `reset`              | exit 0               | exit 0                   |
| `preset save 2`      | exit 4 (unsupported) | exit 4 (unsupported)     |
| `preset recall 2`    | exit 4 (unsupported) | exit 4 (unsupported)     |

**No payload differences between Link 2 and Link 2 Pro** other than the mode
buffer length (60 vs 61), which is discovered automatically at runtime. Both
models accept the identical unit/selector/data-byte values.

Device permissions: opening `/dev/video1` and `/dev/video5` succeeded for the
test user without `sudo` (no `EACCES`). On a fresh machine the udev rule /
video-group access from Task 16 may still be required for other users.

## Preset finding (spec open item — brief step 4)

**There is no hardware XU control for presets.** In the original project, preset
save/recall are implemented entirely in software: `SavePreset` stores the current
pan/tilt/zoom and `RecallPreset` re-applies them via V4L2
(`uinsta360link.pas` L1253–1281). There is no XU selector involved. Inventing a
selector/payload here would be fabrication, so `link-xu preset ...` deliberately
does **not** issue an ioctl — it prints an explanatory message and exits with
code **4** (distinct from the code-3 protocol-error path).

This is fine for the app: presets are covered app-side by the preset store
(`src/main/camera/presets.ts`, `applyAppPreset`), which restores pan/tilt/zoom
values through the V4L2 adapter — matching exactly what the original did.

## Exit codes

| Code | Meaning                                                       |
|------|---------------------------------------------------------------|
| 0    | `SET_CUR` ioctl accepted                                      |
| 1    | usage / bad arguments                                         |
| 2    | could not open the device (e.g. permissions)                 |
| 3    | ioctl failed at the protocol layer (EINVAL/ENOBUFS/etc.)     |
| 4    | operation has no hardware XU equivalent (presets)            |

---

## MANUAL VISUAL CHECKLIST (human confirmation required)

**Status legend:** ioctl-verified = the driver/camera accepted the command
(exit 0, done above). pending-visual = a human must still confirm the camera
physically changes behaviour, since an automated agent cannot see the gimbal or
the video preview.

Open a live preview of each camera (e.g. `guvcview -d /dev/video1`, or the app)
and run each command, watching for the described effect. Tick each box.

### Link 2 (`/dev/video1`)

- [ ] `ai on` — camera begins tracking a person (gimbal follows movement). *(ioctl-verified; pending-visual)*
- [ ] `ai off` — tracking stops, gimbal holds still. *(ioctl-verified; pending-visual)*
- [ ] `framing head` (with AI on) — frames tight on head/face. *(ioctl-verified; pending-visual)*
- [ ] `framing half` — frames upper body. *(ioctl-verified; pending-visual)*
- [ ] `framing full` — frames whole body. *(ioctl-verified; pending-visual)*
- [ ] `scene deskview` — switches to the angled desk/split view. *(ioctl-verified; pending-visual)*
- [ ] `scene whiteboard` — switches to whiteboard capture/straighten. *(ioctl-verified; pending-visual)*
- [ ] `scene overhead` — camera points down for overhead/document view. *(ioctl-verified; pending-visual)*
- [ ] `scene normal` — returns to plain webcam view. *(ioctl-verified; pending-visual)*
- [ ] `reset` — gimbal recentres (home). *(ioctl-verified; pending-visual)*

### Link 2 Pro (`/dev/video5`)

- [ ] `ai on` / `ai off` — tracking starts / stops. *(ioctl-verified; pending-visual)*
- [ ] `framing head` / `half` / `full` — framing tightness changes. *(ioctl-verified; pending-visual)*
- [ ] `scene deskview` / `whiteboard` / `overhead` / `normal` — scene changes. *(ioctl-verified; pending-visual)*
- [ ] `reset` — gimbal recentres. *(ioctl-verified; pending-visual)*

### Notes for the human tester

- Some modes only produce a *visible* effect under the right conditions (e.g.
  `framing` only reframes while `ai on` is active and a person is in view;
  `whiteboard`/`overhead` expect a whiteboard/desk in frame).
- After AI/scene testing, run `scene normal` and `ai off` to return the camera
  to a plain state (the test script already does this).
- If a command is accepted (exit 0) but produces **no** visible effect on your
  unit, note it here — that would indicate a firmware/model difference worth
  documenting, not a bug in the transcription.
