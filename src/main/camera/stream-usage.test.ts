import { describe, it, expect } from 'vitest'
import { findHolders, type ProcIo } from './stream-usage'

interface P { ppid: number; comm: string; fds: string[] | 'gone' }
function io(procs: Record<number, P>): ProcIo {
  return {
    listPids: async () => Object.keys(procs).map(Number),
    fdTargets: async (pid) => {
      const p = procs[pid]
      if (!p || p.fds === 'gone') throw new Error('ENOENT')
      return p.fds
    },
    comm: async (pid) => procs[pid].comm,
    ppid: async (pid) => procs[pid]?.ppid ?? 0,
  }
}

describe('findHolders', () => {
  const procs: Record<number, P> = {
    1: { ppid: 0, comm: 'systemd', fds: [] },
    100: { ppid: 1, comm: 'insta360-link-c', fds: [] },
    101: { ppid: 100, comm: 'electron', fds: ['/dev/video8'] },
    102: { ppid: 101, comm: 'electron', fds: ['/dev/video8'] },
    200: { ppid: 1, comm: 'Discord', fds: ['/dev/null', '/dev/video8'] },
    300: { ppid: 1, comm: 'wireplumber', fds: ['/dev/video8'] },
    400: { ppid: 1, comm: 'ffplay', fds: ['/dev/video9'] },
    500: { ppid: 1, comm: 'ghost', fds: 'gone' },
  }
  it('names other processes holding the node, excluding our own process tree', async () => {
    expect(await findHolders('/dev/video8', io(procs), 100)).toEqual(['Discord', 'wireplumber'])
  })
  it('lists each process name once', async () => {
    const two = { ...procs, 201: { ppid: 1, comm: 'Discord', fds: ['/dev/video8'] } }
    expect(await findHolders('/dev/video8', io(two), 100)).toEqual(['Discord', 'wireplumber'])
  })
  it('returns nothing when only we hold it', async () => {
    expect(await findHolders('/dev/video9', io({ 100: procs[100], 101: { ...procs[101], fds: ['/dev/video9'] } }), 100)).toEqual([])
  })
})
