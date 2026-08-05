# Per-camera preset identity — design

**Date:** 2026-08-05 · **Status:** approved (conversation, 2026-08-05)

## Problem

Presets and color corrections are keyed by `Device.id`, which is the USB
*port path* (`usb-0000:11:00.4-1.4.1.1`). The key belongs to the port, not
the camera: replugging a camera elsewhere orphans its data, and a camera
plugged into a port another camera once used inherits that camera's data.
Observed in the wild: the presets `Desk 2`, `Desk - Pro`, and `slot:1` from
two different cameras all sit under the one port key the Link 2 Pro
currently occupies.

## Decision

Key device identity by USB model, with automatic one-time migration of
existing data.

### Identity rules (discovery, `sysfs.ts`)

1. `Device.busId` (new field) always carries the port-path id exactly as
   `Device.id` was built before (v4l2 bus_info reconstruction, falling back
   to the sysfs interface dir).
2. `Device.id` becomes `usb:<vendorId>:<productId>` (e.g. `usb:2e1a:4c06`)
   when the USB ids are readable **and** that model appears exactly once in
   the scan.
3. Fallbacks keep ids unique: unreadable USB ids, or two-plus units of the
   same model in one scan (they expose no USB serial — verified on both
   cameras — so units are indistinguishable), fall back to `busId` for the
   affected devices. Same-model pairs therefore keep today's port-scoped
   behavior; nothing collides.

### Migration

- **Presets (main):** `PresetStore.migrate(fromId, toId)` moves the entry
  when `from` has data and `to` has none; never merges, never overwrites.
  `CameraService.listDevices()` calls it per device (`busId → id`) on every
  listing — idempotent, so the 2 s discovery watcher makes it effectively
  run once. The main-process persistence proxy treats `migrate` like
  `save`/`remove`.
- **Color corrections (renderer):** `loadColor(deviceId, legacyId?)` — when
  the new key is empty and the legacy key exists, copy to the new key,
  delete the legacy key, return it.
- Existing mixed data lands on the Link 2 Pro (current occupant of the
  port that holds it) — accepted by the user; anything misplaced is a
  one-time manual re-save.

## Consequences

- Presets and color follow the camera across ports and replugs.
- Selection survives replug: `id` stays constant while `captureNode`
  changes, which the hotplug reconciliation already handles.
- Known limitation (documented above): two identical models are
  port-scoped until the hardware exposes serials.

## Testing

- `sysfs.test.ts`: model-keyed id + `busId`; fallback on unreadable USB
  ids; duplicate-model fallback; mixed fleet.
- `presets.test.ts`: migrate moves / skips-empty / never-overwrites.
- `service.test.ts`: `listDevices()` migrates `busId → id`.
- `color.test.ts`: legacy-key migration, no-overwrite, neutral default.
