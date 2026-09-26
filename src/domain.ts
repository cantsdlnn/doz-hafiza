export type DoseStatus = 'taken' | 'skipped';
export type TimelineState = DoseStatus | 'upcoming' | 'due' | 'missed';

export interface MedicationPlan {
  id: string;
  name: string;
  doseLabel: string;
  times: string[];
  startDate: string;
  endDate?: string;
}

export interface DoseEvent {
  key: string;
  status: DoseStatus;
  recordedAt: string;
}

export interface ScheduledDose {
  key: string;
  planId: string;
  name: string;
  doseLabel: string;
  time: string;
  scheduledAt: Date;
}

export interface AdherenceSummary {
  planned: number;
  taken: number;
  skipped: number;
  missed: number;
  percentage: number | null;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function validatePlan(plan: MedicationPlan): string[] {
  const errors: string[] = [];
  if (!plan.name.trim()) errors.push('İlaç adı gerekli.');
  if (!plan.doseLabel.trim()) errors.push('Doz etiketi gerekli.');
  if (!DATE_PATTERN.test(plan.startDate)) errors.push('Başlangıç tarihi geçersiz.');
  if (plan.endDate && !DATE_PATTERN.test(plan.endDate)) errors.push('Bitiş tarihi geçersiz.');
  if (plan.endDate && plan.endDate < plan.startDate) errors.push('Bitiş başlangıçtan önce olamaz.');
  if (!plan.times.length || plan.times.some((time) => !TIME_PATTERN.test(time))) {
    errors.push('En az bir geçerli saat gerekli.');
  }
  if (new Set(plan.times).size !== plan.times.length) errors.push('Aynı saat iki kez eklenemez.');
  return errors;
}

export function doseKey(planId: string, date: string, time: string): string {
  return `${planId}|${date}|${time}`;
}

export function buildDailySchedule(plans: MedicationPlan[], date: string): ScheduledDose[] {
  if (!DATE_PATTERN.test(date)) return [];
  return plans
    .filter((plan) => plan.startDate <= date && (!plan.endDate || plan.endDate >= date))
    .flatMap((plan) =>
      [...new Set(plan.times)].sort().map((time) => ({
        key: doseKey(plan.id, date, time),
        planId: plan.id,
        name: plan.name,
        doseLabel: plan.doseLabel,
        time,
        scheduledAt: new Date(`${date}T${time}:00`),
      })),
    )
    .sort((left, right) => left.scheduledAt.getTime() - right.scheduledAt.getTime());
}

export function doseState(
  dose: ScheduledDose,
  events: DoseEvent[],
  now: Date,
  graceMinutes = 30,
): TimelineState {
  const event = events.find((item) => item.key === dose.key);
  if (event) return event.status;
  const differenceMinutes = (now.getTime() - dose.scheduledAt.getTime()) / 60_000;
  if (differenceMinutes < -graceMinutes) return 'upcoming';
  if (differenceMinutes <= graceMinutes) return 'due';
  return 'missed';
}

export function adherenceSummary(
  doses: ScheduledDose[],
  events: DoseEvent[],
  now: Date,
): AdherenceSummary {
  const elapsed = doses.filter((dose) => dose.scheduledAt <= now);
  const states = elapsed.map((dose) => doseState(dose, events, now));
  const taken = states.filter((state) => state === 'taken').length;
  const skipped = states.filter((state) => state === 'skipped').length;
  const missed = states.filter((state) => state === 'missed').length;
  return {
    planned: elapsed.length,
    taken,
    skipped,
    missed,
    percentage: elapsed.length ? Math.round((taken / elapsed.length) * 100) : null,
  };
}

export function nextDose(
  doses: ScheduledDose[],
  events: DoseEvent[],
  now: Date,
): ScheduledDose | null {
  return (
    doses.find((dose) => {
      const state = doseState(dose, events, now);
      return state === 'upcoming' || state === 'due';
    }) ?? null
  );
}
