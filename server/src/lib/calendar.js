// Calendar arithmetic is UTC-based; venue dates themselves are Vietnam dates.
// Keep this module independent of the machine timezone and HTTP/database code.
export function vietnamDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

export function addDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function slotTemplates(courts, startDate, days) {
  const slots = [];
  for (let day = 0; day < days; day += 1) {
    for (const court of courts) {
      for (let hour = 6; hour < 22; hour += 1) {
        slots.push({
          court_id: court.id, slot_date: addDays(startDate, day),
          start_time: `${String(hour).padStart(2, '0')}:00:00`,
          end_time: `${String(hour + 1).padStart(2, '0')}:00:00`,
          price: court.hourly_price,
        });
      }
    }
  }
  return slots;
}
