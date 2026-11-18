import { db } from '../../db/knex.js';
import { AppError } from '../../lib/http.js';
import { writeAudit } from '../../lib/audit.js';

export async function createReview(bookingId, input, user) {
  return db.transaction(async (trx) => {
    const booking = await trx('bookings').where({ id: bookingId }).forUpdate().first();
    if (!booking) throw new AppError(404, 'BOOKING_NOT_FOUND', 'Không tìm thấy đơn đặt sân.');
    if (booking.customer_id !== user.id)
      throw new AppError(403, 'BOOKING_FORBIDDEN', 'Bạn không phải chủ đơn này.');
    if (booking.status !== 'COMPLETED')
      throw new AppError(
        409,
        'BOOKING_NOT_COMPLETED',
        'Chỉ được đánh giá sau khi quản lý xác nhận hoàn thành.',
      );
    if (await trx('reviews').where({ booking_id: bookingId }).first())
      throw new AppError(409, 'ALREADY_REVIEWED', 'Mỗi đơn chỉ được đánh giá một lần.');
    const [review] = await trx('reviews')
      .insert({ booking_id: bookingId, ...input })
      .returning('*');
    await writeAudit(trx, {
      actorId: user.id,
      action: 'REVIEW_CREATED',
      entityType: 'reviews',
      entityId: review.id,
      after: review,
    });
    return review;
  });
}
