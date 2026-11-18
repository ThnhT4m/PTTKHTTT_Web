import { db } from '../../db/knex.js';
import { AppError } from '../../lib/http.js';
import { writeAudit } from '../../lib/audit.js';
import { lockVenueCourts, lockSlots, assertOperational } from '../../lib/locking.js';
import { assertVenueOwner } from '../../middlewares/venueOwner.js';
import { bookingDetail, locateBooking, lockBooking } from '../bookings/bookings.repository.js';

function authorize(user, booking, court) {
  if (user.role === 'ADMIN') return;
  if (user.role === 'VENUE_MANAGER') return assertVenueOwner(user, court);
  if (user.role === 'CUSTOMER' && booking.customer_id === user.id) return;
  throw new AppError(403, 'FORBIDDEN', 'Bạn không có quyền xử lý đơn đặt sân này.');
}

function managerOnly(user, court) {
  if (!['VENUE_MANAGER', 'ADMIN'].includes(user.role)) {
    throw new AppError(403, 'FORBIDDEN', 'Chỉ quản lý cơ sở hoặc ADMIN được xử lý nghiệp vụ này.');
  }
  assertVenueOwner(user, court);
}

async function snapshotFor(id) {
  const snapshot = await locateBooking(db, id);
  if (!snapshot) throw new AppError(404, 'BOOKING_NOT_FOUND', 'Không tìm thấy đơn đặt sân.');
  return snapshot;
}

function confirmed(booking) {
  if (booking.status !== 'CONFIRMED') {
    throw new AppError(409, 'INVALID_BOOKING_STATE', 'Nghiệp vụ chỉ áp dụng cho đơn đã xác nhận.');
  }
}

async function activeRefund(trx, bookingId) {
  return trx('refunds').where({ booking_id: bookingId }).forUpdate().first();
}

async function bumpSlot(trx, id, changes) {
  const [slot] = await trx('time_slots')
    .where({ id })
    .update({
      ...changes,
      version: trx.raw('version + 1'),
      updated_at: trx.fn.now(),
    })
    .returning('*');
  return slot;
}

export async function rescheduleBooking(user, id, input) {
  const snapshot = await snapshotFor(id);
  return db.transaction(async (trx) => {
    const targetSnapshot = await trx('time_slots').where({ id: input.new_time_slot_id }).first();
    if (!targetSnapshot) throw new AppError(404, 'SLOT_NOT_FOUND', 'Không tìm thấy khung giờ mới.');
    const courts = await lockVenueCourts(trx, [snapshot.court_id, targetSnapshot.court_id]);
    const oldCourt = courts.find((court) => court.id === snapshot.court_id);
    const targetCourt = courts.find((court) => court.id === targetSnapshot.court_id);
    const slots = await lockSlots(trx, [snapshot.time_slot_id, targetSnapshot.id]);
    const oldSlot = slots.find((slot) => slot.id === snapshot.time_slot_id);
    const targetSlot = slots.find((slot) => slot.id === targetSnapshot.id);
    const booking = await trx('bookings').where({ id }).forUpdate().first();
    if (!booking || booking.time_slot_id !== snapshot.time_slot_id) {
      throw new AppError(409, 'BOOKING_CHANGED', 'Đơn vừa thay đổi. Vui lòng tải lại và thử lại.');
    }
    authorize(user, booking, oldCourt);
    confirmed(booking);
    if (await activeRefund(trx, id)) {
      throw new AppError(
        409,
        'REFUND_ALREADY_REQUESTED',
        'Đơn đã yêu cầu hoàn tiền, không thể đồng thời dời sân.',
      );
    }
    const issueReported = Boolean(booking.issue_reported_at);
    if (user.role === 'CUSTOMER' && input.is_venue_issue && !issueReported) {
      throw new AppError(
        403,
        'VENUE_ISSUE_NOT_REPORTED',
        'Quản lý phải báo sự cố sân trước khi khách chọn xử lý sự cố.',
      );
    }
    const venueIssue = issueReported || Boolean(input.is_venue_issue);
    assertOperational(targetCourt);
    if (
      targetCourt.venue_id !== oldCourt.venue_id ||
      targetCourt.sport_type !== oldCourt.sport_type
    ) {
      throw new AppError(
        400,
        'INCOMPATIBLE_SLOT',
        'Base chỉ hỗ trợ dời cùng cơ sở và cùng môn thể thao.',
      );
    }
    if (Number(targetSlot.price) !== Number(booking.total_amount)) {
      throw new AppError(
        400,
        'PRICE_MISMATCH',
        'Khung giờ mới phải có cùng giá với đơn đã thanh toán.',
      );
    }
    const {
      rows: [clock],
    } = await trx.raw('SELECT clock_timestamp() AS now');
    const now = new Date(clock.now);
    if (new Date(targetSlot.start_at) <= now) {
      throw new AppError(409, 'SLOT_ALREADY_STARTED', 'Khung giờ mới phải chưa bắt đầu.');
    }
    if (!venueIssue && new Date(oldSlot.start_at) <= now) {
      throw new AppError(
        409,
        'BOOKING_ALREADY_STARTED',
        'Khách chỉ được chủ động dời sân trước giờ bắt đầu.',
      );
    }
    if (oldSlot.id === targetSlot.id || targetSlot.status !== 'AVAILABLE') {
      throw new AppError(409, 'SLOT_UNAVAILABLE', 'Khung giờ mới không còn trống.');
    }
    if (!['BOOKED', 'UNAVAILABLE'].includes(oldSlot.status)) {
      throw new AppError(
        409,
        'INVALID_SLOT_STATE',
        'Trạng thái khung giờ hiện tại không phù hợp để dời sân.',
      );
    }
    const changed = await trx('time_slots')
      .where({ id: targetSlot.id, status: 'AVAILABLE' })
      .update({
        status: 'BOOKED',
        held_until: null,
        version: trx.raw('version + 1'),
        updated_at: trx.fn.now(),
      });
    if (changed !== 1) throw new AppError(409, 'SLOT_UNAVAILABLE', 'Khung giờ mới vừa được đặt.');
    await bumpSlot(trx, oldSlot.id, {
      status: venueIssue ? 'UNAVAILABLE' : 'AVAILABLE',
      held_until: null,
    });
    await trx('bookings').where({ id }).update({
      time_slot_id: targetSlot.id,
      issue_reported_at: null,
      issue_reason: null,
      updated_at: trx.fn.now(),
    });
    await trx('booking_reschedules').insert({
      booking_id: id,
      old_time_slot_id: oldSlot.id,
      new_time_slot_id: targetSlot.id,
      reason: input.reason,
      is_venue_issue: venueIssue,
      requested_by: user.id,
      processed_by: user.role === 'CUSTOMER' ? null : user.id,
    });
    const result = await bookingDetail(trx, id);
    await writeAudit(trx, {
      actorId: user.id,
      action: 'BOOKING_RESCHEDULED',
      entityType: 'bookings',
      entityId: id,
      before: { time_slot_id: oldSlot.id, issue_reported_at: booking.issue_reported_at },
      after: {
        time_slot_id: targetSlot.id,
        old_slot_status: venueIssue ? 'UNAVAILABLE' : 'AVAILABLE',
        new_slot_status: 'BOOKED',
      },
      reason: input.reason,
    });
    return result;
  });
}

