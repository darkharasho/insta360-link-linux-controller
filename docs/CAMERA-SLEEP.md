# Why the LED Ring Never Turns Off — and How to Let the Camera Sleep

This document records why an Insta360 Link 2 / Link 2 Pro sits with its green
LED ring lit from login to shutdown on a typical PipeWire desktop, and the
system-side WirePlumber override that lets it sleep. Established empirically
on the dev machine (Bazzite/KDE, PipeWire 1.x, WirePlumber 0.5) on 2026-08-01.

Green ring = camera **awake**, not "in use": with zero open descriptors on any
`/dev/video*` node, nobody is receiving frames.

## The wake/sleep model

- The camera wakes on **any** open of its video nodes or audio interfaces
  (even a `QUERYCAP` probe — which is why app discovery is sysfs-only, see
  `src/main/camera/sysfs.ts`).
- The firmware has no idle-sleep of its own, and the known XU protocol
  (selectors 2 / 14 / 19, see `HARDWARE-TEST.md`) includes **no standby
  command**. Reverse-engineering the official app's standby traffic is the
  open alternative to everything below.
- The camera sleeps (ring off, gimbal parks) when its **USB link
  runtime-suspends** — or partially (ring off, link still active) when all of
  its interfaces simply go idle.

## Why it never sleeps on a stock PipeWire desktop

Chain observed on the dev machine; each link verified:

1. At login, kernel `uvcvideo` probing plus WirePlumber's libcamera monitor
   (format enumeration opens the nodes) wake both cameras.
2. Kernel USB autosuspend is armed (`power/control=auto`, 2 s delay) but never
   fires, because:
3. **PipeWire holds the camera's microphone PCM open 24/7 with no consumer.**
   Distros that disable node suspension to avoid audio pops — Bazzite ships
   `/usr/share/wireplumber/wireplumber.conf.d/51-disable-suspension.conf`
   setting `session.suspend-timeout-seconds = 0` for *all* ALSA nodes — keep
   every capture PCM on the system open forever, webcam mics included. An open
   capture PCM pins the USB audio interface; a composite device cannot suspend
   until all interfaces are idle.
4. WirePlumber also holds each UVC camera's `/dev/media*` controller node
   persistently (its libcamera monitor). This pins the `uvcvideo` module
   refcount but does **not** block power management — a camera suspends fine
   with its media node held.

Diagnostic gotcha: `fuser -v /dev/video*` shows nothing in this state. The
holders are on `/dev/media*` (wireplumber) and `/dev/snd/pcmC*D*c` (pipewire).
Check `lsmod | grep uvcvideo` (use-count = open UVC fds system-wide) and
`/sys/bus/usb/devices/<dev>/power/runtime_status`.

## The fix: scoped WirePlumber override

Re-enable idle suspension for the Insta360 mics only, leaving the distro's
anti-pop behavior intact for every other device.

`~/.config/wireplumber/wireplumber.conf.d/60-insta360-suspend.conf`:

```
monitor.alsa.rules = [
  {
    matches = [
      { node.name = "~alsa_input.usb-Insta360.*" }
    ]
    actions = {
      update-props = {
        session.suspend-timeout-seconds = 5
      }
    }
  }
]
```

Apply with `systemctl --user restart wireplumber` (see caveats below).
Sequence after the mic goes idle: 5 s → PipeWire closes the PCM → ~2 s →
USB autosuspend fires → ring off, gimbal parks. Verified end-to-end:

```
$ cat /sys/bus/usb/devices/<camera>/power/runtime_status   # → suspended
$ pw-dump | grep -B2 suspend-timeout                       # 5 on the two Insta mics only
```

## Caveats

| Caveat | Detail |
|--------|--------|
| WirePlumber restarts stall the desktop | If the shell holds persistent screencast streams (KDE `plasmashell` does), a restart freezes displays for a few seconds and can desync a running game's keyboard input. Never restart mid-game/capture. |
| Wake latency | First camera/mic open after idle pays ~1–2 s of USB resume. The app's preview retry path absorbs this. |
| Link 2 Pro never fully USB-suspends | It exposes a 2 MB read-only usb-storage disk that the kernel media-polls every 2 s (`events_poll_msecs`). The ring still sleeps; only the USB link stays active. Optional (untested) fix: udev rule setting `ATTR{events_poll_msecs}="0"` for `idVendor==2e1a` block devices. |
| Shared cheap hubs | Suspend/resume are USB power transitions. On marginal nested hub trees shared with input devices, watch `journalctl -k -f` for sibling disconnects during the first few cycles before trusting it. (Suspected once on the dev rig; turned out to be coincidental, but the check is cheap.) |
| State resets on restart | After any WirePlumber restart the mic nodes come back `suspended` — with this override active that is exactly the desired state. Without the override, they stay unpinned until first use, then Bazzite's timeout=0 pins them forever again. |

## Relation to the app

The app never wakes cameras during discovery (sysfs-only enumeration,
commit `4a39e53`) — only opening a preview or sending controls does, which is
the point. This override is host configuration, not something the app installs:
packaging it would silently change users' audio-suspend behavior. If the XU
standby command is ever found, the app can own camera sleep directly and this
document becomes historical.
