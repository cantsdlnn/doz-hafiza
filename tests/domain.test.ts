import { describe, expect, it } from 'vitest';
import {
  adherenceSummary,
  buildDailySchedule,
  doseKey,
  doseState,
  nextDose,
  validatePlan,
  type MedicationPlan,
} from '../src/domain';

const plan: MedicationPlan = {
  id: 'a',
  name: 'Plan A',
  doseLabel: '1 birim',
  times: ['20:00', '08:00'],
  startDate: '2026-09-01',
  endDate: '2026-09-30',
};

describe('plan validation', () => {
  it('accepts a complete plan', () => expect(validatePlan(plan)).toEqual([]));
  it('rejects missing fields, duplicate time and reversed date range', () => {
    const errors = validatePlan({
      ...plan,
      name: '',
      doseLabel: '',
      times: ['08:00', '08:00'],
      startDate: 'bad',
      endDate: '2025-01-01',
    });
    expect(errors.length).toBeGreaterThanOrEqual(4);
  });
  it('rejects invalid and empty time lists', () => {
    expect(validatePlan({ ...plan, times: [] })).toContain('En az bir geçerli saat gerekli.');
    expect(validatePlan({ ...plan, times: ['25:00'] })).toContain(
      'En az bir geçerli saat gerekli.',
    );
  });
});

describe('daily schedule', () => {
  it('builds sorted doses inside the active range', () => {
    const doses = buildDailySchedule([plan], '2026-09-26');
    expect(doses.map((dose) => dose.time)).toEqual(['08:00', '20:00']);
    expect(doses[0]?.key).toBe(doseKey('a', '2026-09-26', '08:00'));
  });
  it('excludes inactive plans and invalid dates', () => {
    expect(buildDailySchedule([plan], '2026-10-01')).toEqual([]);
    expect(buildDailySchedule([plan], 'not-date')).toEqual([]);
  });
  it('deduplicates repeated times defensively', () => {
    expect(buildDailySchedule([{ ...plan, times: ['08:00', '08:00'] }], '2026-09-26')).toHaveLength(
      1,
    );
  });
});

describe('dose state and summary', () => {
  const doses = buildDailySchedule([plan], '2026-09-26');
  it('distinguishes upcoming, due and missed records', () => {
    expect(doseState(doses[0]!, [], new Date('2026-09-26T06:00:00'))).toBe('upcoming');
    expect(doseState(doses[0]!, [], new Date('2026-09-26T08:15:00'))).toBe('due');
    expect(doseState(doses[0]!, [], new Date('2026-09-26T09:00:00'))).toBe('missed');
  });
  it('uses an explicit event before the calculated state', () => {
    expect(
      doseState(
        doses[0]!,
        [{ key: doses[0]!.key, status: 'taken', recordedAt: 'x' }],
        new Date('2026-09-27T09:00:00'),
      ),
    ).toBe('taken');
  });
  it('calculates adherence using elapsed doses only', () => {
    const events = [{ key: doses[0]!.key, status: 'taken' as const, recordedAt: 'x' }];
    expect(adherenceSummary(doses, events, new Date('2026-09-26T12:00:00'))).toEqual({
      planned: 1,
      taken: 1,
      skipped: 0,
      missed: 0,
      percentage: 100,
    });
  });
  it('returns a neutral summary before the first dose', () => {
    expect(adherenceSummary(doses, [], new Date('2026-09-26T06:00:00')).percentage).toBeNull();
  });
  it('finds the next unrecorded dose', () => {
    expect(nextDose(doses, [], new Date('2026-09-26T07:50:00'))?.time).toBe('08:00');
    const events = doses.map((dose) => ({
      key: dose.key,
      status: 'taken' as const,
      recordedAt: 'x',
    }));
    expect(nextDose(doses, events, new Date('2026-09-26T07:50:00'))).toBeNull();
  });
});
