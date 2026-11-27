import test from 'node:test';
import assert from 'node:assert/strict';
import { metadataErrors, canEditSlotPrice } from '../src/utils/managerValidation.js';
import { readPages } from '../src/api/pagination.js';
test('Backend metadata boundaries: court name 120, address 3–300, trim before length validation', () => {
  assert.deepEqual(metadataErrors('courts', { name: ' ' + 'S'.repeat(120) + ' ', sport_type: 'TENNIS', hourly_price: 0 }), {});
  assert.ok(metadataErrors('courts', { name: 'S'.repeat(121), sport_type: 'TENNIS', hourly_price: 0 }).name);
  const values = { name: 'Cơ sở hợp lệ', district: 'Quận 7', address: 'A'.repeat(300) };
  assert.deepEqual(metadataErrors('venues', values), {});
  for (const address of ['ab', '  a ', 'A'.repeat(301)]) assert.ok(metadataErrors('venues', { ...values, address }).address);
});
test('Pagination preserves the last response server_time for server-clock decisions', async () => {
  const stamps = ['2026-11-27T03:00:00Z', '2026-11-27T03:00:02Z']; let page = 0;
  const result = await readPages(async () => ({ data: page === 0 ? [{ id: 1 }, { id: 2 }] : [{ id: 3 }], server_time: stamps[page++] }), '/venues', { pageSize: 2 });
  assert.equal(result.server_time, stamps[1]); assert.deepEqual(result.data.map((r) => r.id), [1, 2, 3]);
});
test('Slot price eligibility accepts an explicit server clock even when browser clock differs', () => {
  const slot = { status: 'AVAILABLE', start_at: '2026-11-27T04:00:00Z' }, serverNow = Date.parse('2026-11-27T03:30:00Z');
  assert.equal(canEditSlotPrice(slot, serverNow), true); assert.equal(canEditSlotPrice(slot, serverNow + 3600000), false);
});
