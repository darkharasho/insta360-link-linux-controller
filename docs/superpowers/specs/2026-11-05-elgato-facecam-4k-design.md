# Elgato Facecam 4K support — design

Date: 2026-11-05 · Status: draft for review

## Intent

The owner has an Elgato Facecam 4K and wants to control it on Linux "as close to as if I was on Windows with Elgato" — i.e. the camera-side settings of Elgato Camera Hub / Elgato Studio, inside this app. Use is streaming-style but **set and forget**: dial it in once, save it to the camera, then mostly leave it. The camera is consumed by **Discord** and the owner's own app **Duel Binder** (card scanner, `~/Documents/GitHub/duel-binder`, requests `ideal` 3840×2160 via getUserMedia). OBS is not in the picture.

This deliberately widens the project beyond Insta360-only (CLAUDE.md currently lists non-Link cameras as out of scope). CLAUDE.md's scope line must be updated as part of this work.

## Goals

- Detect the Facecam 4K (USB `0fd9:0092`) alongside the Insta360 Links, using the same sysfs-only discovery.
- Expose every camera-side setting Camera Hub offers for the 4K that the firmware supports (list below).
- **Save to camera** so settings persist across replugs, reboots and other machines.
- Zoom + digital pan/tilt, with the app's existing saved presets working for framing.
- Resolution/fps picker for **this app's own preview**.
- Show the mode another app is currently streaming at (e.g. "In use by Discord · 1280×720 @ 30"), and flag when HDR can't apply because that stream is 60 fps.
- Live readouts of what auto-exposure / auto-WB are currently doing (ISO/gain, shutter, white balance K, tint).
- Only show controls the connected camera's firmware actually reports. This covers the standard V4L2 controls and the vendor selectors listed in this document. A vendor control that newer firmware adds outside that list (for example vibrancy at image sel 14) needs an app update and a hardware check before it gets UI. *(Builder-check call: this keeps the never-write-unlisted rule absolute.)*

## Non-goals

