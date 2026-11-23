import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
export const ok = (res, data, status = 200) =>
  res.status(status).json({ success: true, data, server_time: new Date().toISOString() });

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  let status = err.status || 500;
  let code = err.code || 'INTERNAL_ERROR';
  let message = err.message;
  let details = err.details;
  if (err.type === 'entity.parse.failed') {
    status = 400;
    code = 'INVALID_JSON';
    message = 'JSON không hợp lệ.';
    details = undefined;
  } else if (err.type === 'entity.too.large') {
    status = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Nội dung yêu cầu vượt quá giới hạn cho phép.';
    details = undefined;
  } else if (err instanceof ZodError) {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = 'Dữ liệu không hợp lệ.';
    details = err.flatten();
  } else if (err.code === '22P02' || err.code === '22007' || err.code === '22008') {
    status = 400;
    code = 'INVALID_VALUE';
    message = 'ID hoặc ngày giờ không hợp lệ.';
  } else if (err.code === '23505' || err.code === '23P01') {
    status = 409;
    code = 'DATA_CONFLICT';
    message = 'Dữ liệu bị trùng hoặc khung giờ đã được sử dụng.';
  } else if (err.code === '23514') {
    status = 400;
    code = 'CONSTRAINT_VIOLATION';
    message = 'Dữ liệu vi phạm ràng buộc hệ thống.';
  } else if (err.code === '23503') {
    status = 400;
    code = 'REFERENCE_NOT_FOUND';
    message = 'Đối tượng liên quan không tồn tại.';
  } else if (err.code === '40P01' || err.code === '40001') {
    status = 409;
    code = 'CONCURRENT_CHANGE';
    message = 'Dữ liệu vừa thay đổi. Vui lòng tải lại và thử lại.';
  }
  if (status >= 500) {
    console.error(err);
    message = 'Có lỗi phía máy chủ.';
    details = undefined;
  }
  res
    .status(status)
    .json({
      success: false,
      error: { code, message, ...(details === undefined ? {} : { details }) },
      server_time: new Date().toISOString(),
    });
}
