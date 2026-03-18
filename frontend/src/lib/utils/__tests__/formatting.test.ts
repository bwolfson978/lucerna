import { describe, it, expect } from 'vitest'
import { formatCurrency, formatPercent, formatAge } from '@/lib/utils/formatting'

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
