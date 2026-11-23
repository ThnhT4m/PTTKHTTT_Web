import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, vietnamDate, slotTemplates } from '../../src/lib/calendar.js';

test('Ngày lịch đổi lúc 00:00 Việt Nam, không phải 00:00 UTC', () => {
  assert.equal(vietnamDate(new Date('2026-11-23T16:59:59Z')), '2026-11-23');
  assert.equal(vietnamDate(new Date('2026-11-23T17:00:00Z')), '2026-11-24');
});

test('Khoảng 30 ngày qua tháng, năm và ngày nhuận giữ đúng ngày lịch', () => {
  assert.equal(addDays('2026-12-20', 29), '2027-01-18');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2028-02-28', 2), '2028-03-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('Lịch 30 ngày: mỗi sân đủ 16 ca 60 phút, không trùng hoặc chồng lấn', () => {
  const courts = [{ id: 'court-a', hourly_price: 80000 }, { id: 'court-b', hourly_price: 160000 }];
  const slots = slotTemplates(courts, '2026-12-20', 30);
  assert.equal(slots.length, 960);
  const keys = new Set();
  for (const court of courts) {
    for (let day = 0; day < 30; day += 1) {
      const date = addDays('2026-12-20', day);
      const windows = slots.filter((s) => s.court_id === court.id && s.slot_date === date);
      assert.equal(windows.length, 16);
      assert.equal(windows[0].start_time, '06:00:00');
      assert.equal(windows.at(-1).end_time, '22:00:00');
      for (let i = 0; i < windows.length; i += 1) {
        const slot = windows[i];
        const key = `${slot.court_id}/${slot.slot_date}/${slot.start_time}/${slot.end_time}`;
        assert.ok(!keys.has(key));
        keys.add(key);
        assert.equal(slot.price, court.hourly_price);
        assert.equal(Number(slot.end_time.slice(0, 2)) - Number(slot.start_time.slice(0, 2)), 1);
        if (i) assert.equal(windows[i - 1].end_time, slot.start_time);
      }
    }
  }
  assert.equal(slots.at(-1).slot_date, '2027-01-18');
});
