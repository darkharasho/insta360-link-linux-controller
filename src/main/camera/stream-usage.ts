import { readdir, readFile, readlink } from 'node:fs/promises'

/** Injectable /proc access so tests never scan the real process table. */
export interface ProcIo {
  listPids(): Promise<number[]>
  /** Resolved targets of the process's open fds. Rejects if the process is gone or unreadable. */
  fdTargets(pid: number): Promise<string[]>
  comm(pid: number): Promise<string>
  ppid(pid: number): Promise<number>
}

export const procIo: ProcIo = {
  async listPids() {
    return (await readdir('/proc')).filter((e) => /^\d+$/.test(e)).map(Number)
  },
  async fdTargets(pid) {
    const dir = `/proc/${pid}/fd`
    const fds = await readdir(dir)
    const out: string[] = []
    for (const fd of fds) {
      try {
        out.push(await readlink(`${dir}/${fd}`))
      } catch {
        // fd closed mid-scan
      }
    }
    return out
  },
  async comm(pid) {
    return (await readFile(`/proc/${pid}/comm`, 'utf8')).trim()
  },
  async ppid(pid) {
    // Field 4 of /proc/<pid>/stat; comm (field 2) may contain spaces, so split after its ')'.
    const stat = await readFile(`/proc/${pid}/stat`, 'utf8')
    return Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1])
  },
}

/**
 * Names of the other processes that have `node` open. Our own process tree
 * (the app and its renderer/GPU children, e.g. our preview) is excluded.
 * Processes we may not inspect (other users) are skipped.
 */
export async function findHolders(node: string, io: ProcIo, selfPid: number): Promise<string[]> {
  const holders: number[] = []
  for (const pid of await io.listPids()) {
    if (pid === selfPid) continue
    try {
      if ((await io.fdTargets(pid)).includes(node)) holders.push(pid)
    } catch {
      // gone or EACCES
    }
  }
  const ours = async (pid: number) => {
    for (let p = pid, hops = 0; p > 1 && hops < 64; hops++) {
      if (p === selfPid) return true
      try {
        p = await io.ppid(p)
      } catch {
        return false
      }
    }
    return false
  }
  const names: string[] = []
  for (const pid of holders) {
    if (await ours(pid)) continue
    try {
      const name = await io.comm(pid)
      if (!names.includes(name)) names.push(name)
    } catch {
      // exited
    }
  }
  return names
}
