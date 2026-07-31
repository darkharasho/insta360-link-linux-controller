## Project Context

A modern, beautiful desktop app for Linux that controls Insta360 Link 1 and 2 webcams — pan/tilt/zoom, AI tracking, and image settings. It reuses the proven v4l2/UVC extension-unit control approach from the original project under the hood, wrapped in a polished modern UI. Packaged and distributed as an auto-updating AppImage via GitHub Actions and Releases.

## Goals

- Control Insta360 Link 1 and 2 webcams: pan/tilt/zoom, AI tracking, presets, and image settings
- Modern, beautiful UI that feels native and improves on the original
- Talk to the camera via Linux v4l2/UVC extension-unit commands (reusing the original's approach)
- Package and distribute as a .AppImage via GitHub Actions and Releases
- Support automatic updates for released builds

## Out of scope

- Windows or macOS support (Linux-focused)
- Support for non-Insta360 Link cameras

## Suggested stack

- **Electron** — Mature Linux AppImage packaging and auto-update tooling (electron-builder + electron-updater), and easy to build a polished modern UI
- **v4l2-ctl / UVC extension-unit commands** — Battle-tested way to drive PTZ and AI tracking on the Insta360 Link across Linux distros, reused from the original project
- **GitHub Actions + Releases** — Automated CI builds and hosting of AppImage artifacts as auto-update feed
