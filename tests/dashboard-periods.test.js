import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getDashboardPeriods } from '../src/dashboard-periods.js';

describe('dashboard history periods', () => {
  it('returns the selected week and four preceding weeks', () => {
    const periods = getDashboardPeriods('weekly', '2026-07-30', '2026-07-30');

    assert.equal(periods.length, 5);
    assert.deepEqual(periods.map(({ start, end }) => [start, end]), [
      ['2026-07-27', '2026-08-02'],
      ['2026-07-20', '2026-07-26'],
      ['2026-07-13', '2026-07-19'],
      ['2026-07-06', '2026-07-12'],
      ['2026-06-29', '2026-07-05'],
    ]);
  });

  it('returns the selected month and four preceding months across a year boundary', () => {
    const periods = getDashboardPeriods('monthly', '2026-02-10', '2026-07-30');

    assert.deepEqual(periods.map(({ start }) => start), [
      '2026-02-01',
      '2026-01-01',
      '2025-12-01',
      '2025-11-01',
      '2025-10-01',
    ]);
  });

  it('does not build weekly or monthly periods from a future selected date', () => {
    const weekly = getDashboardPeriods('weekly', '2026-09-15', '2026-07-30');
    const monthly = getDashboardPeriods('monthly', '2026-09-15', '2026-07-30');

    assert.equal(weekly[0].start, '2026-07-27');
    assert.equal(monthly[0].start, '2026-07-01');
  });
});
