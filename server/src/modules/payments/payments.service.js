import { randomUUID } from 'node:crypto';
import { db } from '../../db/knex.js';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/http.js';
import { assertOperational } from '../../lib/locking.js';
import { writeAudit } from '../../lib/audit.js';
import {
  locateBooking,
  lockBooking,
  assertBookingAccess,
} from '../bookings/bookings.repository.js';

const conflict = (code, message) => new AppError(409, code, message);

function assertPayable({ booking, slot, now }) {
  if (booking.status !== 'PENDING' || booking.source !== 'ONLINE') {
    throw conflict('BOOKING_NOT_PAYABLE', 'Đơn này không còn chờ thanh toán online.');
  }
  if (slot.status !== 'HELD' || !slot.held_until || new Date(slot.held_until) <= new Date(now)) {
    throw conflict('HOLD_EXPIRED', 'Thời gian giữ chỗ đã hết. Vui lòng chọn khung giờ khác.');
  }
}

export async function createPayment(user, input) {
  const snapshot = await locateBooking(db, input.booking_id);
  return db.transaction(async (trx) => {
    const context = await lockBooking(trx, snapshot);
    assertBookingAccess(user, context);
    assertOperational(context.court);
    assertPayable(context);
    const [payment] = await trx('payments')
      .insert({
        booking_id: context.booking.id,
        method: input.method,
        transaction_code: `SANDBOX-${randomUUID()}`,
        status: 'PENDING',
        amount: context.booking.total_amount,
      })
      .returning('*');
    return payment;
  });
}

export async function confirmPayment(user, input) {
  if (!env.paymentSandboxEnabled) {
    throw new AppError(
      403,
      'SANDBOX_DISABLED',
      'Xác nhận thanh toán demo đang tắt. Cần tích hợp callback có chữ ký từ cổng thanh toán thật.',
    );
  }
  const paymentSnapshot = await db('payments')
    .where({ transaction_code: input.transaction_code })
    .first();
  if (!paymentSnapshot)
    throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Không tìm thấy giao dịch thanh toán.');
  const snapshot = await locateBooking(db, paymentSnapshot.booking_id);
  return db.transaction(async (trx) => {
    const context = await lockBooking(trx, snapshot);
    assertBookingAccess(user, context);
    const payment = await trx('payments').where({ id: paymentSnapshot.id }).forUpdate().first();
    // Same transaction code can be delivered again safely, even after the
    // booking was completed or rescheduled; no second debit or state changes.
    if (payment.status === 'PAID') return { ...payment, idempotent: true };
    if (payment.status !== 'PENDING')
      throw conflict('PAYMENT_FINALIZED', 'Giao dịch đã kết thúc, không thể xác nhận lại.');
    assertOperational(context.court);
    assertPayable(context);
    if (Number(payment.amount) !== Number(context.booking.total_amount)) {
      throw conflict('PAYMENT_AMOUNT_MISMATCH', 'Số tiền giao dịch không khớp với đơn.');
    }
    const [paid] = await trx('payments')
      .where({ id: payment.id })
      .update({ status: 'PAID', updated_at: trx.fn.now() })
      .returning('*');
    await trx('bookings')
      .where({ id: context.booking.id })
      .update({ status: 'CONFIRMED', updated_at: trx.fn.now() });
    await trx('time_slots')
      .where({ id: context.slot.id, status: 'HELD' })
      .update({
        status: 'BOOKED',
        held_until: null,
        version: trx.raw('version + 1'),
        updated_at: trx.fn.now(),
      });
    await writeAudit(trx, {
      actorId: user.id,
      action: 'PAYMENT_CONFIRMED_SANDBOX',
      entityType: 'payment',
      entityId: payment.id,
      before: { status: payment.status },
      after: { status: paid.status, booking_id: payment.booking_id, amount: payment.amount },
    });
    return paid;
  });
}
