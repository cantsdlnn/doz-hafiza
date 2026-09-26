import type { DoseEvent, MedicationPlan } from './domain';

export interface AppData {
  plans: MedicationPlan[];
  events: DoseEvent[];
}

const STORAGE_KEY = 'doz-hafiza:v1';
const EMPTY: AppData = { plans: [], events: [] };

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(EMPTY);
    const parsed = JSON.parse(raw) as Partial<AppData>;
    return {
      plans: Array.isArray(parsed.plans) ? parsed.plans : [],
      events: Array.isArray(parsed.events) ? parsed.events : [],
    };
  } catch {
    return structuredClone(EMPTY);
  }
}

export function saveData(data: AppData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function clearData(): void {
  localStorage.removeItem(STORAGE_KEY);
}