async function reportUnderLock(trx, user, context, reason) {
  const { booking, slot } = context;
  if (booking.issue_reported_at) return booking;
  if (slot.status !== 'BOOKED') {
    throw new AppError(409, 'INVALID_SLOT_STATE', 'Chỉ có thể báo sự cố cho khung giờ đã đặt.');
  }
  const [updated] = await trx('bookings')
    .where({ id: booking.id })
    .update({
      issue_reported_at: trx.fn.now(),
      issue_reason: reason,
      updated_at: trx.fn.now(),
    })
    .returning('*');
  await bumpSlot(trx, slot.id, { status: 'UNAVAILABLE', held_until: null });
  await writeAudit(trx, {
    actorId: user.id,
    action: 'VENUE_ISSUE_REPORTED',
    entityType: 'bookings',
    entityId: booking.id,
    before: { issue_reported_at: null, slot_status: slot.status },
    after: { issue_reported_at: updated.issue_reported_at, slot_status: 'UNAVAILABLE' },
    reason,
  });
  return updated;
}

async function createRefundUnderLock(trx, user, booking) {
  const existing = await activeRefund(trx, booking.id);
  if (existing) return existing;
  const paid = await trx('payments')
    .where({ booking_id: booking.id, status: 'PAID' })
    .forUpdate()
    .first();
  if (!paid)
    throw new AppError(
      409,
      'PAID_PAYMENT_REQUIRED',
      'Không có thanh toán thành công để hoàn tiền.',
    );
  const [refund] = await trx('refunds')
    .insert({
      booking_id: booking.id,
      amount: booking.total_amount,
      status: 'REQUESTED',
      reason: booking.issue_reason,
      requested_by: user.id,
    })
    .returning('*');
  await writeAudit(trx, {
    actorId: user.id,
    action: 'REFUND_REQUESTED',
    entityType: 'refunds',
    entityId: refund.id,
    before: null,
    after: { booking_id: booking.id, amount: refund.amount, status: refund.status },
    reason: booking.issue_reason,
  });
  return refund;
}

export async function reportVenueIssue(user, id, input) {
  const snapshot = await snapshotFor(id);
  return db.transaction(async (trx) => {
    const context = await lockBooking(trx, snapshot);
    managerOnly(user, context.court);
    confirmed(context.booking);
    const reported = await reportUnderLock(trx, user, context, input.reason);
    if (input.action === 'REFUND') return createRefundUnderLock(trx, user, reported);
    return bookingDetail(trx, id);
  });
}

