import type { ReactNode } from 'react'
import type { Control, FacecamControl, FacecamKey, FacecamState } from '../../../shared/types'

/** Present a vendor control through the same row widget as V4L2 controls. */
export function asControl(fc: FacecamControl, menu?: Record<number, string>): Control {
  return {
    name: fc.key,
    kind: menu ? 'menu' : 'int',
    value: fc.value,
    min: fc.min,
    max: fc.max,
    step: 1,
    default: fc.default,
    inactive: false,
    ...(menu ? { menu } : {}),
  }
}

export const vendor = (state: FacecamState | null, key: FacecamKey) => state?.controls.find((c) => c.key === key)

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}
