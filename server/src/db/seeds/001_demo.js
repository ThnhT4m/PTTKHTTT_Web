import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';

/** Destructive development fixture, never run against a production database. */
export async function seed(knex) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Demo seed is disabled in production.');
  }
  const password_hash = await bcrypt.hash('Demo@12345', 10);
  const users = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      full_name: 'Khách hàng Demo',
      email: 'customer@example.com',
      role: 'CUSTOMER',
      phone: '0901000001',
    },
    {
      id: '11111111-1111-4111-8111-111111111112',
      full_name: 'Khách hàng Demo 2',
      email: 'customer2@example.com',
      role: 'CUSTOMER',
      phone: '0901000002',
    },
    {
      id: '22222222-2222-4222-8222-222222222221',
      full_name: 'Quản lý Minh',
      email: 'manager1@example.com',
      role: 'VENUE_MANAGER',
      phone: '0902000001',
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      full_name: 'Quản lý Linh',
      email: 'manager2@example.com',
      role: 'VENUE_MANAGER',
      phone: '0902000002',
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      full_name: 'Quản trị viên',
      email: 'admin@example.com',
      role: 'ADMIN',
      phone: '0903000001',
    },
  ].map((user) => ({ ...user, password_hash }));
  const venues = [
    {
      id: '44444444-4444-4444-8444-444444444441',
      manager_id: users[2].id,
      name: 'Thể thao Thủ Đức',
      address: '97 Man Thiện, TP. Thủ Đức, TP.HCM',
      district: 'Thủ Đức',
      description: 'Cụm sân bóng đá và cầu lông; dữ liệu mẫu phục vụ phát triển.',
      payment_hold_minutes: 10,
    },
    {
      id: '44444444-4444-4444-8444-444444444442',
      manager_id: users[3].id,
      name: 'Thể thao Bình Thạnh',
      address: '45 Nguyễn Gia Trí, Bình Thạnh, TP.HCM',
      district: 'Bình Thạnh',
      description: 'Cụm sân pickleball và tennis; quản lý độc lập để kiểm thử quyền sở hữu.',
      payment_hold_minutes: 5,
    },
    {
      id: '44444444-4444-4444-8444-444444444443',
      manager_id: users[2].id,
      name: 'Thể thao Quận 7',
      address: '120 Nguyễn Thị Thập, Quận 7, TP.HCM',
      district: 'Quận 7',
      description: 'Cụm sân bóng rổ và cầu lông; dữ liệu mẫu.',
      payment_hold_minutes: 10,
    },
  ];
  const courts = [
    {
      id: '55555555-5555-4555-8555-555555555551',
      venue_id: venues[0].id,
      name: 'Sân bóng đá 01',
      sport_type: 'FOOTBALL',
      hourly_price: 300000,
      description: 'Sân cỏ nhân tạo 5 người.',
    },
    {
      id: '55555555-5555-4555-8555-555555555552',
      venue_id: venues[0].id,
      name: 'Sân cầu lông 01',
      sport_type: 'BADMINTON',
      hourly_price: 80000,
      description: 'Sân trong nhà.',
    },
    {
      id: '55555555-5555-4555-8555-555555555553',
      venue_id: venues[1].id,
      name: 'Sân pickleball 01',
      sport_type: 'PICKLEBALL',
      hourly_price: 160000,
      description: 'Sân ngoài trời.',
    },
    {
      id: '55555555-5555-4555-8555-555555555554',
      venue_id: venues[1].id,
      name: 'Sân tennis 01',
      sport_type: 'TENNIS',
      hourly_price: 200000,
      description: 'Sân tennis tiêu chuẩn.',
    },
    {
      id: '55555555-5555-4555-8555-555555555555',
      venue_id: venues[2].id,
      name: 'Sân bóng rổ 01',
      sport_type: 'BASKETBALL',
      hourly_price: 180000,
      description: 'Sân bóng rổ ngoài trời.',
    },
    {
      id: '55555555-5555-4555-8555-555555555556',
      venue_id: venues[2].id,
      name: 'Sân cầu lông 02',
      sport_type: 'BADMINTON',
      hourly_price: 80000,
      description: 'Sân trong nhà.',
    },
  ];
  const vnParts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date())
      .filter((x) => x.type !== 'literal')
      .map((x) => [x.type, x.value]),
  );
  const today = new Date(`${vnParts.year}-${vnParts.month}-${vnParts.day}T00:00:00Z`);
  const slots = [];
  for (let day = -1; day <= 30; day += 1) {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() + day);
    const slot_date = date.toISOString().slice(0, 10);
    for (const court of courts) {
      for (let hour = 6; hour < 22; hour += 1) {
        slots.push({
          id: randomUUID(),
          court_id: court.id,
          slot_date,
          start_time: `${String(hour).padStart(2, '0')}:00:00`,
          end_time: `${String(hour + 1).padStart(2, '0')}:00:00`,
          price: court.hourly_price,
          status: 'AVAILABLE',
        });
      }
    }
  }
  await knex.transaction(async (trx) => {
    await trx.raw(
      'TRUNCATE audit_logs, reviews, refunds, booking_reschedules, payments, bookings, time_slots, courts, sport_venues, users CASCADE',
    );
    await trx('users').insert(users);
    await trx('sport_venues').insert(venues);
    await trx('courts').insert(courts);
    // Fixed demo fixture; this is not a runtime schedule-generation endpoint/job.
    for (let offset = 0; offset < slots.length; offset += 500) {
      await trx('time_slots').insert(slots.slice(offset, offset + 500));
    }
  });
}