export async function requestRefund(user, id) {
  const snapshot = await snapshotFor(id);
  return db.transaction(async (trx) => {
    const { booking } = await lockBooking(trx, snapshot);
    if (user.role !== 'CUSTOMER' || booking.customer_id !== user.id) {
      throw new AppError(403, 'FORBIDDEN', 'Chỉ chủ đơn được gửi yêu cầu hoàn tiền này.');
    }
    confirmed(booking);
    if (!booking.issue_reported_at) {
      throw new AppError(
        409,
        'VENUE_ISSUE_REQUIRED',
        'Khách chỉ được yêu cầu hoàn tiền sau khi cơ sở báo sự cố sân.',
      );
    }
    return createRefundUnderLock(trx, user, booking);
  });
}

export async function changeRefundStatus(user, id, requestedStatus) {
  const refundSnapshot = await db('refunds').where({ id }).first();
  if (!refundSnapshot)
    throw new AppError(404, 'REFUND_NOT_FOUND', 'Không tìm thấy yêu cầu hoàn tiền.');
  const snapshot = await snapshotFor(refundSnapshot.booking_id);
  return db.transaction(async (trx) => {
    const { booking, slot, court } = await lockBooking(trx, snapshot);
    managerOnly(user, court);
    const refund = await trx('refunds').where({ id }).forUpdate().first();
    // Repeated terminal confirmations are safe; other jumps or regressions are errors.
    if (requestedStatus === 'COMPLETED' && refund.status === 'COMPLETED') return refund;
    if (!booking.issue_reported_at) {
      throw new AppError(409, 'VENUE_ISSUE_REQUIRED', 'Đơn không có sự cố sân để hoàn tiền.');
    }
    confirmed(booking);
    if (requestedStatus === 'APPROVED') {
      if (refund.status !== 'REQUESTED') {
        throw new AppError(
          409,
          'INVALID_REFUND_TRANSITION',
          'Chỉ được duyệt yêu cầu đang Chờ duyệt.',
        );
      }
      const [approved] = await trx('refunds')
        .where({ id })
        .update({
          status: 'APPROVED',
          processed_by: user.id,
          updated_at: trx.fn.now(),
        })
        .returning('*');
      await writeAudit(trx, {
        actorId: user.id,
        action: 'REFUND_APPROVED',
        entityType: 'refunds',
        entityId: id,
        before: { status: 'REQUESTED' },
        after: { status: 'APPROVED' },
        reason: refund.reason,
      });
      const [processing] = await trx('refunds')
        .where({ id })
        .update({ status: 'PROCESSING', updated_at: trx.fn.now() })
        .returning('*');
      await writeAudit(trx, {
        actorId: null,
        action: 'REFUND_PROCESSING',
        entityType: 'refunds',
        entityId: id,
        before: { status: approved.status },
        after: { status: processing.status },
        reason: refund.reason,
      });
      return processing;
    }
    if (requestedStatus !== 'COMPLETED' || refund.status !== 'PROCESSING') {
      throw new AppError(
        409,
        'INVALID_REFUND_TRANSITION',
        'Phải duyệt trước khi xác nhận đã hoàn tiền.',
      );
    }
    const payments = await trx('payments')
      .where({ booking_id: booking.id, status: 'PAID' })
      .forUpdate();
    if (payments.length !== 1)
      throw new AppError(
        409,
        'PAID_PAYMENT_REQUIRED',
        'Không có đúng một thanh toán thành công để hoàn tiền.',
      );
    if (Number(payments[0].amount) !== Number(refund.amount)) {
      throw new AppError(409, 'REFUND_AMOUNT_MISMATCH', 'Số tiền hoàn không khớp với giao dịch.');
    }
    await trx('payments')
      .where({ id: payments[0].id })
      .update({ status: 'REFUNDED', updated_at: trx.fn.now() });
    await trx('bookings')
      .where({ id: booking.id })
      .update({ status: 'CANCELLED_BY_VENUE', updated_at: trx.fn.now() });
    await bumpSlot(trx, slot.id, { status: 'UNAVAILABLE', held_until: null });
    const [completed] = await trx('refunds')
      .where({ id })
      .update({
        status: 'COMPLETED',
        processed_by: user.id,
        updated_at: trx.fn.now(),
      })
      .returning('*');
    await writeAudit(trx, {
      actorId: user.id,
      action: 'REFUND_COMPLETED',
      entityType: 'refunds',
      entityId: id,
      before: { status: 'PROCESSING', booking_status: booking.status, slot_status: slot.status },
      after: {
        status: 'COMPLETED',
        booking_status: 'CANCELLED_BY_VENUE',
        slot_status: 'UNAVAILABLE',
        payment_status: 'REFUNDED',
      },
      reason: refund.reason,
    });
    return completed;
  });
}
