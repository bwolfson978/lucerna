import { describe, it, expect } from 'vitest'
import { computeSnapThreshold, maybeSnap } from '@/lib/utils/snap'

describe('computeSnapThreshold', () => {
  it('returns 1.5% of range for a typical IRA balance', () => {
    expect(computeSnapThreshold(0, 210_000)).toBe(3150)
  })

  it('floors at step for small ranges', () => {
    // 1.5% of 5000 = 75, below default step of 100
    expect(computeSnapThreshold(0, 5000)).toBe(100)
  })

  it('scales for large ranges', () => {
    expect(computeSnapThreshold(0, 2_000_000)).toBe(30_000)
  })

  it('handles zero range', () => {
    expect(computeSnapThreshold(0, 0)).toBe(100)
  })

  it('respects custom step as floor', () => {
    expect(computeSnapThreshold(0, 5000, 200)).toBe(200)
  })
})

describe('maybeSnap', () => {
  const min = 0
  const max = 210_000
  // threshold = 3150

  it('snaps when value is within threshold of optimal', () => {
    expect(maybeSnap(127_700, 130_000, min, max)).toBe(130_000)
  })

  it('does not snap when value is outside threshold', () => {
    expect(maybeSnap(100_000, 130_000, min, max)).toBe(100_000)
  })

  it('snaps on exact match', () => {
    expect(maybeSnap(130_000, 130_000, min, max)).toBe(130_000)
  })

  it('snaps at boundary of threshold', () => {
    // Exactly at threshold distance (3150)
    expect(maybeSnap(130_000 - 3150, 130_000, min, max)).toBe(130_000)
  })

  it('does not snap just outside threshold', () => {
    expect(maybeSnap(130_000 - 3151, 130_000, min, max)).toBe(130_000 - 3151)
  })

  it('handles optimal at zero', () => {
    expect(maybeSnap(1000, 0, min, max)).toBe(0)
  })

  it('handles optimal at max', () => {
    expect(maybeSnap(208_000, 210_000, min, max)).toBe(210_000)
  })
})
