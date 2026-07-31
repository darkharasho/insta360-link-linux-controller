# insta360-link-linux-controller — Design

**Date:** 2026-07-30
**Status:** Approved (design); implementation plan pending

## Summary

A modern, beautiful Linux desktop app that controls Insta360 Link 1 and Link 2
webcams — pan/tilt/zoom, AI tracking, scene modes, presets, and image settings —
with a **live video preview**. It reuses the original project's proven
v4l2/UVC-extension-unit control approach under the hood, wrapped in a polished
React UI, and ships as a self-updating AppImage via GitHub Actions and Releases.

Linux-only. Insta360 Link cameras only. Non-goals: Windows/macOS, non-Link cameras.

## Key technical finding

Two classes of camera control, confirmed against live hardware (Link 2 and Link 2 Pro):

- **Standard V4L2 controls** — pan/tilt/zoom, focus, zoom, brightness, contrast,
  saturation, sharpness, white balance, exposure. Drivable with `v4l2-ctl`.
- **Proprietary Insta360 features** — AI person tracking, framing modes
  (head/half-body/full-body), scene modes (Normal/DeskView/Whiteboard/Overhead),
  the 6 hardware presets, gimbal reset. These are **not** standard V4L2 controls;
  the original drives them via **UVC Extension Unit ioctls** (`UVCIOC_CTRL_QUERY`,
  XU unit ID 4). `v4l2-ctl` cannot send these.

This split is the basis for the hybrid control approach below.

## Decisions

1. **Control mechanism — Hybrid.** `v4l2-ctl` subprocess for standard controls +
   device discovery; a small bundled C helper (`link-xu`) for XU proprietary
   commands. The renderer stays pure JS; the risky proprietary logic is quarantined
   in one small auditable binary that is a direct port of the original's byte
   sequences.
2. **Shell — Electron**, with electron-builder + electron-updater for AppImage
   packaging and GitHub-Releases auto-update.
3. **Frontend — React + TypeScript + Vite + Tailwind + shadcn/ui (Radix).**
4. **v1 scope includes live video preview** (via renderer `getUserMedia`), with
   graceful degradation when the stream can't be acquired.

## Architecture & process model

Three layers with clean boundaries:

- **Renderer (React/TS)** — the UI. Never touches hardware directly; talks only
  over a typed IPC bridge. Owns the live preview via `getUserMedia`/`MediaDevices`.
- **Main process (Electron/Node)** — orchestrator. Hosts the camera control
  service, exposes a typed IPC API (`camera:list`, `camera:getControls`,
  `camera:setControl`, `camera:setAiMode`, `camera:setScene`, `camera:recallPreset`,
  `camera:savePreset`, `camera:reset`, …), manages persistence and auto-update.
- **Hardware adapters** — two small modules the service calls:
  - `v4l2` adapter → shells out to `v4l2-ctl` for standard controls + discovery.
  - `xu` adapter → invokes the bundled `link-xu` C helper for AI/scene/preset/reset.

Security: `contextIsolation` on, `nodeIntegration` off. A preload script exposes a
minimal, typed `window.cameraApi`.

## Camera control layer

- **Device discovery:** parse `v4l2-ctl --list-devices`, filter to `Insta360 Link`,
  map each to its capture `/dev/videoN` node and a stable id (USB path). Supports
  multiple connected cameras; the app targets one at a time.
- **Standard controls:** typed control descriptors (name, min/max/step/default,
  kind: int/bool/menu) read via `v4l2-ctl --list-ctrls-menus`; set via
  `v4l2-ctl -d <dev> --set-ctrl name=value`. The image-settings UI is **generated
  from these descriptors** so it self-adapts to Link 1 vs Link 2 differences.
- **`link-xu` C helper:** one small, self-contained C program bundled in the
  AppImage. Subcommands (indicative):
  - `link-xu <dev> ai on|off`
  - `link-xu <dev> framing head|half|full`
  - `link-xu <dev> scene normal|deskview|whiteboard|overhead`
  - `link-xu <dev> preset recall|save <n>`
  - `link-xu <dev> reset`
  It issues `UVCIOC_CTRL_QUERY` ioctls (XU unit 4), porting the original's proven
  byte sequences. Compiled in CI and included with the AppImage.
- **App-side presets:** named snapshots of current *standard* control values saved
  to disk (`electron-store`), re-applied by replaying `--set-ctrl` calls. Distinct
  from the camera's 6 hardware presets.
- **Persistence:** remember last-used camera and settings between launches.

## UI structure

Single-window control panel, modern dark-first aesthetic (Tailwind + shadcn/ui):

- **Top bar:** camera picker (detected Link cameras), connection status.
- **Main/left:** live preview pane with a graceful "camera in use / preview
  unavailable" placeholder; PTZ pad overlay with press-and-hold continuous motion
  (configurable speed) + zoom slider.
- **Right rail (sectioned/tabbed):**
  - AI Tracking — toggle + framing mode (head/half/full).
  - Scene modes — Normal / DeskView / Whiteboard / Overhead.
  - Image settings — sliders/switches generated from control descriptors.
  - Presets — 6 hardware presets + app-side named presets (save/recall).
- Controls are optimistic with debounced writes; displayed state reflects values
  read back from the camera.

### Preview concurrency behavior

Camera *controls* act on the UVC control interface and work even while another app
streams video. But most UVC cameras allow a single consumer of the *streaming*
interface, so if OBS/Zoom already holds the camera, `getUserMedia` may fail. In
that case the preview shows a clear placeholder while all controls remain fully
functional.

## Packaging, CI & auto-update

- **electron-builder** → AppImage (x86_64). `link-xu` compiled in the CI job and
  included as an `extraResource`; resolved at runtime via `process.resourcesPath`.
- **GitHub Actions:** on tag push → build AppImage, compile helper, publish to
  **GitHub Releases** with `latest-linux.yml` update feed.
- **electron-updater** checks the GitHub Releases feed and self-updates released builds.
- **Permissions:** ship the `99-insta360-link.rules` udev file plus in-app guidance,
  since raw device access needs the user in the right group / a udev rule.

## Testing

- **Adapter unit tests (Vitest, `--maxWorkers=2`):** parse real `v4l2-ctl` output
  fixtures → control descriptors; build correct command argv for set operations; map
  XU subcommands to helper argv. Pure string/parse logic, no hardware.
- **`link-xu` smoke test:** CI compile + `--help`/dry-run; manual hardware
  verification against the two physical cameras documented as a checklist.
- **IPC contract tests:** renderer-side mock of `cameraApi` so the UI can be built
  and tested without hardware.
- No E2E hardware automation in CI (runners have no camera); hardware validation is
  a documented manual pass.

## Open items to confirm during implementation

- Exact XU byte sequences / control selectors for Link 1 vs Link 2 (port and verify
  against hardware from the original `uinsta360link.pas`).
- Which `/dev/videoN` node is the real capture node per camera (discovery must pick
  correctly; the Link exposes two video nodes).
- Whether hardware preset `save` is exposed by the XU protocol or only `recall`.
