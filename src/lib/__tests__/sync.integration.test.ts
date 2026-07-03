/**
 * Live integration test of the sync layer against a real GitHub repo.
 * Skipped unless credentials are provided:
 *
 *   PF_TEST_TOKEN=$(gh auth token) PF_TEST_REPO=owner/finance-data npx vitest run src/lib/__tests__/sync.integration.test.ts
 *
 * Uses a throwaway path so it never touches real transaction files.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const TOKEN = process.env.PF_TEST_TOKEN
const REPO = process.env.PF_TEST_REPO
const BRANCH = process.env.PF_TEST_BRANCH ?? 'main'
const TEST_PATH = 'transactions/0000-integration-test.json'

function makeLocalStorageShim(): Storage {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size
    },
  } as Storage
}

describe.skipIf(!TOKEN || !REPO)('sync layer against real GitHub', () => {
  beforeAll(async () => {
    globalThis.localStorage = makeLocalStorageShim()
    const { setConfig } = await import('../cache')
    setConfig('githubToken', TOKEN!)
    setConfig('dataRepo', REPO!)
    setConfig('dataBranch', BRANCH)
  })

  afterAll(async () => {
    // Remove the throwaway file so reruns start clean
    const gh = await import('../github')
    const remote = await gh.getFile(TEST_PATH)
    if (remote) {
      await fetch(`https://api.github.com/repos/${REPO}/contents/${TEST_PATH}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          Accept: 'application/vnd.github+json',
        },
        body: JSON.stringify({ message: 'Clean up integration test', sha: remote.sha, branch: BRANCH }),
      })
    }
  })

  it('validates the token against the repo', async () => {
    const { validateToken } = await import('../github')
    const check = await validateToken(REPO!, TOKEN!, BRANCH)
    expect(check).toEqual({ ok: true })
  })

  it('bootstraps seed files when missing', async () => {
    const { ensureSeedFiles } = await import('../sync')
    const gh = await import('../github')
    await ensureSeedFiles()
    const categories = await gh.getFile('categories.json')
    expect(categories).not.toBeNull()
    expect(JSON.parse(categories!.content).categories.length).toBeGreaterThan(0)
  })

  it('round-trips a local-first write through flush', async () => {
    const sync = await import('../sync')
    const gh = await import('../github')
    const tx = {
      id: crypto.randomUUID(),
      type: 'expense',
      amount: 10,
      date: '2026-07-03',
      category: 'food-drink',
      note: 'integration test tea',
      source: 'manual',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    sync.updateFile(TEST_PATH, [], () => [tx])
    await sync.flush()
    const remote = await gh.getFile(TEST_PATH)
    expect(remote).not.toBeNull()
    expect(JSON.parse(remote!.content)).toEqual([tx])
  }, 30_000)

  it('merges on sha conflict instead of losing either side', async () => {
    const sync = await import('../sync')
    const gh = await import('../github')
    const cache = await import('../cache')

    // Someone else (another device) adds a transaction directly
    const remoteBefore = await gh.getFile(TEST_PATH)
    const remoteTxs = JSON.parse(remoteBefore!.content)
    const otherDeviceTx = { ...remoteTxs[0], id: crypto.randomUUID(), note: 'from other device' }
    await gh.putFile(
      TEST_PATH,
      JSON.stringify([...remoteTxs, otherDeviceTx], null, 2),
      remoteBefore!.sha,
      'Simulate other device',
    )

    // This device, holding the now-stale sha, adds a different transaction
    const localTx = { ...remoteTxs[0], id: crypto.randomUUID(), note: 'from this device' }
    sync.updateFile<unknown[]>(TEST_PATH, [], (current) => [...current, localTx])
    await sync.flush()

    // The Contents API can serve a slightly stale read right after a commit —
    // poll briefly for the merged state instead of asserting on the first read.
    let notes: string[] = []
    for (let attempt = 0; attempt < 10; attempt++) {
      const remoteAfter = await gh.getFile(TEST_PATH)
      notes = (JSON.parse(remoteAfter!.content) as { note: string }[]).map((t) => t.note)
      if (notes.includes('from this device') && notes.includes('from other device')) break
      await new Promise((r) => setTimeout(r, 1000))
    }
    expect(notes).toContain('from other device')
    expect(notes).toContain('from this device')
    expect(cache.getDirtyPaths()).toEqual([])
  }, 30_000)
})
