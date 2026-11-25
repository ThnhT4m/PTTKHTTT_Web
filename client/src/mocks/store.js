import { createFixtures } from './data.js';
import { todayVN } from '../utils/format.js';

export const CATALOGUE_STORE_KEY = 'sportbooking.mock.catalogue.v2';
const CLOCK_KEY = 'sportbooking.mock.fixture-clock.v1';
const parse = (value) => { try { return JSON.parse(value); } catch { return null; } };
export function createMockStore(storage, now) {
  let raw = storage?.getItem(CATALOGUE_STORE_KEY) || null;
  const saved = parse(raw);
  let anchor = saved?.anchor || Number(storage?.getItem(CLOCK_KEY));
  if (!anchor || (!saved && todayVN(anchor) !== todayVN(now()))) anchor = now();
  storage?.setItem(CLOCK_KEY, String(anchor));
  let base = createFixtures(anchor);
  function restore(state) {
    if (!state) return structuredClone(base);
    if (state.anchor !== anchor) { anchor = state.anchor; base = createFixtures(anchor); }
    const result = structuredClone(base), overrides = new Map(state.slots.map((s) => [s.id, s]));
    result.venues = state.venues; result.courts = state.courts;
    result.slots = result.slots.map((s) => { const replacement = overrides.get(s.id); overrides.delete(s.id); return replacement || s; }).concat([...overrides.values()]);
    result.audits.push(...state.audits);
    for (const key of ['users', 'bookings', 'payments', 'refunds', 'reschedules', 'reviews']) if (state[key]) {
      const changes = new Map(state[key].map((row) => [row.id, row]));
      result[key] = result[key].map((row) => { const updated = changes.get(row.id); changes.delete(row.id); return updated || row; }).concat([...changes.values()]);
    }
    result.credentials = state.credentials || {};
    return result;
  }
  let db = restore(saved);
  return {
    read() {
      if (!storage) return db;
      const current = storage?.getItem(CATALOGUE_STORE_KEY) || null;
      if (current !== raw) { raw = current; db = restore(parse(current)); }
      return db;
    },
    commit(staged) {
      // Persist only catalogue changes, not thousands of unchanged seed slots.
      const baseSlots = new Map(base.slots.map((s) => [s.id, JSON.stringify(s)])), seedAudits = new Set(base.audits.map((a) => a.id));
      const business = Object.fromEntries(['users', 'bookings', 'payments', 'refunds', 'reschedules', 'reviews'].map((key) => {
        const seeds = new Map(base[key].map((row) => [row.id, JSON.stringify(row)]));
        return [key, staged[key].filter((row) => seeds.get(row.id) !== JSON.stringify(row))];
      }));
      const next = JSON.stringify({ schema: 2, anchor, venues: staged.venues, courts: staged.courts,
        slots: staged.slots.filter((s) => baseSlots.get(s.id) !== JSON.stringify(s)),
        audits: staged.audits.filter((a) => !seedAudits.has(a.id)),
        ...business, credentials: staged.credentials || {},
      });
      storage?.setItem(CATALOGUE_STORE_KEY, next);
      raw = next; db = staged;
    },
  };
}
