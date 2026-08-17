import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateDashboardIndexes, filterWeekendDashboardStates, getCompletionZone, getDashboardPeriods, getPerformanceColor, getProblemDashboardStates } from '../src/dashboard-periods.js';

describe('dashboard history periods', () => {
  it('returns five weeks in chronological order through the selected week', () => {
    const periods = getDashboardPeriods('weekly', '2026-07-30', '2026-07-30');

    assert.equal(periods.length, 5);
    assert.deepEqual(periods.map(({ start, end }) => [start, end]), [
      ['2026-06-29', '2026-07-05'],
      ['2026-07-06', '2026-07-12'],
      ['2026-07-13', '2026-07-19'],
      ['2026-07-20', '2026-07-26'],
      ['2026-07-27', '2026-08-02'],
    ]);
  });

  it('returns the selected month and four preceding months across a year boundary', () => {
    const periods = getDashboardPeriods('monthly', '2026-02-10', '2026-07-30');

    assert.deepEqual(periods.map(({ start }) => start), [
      '2025-10-01',
      '2025-11-01',
      '2025-12-01',
      '2026-01-01',
      '2026-02-01',
    ]);
  });

  it('does not build weekly or monthly periods from a future selected date', () => {
    const weekly = getDashboardPeriods('weekly', '2026-09-15', '2026-07-30');
    const monthly = getDashboardPeriods('monthly', '2026-09-15', '2026-07-30');

    assert.equal(weekly.at(-1).start, '2026-07-27');
    assert.equal(monthly.at(-1).start, '2026-07-01');
  });
});

describe('weekend dashboard states', () => {
  const state = (date, { filled = false, weekendRequired = false } = {}) => ({
    metric: { category: 'daily', weekendRequired },
    period: { start: date },
    filled,
  });

  it('keeps an empty weekend metric when its column N checkbox is checked', () => {
    const required = state('2026-08-09', { weekendRequired: true });

    assert.deepEqual(filterWeekendDashboardStates([required]), [required]);
  });

  it('excludes an empty optional weekend metric from dots and dashboard score', () => {
    assert.deepEqual(filterWeekendDashboardStates([state('2026-08-08')]), []);
  });

  it('keeps filled weekend data even when the checkbox is not checked', () => {
    const filled = state('2026-08-08', { filled: true });

    assert.deepEqual(filterWeekendDashboardStates([filled]), [filled]);
  });

  it('does not filter weekday or non-daily states', () => {
    const weekday = state('2026-08-10');
    const weekly = { ...state('2026-08-08'), metric: { category: 'weekly', weekendRequired: false } };

    assert.deepEqual(filterWeekendDashboardStates([weekday, weekly]), [weekday, weekly]);
  });
});

describe('dashboard indexes', () => {
  it('returns only metrics with errors or missing data for employee details', () => {
    const states = [
      { status: 'done', metric: 'ok' },
      { status: 'fixed', metric: 'fixed' },
      { status: 'issue', metric: 'issue' },
      { status: 'empty', metric: 'empty' },
    ];

    assert.deepEqual(getProblemDashboardStates(states).map(({ metric }) => metric), ['issue', 'empty']);
  });

  it('uses a continuous red-to-green scale above the bad zone', () => {
    assert.equal(getPerformanceColor(84), 'hsl(355 78% 45%)');
    assert.equal(getPerformanceColor(90), 'hsl(40 78% 45%)');
    assert.equal(getPerformanceColor(96), 'hsl(88 78% 45%)');
    assert.equal(getPerformanceColor(100), 'hsl(120 78% 45%)');
  });
  it('calculates health only from filled values and completion from all required values', () => {
    const states = [
      { status: 'done' },
      { status: 'fixed' },
      { status: 'issue' },
      { status: 'empty' },
    ];

    assert.deepEqual(calculateDashboardIndexes(states), {
      health: 67,
      completion: 75,
      filled: 3,
      total: 4,
    });
  });

  it('uses red below 85%, yellow below 95%, and green from 95%', () => {
    assert.equal(getCompletionZone(84), 'danger');
    assert.equal(getCompletionZone(85), 'warning');
    assert.equal(getCompletionZone(94), 'warning');
    assert.equal(getCompletionZone(95), 'success');
  });
});
