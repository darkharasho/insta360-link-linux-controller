import type { AppPreset } from '../../shared/types.js'
export type { AppPreset }

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
  /**
   * Move presets stored under a legacy device id (pre-v0.3 port-path keys) to
   * the camera's current id. Move-only: an occupied target is never merged
   * into or overwritten. Returns whether anything moved.
   */
  migrate(fromId: string, toId: string): boolean {
    if (fromId === toId) return false
    const from = this.list(fromId)
    if (from.length === 0 || this.list(toId).length > 0) return false
    this.backend.set(toId, from)
    this.backend.delete(fromId)
    return true
  }
}
