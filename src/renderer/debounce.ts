export function makeDebouncer<T extends unknown[]>(fn: (...args: T) => void, ms: number) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  return (key: string, ...rest: unknown[]) => {
    const existing = timers.get(key)
    if (existing) clearTimeout(existing)
    timers.set(key, setTimeout(() => { timers.delete(key); (fn as (...args: unknown[]) => void)(key, ...rest) }, ms))
  }
}
