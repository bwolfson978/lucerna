import { describe, it, expect } from 'vitest'
import { formatCurrency, formatPercent, formatAge, formatCompactCurrency } from '@/lib/utils/formatting'

describe('formatCurrency', () => {
  it('formats whole dollars with commas', () => {
    expect(formatCurrency(1234567)).toBe('$1,234,567')
  })

  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('$0')
  })

  it('formats negative values', () => {
    expect(formatCurrency(-5000)).toBe('-$5,000')
  })
})

describe('formatPercent', () => {
  it('formats decimal as percentage', () => {
    expect(formatPercent(0.22)).toBe('22%')
  })

  it('formats zero', () => {
    expect(formatPercent(0)).toBe('0%')
  })
})

describe('formatAge', () => {
  it('returns age as string with label', () => {
    expect(formatAge(65)).toBe('Age 65')
  })
})

describe('formatCompactCurrency', () => {
  it('returns full format below $100,000', () => {
    expect(formatCompactCurrency(45200)).toBe('$45,200')
  })

  it('returns full format at $99,999', () => {
    expect(formatCompactCurrency(99999)).toBe('$99,999')
  })

  it('returns compact K format at $100,000', () => {
    expect(formatCompactCurrency(100000)).toBe('$100K')
  })

  it('returns compact K format for large values', () => {
    expect(formatCompactCurrency(210000)).toBe('$210K')
  })

  it('rounds to nearest thousand', () => {
    expect(formatCompactCurrency(210500)).toBe('$211K')
  })

  it('formats zero', () => {
    expect(formatCompactCurrency(0)).toBe('$0')
  })

  it('handles negative values below threshold', () => {
    expect(formatCompactCurrency(-5000)).toBe('-$5,000')
  })

  it('handles negative values above threshold', () => {
    expect(formatCompactCurrency(-150000)).toBe('-$150K')
  })

  it('formats values at 1M with M notation', () => {
    expect(formatCompactCurrency(1000000)).toBe('$1M')
  })

  it('formats values above 1M with one decimal', () => {
    expect(formatCompactCurrency(1500000)).toBe('$1.5M')
  })

  it('formats 1.336M', () => {
    expect(formatCompactCurrency(1336000)).toBe('$1.3M')
  })

  it('handles negative millions', () => {
    expect(formatCompactCurrency(-2500000)).toBe('-$2.5M')
  })
})
