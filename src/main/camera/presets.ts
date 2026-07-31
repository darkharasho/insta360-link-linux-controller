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
