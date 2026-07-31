# Insta360 Link Linux Controller

A modern desktop app for Linux that controls Insta360 Link 1 and 2 webcams —
pan/tilt/zoom, AI tracking, presets, and image settings — via the same
v4l2/UVC extension-unit approach as the original community controller,
wrapped in a polished Electron UI.

## Installing

1. Download the latest `Insta360-Link-Controller-*.AppImage` from the
   [Releases](https://github.com/darkharasho/insta360-link-linux-controller/releases)
   page.
2. Make it executable and run it:

   ```bash
   chmod +x Insta360-Link-Controller-*.AppImage
   ./Insta360-Link-Controller-*.AppImage
   ```

### Device permissions (udev rule)

The app talks to the camera over `/dev/video*` and USB, which normally
require root. Install the bundled udev rule so your user can access the
camera without `sudo`:

```bash
sudo cp packaging/99-insta360-link.rules /etc/udev/rules.d/
sudo udevadm control --reload && sudo udevadm trigger
```

Unplug and replug the camera (or reboot) after installing the rule.

### Auto-updates

The app checks GitHub Releases for new versions on startup (via
`electron-updater`) and will download and offer to install updates
automatically. No separate action is needed — just keep the AppImage in a
writable location so it can be replaced in place.

## Development

```bash
npm ci
npm run build:native   # compiles native/link-xu helper (requires gcc)
npm run dev             # start Vite dev server
npm run test:run        # run tests (vitest --maxWorkers=2)
npm run build            # full production build + electron-builder package
```

## CI / Releases

- Every push to `main` and every pull request runs the test suite via
  GitHub Actions (`.github/workflows/build.yml`).
- Pushing a tag matching `v*` (e.g. `v0.1.0`) triggers the `release` job,
  which builds the AppImage and publishes it to GitHub Releases along with
  the `latest-linux.yml` update feed consumed by `electron-updater`.