- Forcing a resolution/fps on Discord or Duel Binder. Consumers pick their own mode; the owner explicitly accepted this. No full-res passthrough virtual camera.
- AI tracking, scene modes, gimbal reset — the Facecam has no motor. Hide them for it.
- Firmware updates (done from Elgato's app on Mac/Windows), NVIDIA effects / Eye Contact, Elgato marketplace LUTs.
- Focus control — the lens is fixed-focus (f/4, sharp ~30–120 cm at 4K). Nothing to build.
- Other Elgato devices. The owner also has an **Elgato Game Capture Neo (`0fd9:008c`)** attached — it must never be listed. Match the exact VID:PID, never the vendor or the "Elgato" name. Other Facecam models (MK.2, Pro, original) are out of scope for now, though the design shouldn't preclude them.

## Anti-goals (would make this a failure even if it works)

- Breaking or regressing anything for the Insta360 Links (discovery, wake handling, PTZ, presets).
- Ever writing to an unknown vendor selector. Two SET-only selectors (unit 7 sel 6 and sel 21) are unidentified and could be "load profile", "reboot" or firmware-related. The app must only write selectors listed in this document.
- Opening `/dev/video*` nodes during discovery (wakes the Links — see `docs/CAMERA-SLEEP.md`).

## Hardware facts (measured on the owner's unit, firmware 2.49, 2026-11-05)

All readings below came from a read-only probe (GET_* queries only). Re-run discovery for node paths — the Facecam has appeared as both `/dev/video6` and `/dev/video8`.

### Standard V4L2 controls (already work through the existing v4l2 path)

brightness −9..9 · contrast 0..200 · saturation 0..200 · sharpness 0..200 · white_balance_automatic · white_balance_temperature 2400..10000 step 100 · gain 0..160 · power_line_frequency (off/50/60) · backlight_compensation 0..1 · auto_exposure (1 manual, 3 aperture-priority) · exposure_time_absolute 1..1000 · pan_absolute ±5184000 step 3600 · tilt_absolute ±2916000 step 3600 · zoom_absolute 100..400.

Pan/tilt here is a **digital crop offset**, not a gimbal: it has effect only when zoomed in. The Link-specific PTZ workarounds (combined pan+tilt ioctl, junk-position filtering, slew timing) were built for the Link's gimbal; whether any are needed for the Facecam is for the builder to check, not assume.

### Formats

MJPEG: 640×360 … 3840×2160, each at 60 and 30 fps. YUYV up to 2560×1440 (1440p is 30 only). NV12 up to 2160p (2160p is 30 only).

### Vendor extension units

Find units **by GUID**, never by hard-coded unit ID (the MK.2 uses the same GUIDs at different unit IDs). The GUIDs and unit IDs are readable from the USB config descriptors in sysfs without opening the video node.

| GUID | Unit on 4K | Role |
|---|---|---|
| `23e49ed0-1178-4f31-ae52-d2fb8a8d3001` | 6 | image |
| `2c49d16a-32b8-4485-3ea8-643a15236002` | 7 | device |
| `d800b323-6777-48c6-b600-c4d9ab5c9003` | 8 | empty, ignore |

Selectors the app may use (all multi-byte values little-endian):

| Unit | Sel | Len | Meaning | Range / notes | Confidence |
|---|---|---|---|---|---|
| image | 2 | 1 | AE metering | 0..2. MK.2 mapping: 0 center, 1 spot, 2 average | range measured; labels from MK.2 |
| image | 10 | 4 | exposure time | 1..1000; mirrors V4L2 exposure_time | measured |
| image | 18 | 2 | tint | int16 −300..+300, default 0 (new in fw 2.49) | measured |
| image | 19 | 4 | live tint readout | read-only | measured |
| image | 17 | 4 | live WB temperature (K) | read-only, e.g. 3529 / 4562 | strong guess |
| image | 8, 11 | 4 | live gain/ISO and shutter readouts | read-only; which is which unverified | guess |
| image | 21 | 1 | HDR | 0..1 on fw 2.49 (was 0..0 on 2.26). Effect believed limited to 30 fps modes | range measured; effect unverified |
| image | 24 | 8 | pan/tilt pair, 2×int32 | same ranges as V4L2 | measured |
| device | 1 | 100 | info block: fw major/minor (bytes 0–1), build date, serial (ASCII at byte 32) | read-only | measured |
| device | 3 | 1 | 2D noise reduction | 0..100 | measured range; label from MK.2/notes |
| device | 20 | 1 | 3D noise reduction | 0..100, default 50 | measured range; label from MK.2/notes |
| device | 7 | 1 | **save settings to camera flash** | SET-only, payload `01` | from Camera Hub disassembly + MK.2; **never yet run on hardware** |

Not present on this firmware: vibrancy (image sel 14), a native NR-preset selector (image sel 22). Unknown and not to be written: device sel 6, 21 (SET-only), 22 (20 KB blob), 2/4/5/9/11/12/13/23/25–29. Device sel 8 is a 4096-byte JSON profile (keys like AE_Mode, DZoom_Ratio, NR2D…) that returned EIO when read idle — not needed for v1.

Quirk reported on the MK.2: after a write, XU reads return `0xff` bytes for ~600 ms. Readout polling must tolerate this.

Sources: `PrivateGER/ElgatoCam` (`notes/facecam-4k-linux.md`, 4K, fw 2.32), `nklmilojevic/facecam` (`Sources/FacecamKit/Controls.swift`, MK.2). Probe results are also in the owner's memory notes.

## Settings to expose (Camera Hub parity)

Grouped roughly like Camera Hub:

- **Framing** — zoom 1–4×, digital pan/tilt; saved presets via the existing app preset store. *(Call: for the Facecam, presets capture and recall **framing only** (zoom/pan/tilt), like Camera Hub's four framing presets. The image "look" is saved to the camera instead. Link presets are unchanged.)*
- **Exposure** — auto/manual; in manual: shutter (exposure time) and gain/ISO; in auto: metering, anti-flicker (50/60 Hz). Backlight compensation.
- **Color** — white balance auto/Kelvin, tint, brightness, contrast, saturation, sharpness.
- **Quality** — HDR toggle; noise reduction as Off / Low / Medium / High / Custom, where Custom reveals the 2D and 3D sliders. The camera has no preset selector, so presets are app-side values written to 2D/3D.
- **Device** — firmware version, serial, **Save to camera** button.
- **Live readouts** — ISO/gain, shutter, WB K, tint, visible while auto modes are on.

The existing software effects (color correction, orientation, background blur, virtual camera) are camera-agnostic and should keep working for the Facecam unchanged.

## Resolution / fps

- A resolution + fps picker for this app's preview, populated from the camera's real format list. *(Call: the picker and the "in use by …" indicator are **Facecam-only in v1**. The Links keep today's 1280×720 preview and wake handling unchanged, to avoid regressions on hardware that is fragile to node opens.)*
- When another process is streaming the camera (this app's preview can't run then — UVC allows one streamer; controls still work), show which process and at what mode, and indicate HDR won't apply if it's at 60 fps.
- Known limitation to surface where sensible: Discord chooses its own mode (≈720p, 1080p with Nitro) and Duel Binder asks for 4K; this app can't change that.

## Constraints

- Linux only, Electron, existing architecture (main-process camera service + IPC + React renderer, native C helper for XU ioctls shipped via `extraResources`).
- Sysfs-only discovery; no opening device nodes to enumerate.
- Udev access: add a rule for `0fd9:0092` alongside the existing Insta360 rule in `packaging/`.
- Follow existing design language (neutral dark grays, indigo accent).
- Tests: vitest with `--maxWorkers=2`.
- Hardware is attached for live verification (both Links and the Facecam).

## Decided

- Facecam 4K only (exact VID:PID match); Game Capture Neo excluded.
- Consumers choose their own stream mode; no forcing, no passthrough vcam.
- Capability-driven UI: show what the firmware reports.
- Never write unlisted selectors.
- **If save-to-camera fails or only keeps some settings** (owner's decision): fall back to the app remembering the Facecam's settings and re-applying them every time the camera connects. That fallback needs:
  - an opt-in "Start at login" option. Neither Electron nor the AppImage handles autostart on Linux, so it means writing an XDG autostart `.desktop` file that points at the AppImage path.
  - a background/tray mode. Closing the window keeps the app running, so it can re-apply settings on hotplug.

  The app has neither feature today. If the save works completely, this fallback isn't built. If it works partly, re-apply only the settings that didn't persist. The builder runs the save test early, because it decides whether this part of the plan exists.

## Left to the builder

- How the native helper is extended (generalize `link-xu` vs. a separate Facecam helper) and how the GUID→unit lookup is done, within the constraints above.
- How the UI adapts per camera (hide Mode tab for the Facecam, extra panels/tabs for Exposure/Quality/Device, etc.).
- Whether the existing wake-before-write logic is needed for the Facecam (verify whether writes land while it's idle).
- How "in use by …" is detected (e.g. scanning `/proc/*/fd` for the node and reading the current format).
- Readout polling cadence.
- NR preset values for Low/Medium/High (pick sensible values; can be refined later by comparing against Elgato's app).
- Verifying on hardware, carefully and once, that save-to-camera works (write image settings, save, replug, read back), and that HDR toggles at 30 fps.
