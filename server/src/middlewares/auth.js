import jwt from 'jsonwebtoken';
import { db } from '../db/knex.js';
import { env } from '../config/env.js';
import { AppError, asyncHandler } from '../lib/http.js';

export const requireAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer '))
    throw new AppError(401, 'UNAUTHENTICATED', 'Vui lòng đăng nhập.');
  let payload;
  try {
    payload = jwt.verify(header.slice(7), env.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    throw new AppError(401, 'INVALID_TOKEN', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
  }
  const user = await db('users')
    .where({ id: payload.sub })
    .first('id', 'full_name', 'email', 'phone', 'role', 'is_active', 'token_version');
  if (!user || !user.is_active || user.token_version !== payload.ver) {
    throw new AppError(
      401,
      'SESSION_REVOKED',
      'Phiên đăng nhập đã bị thu hồi hoặc tài khoản bị khóa.',
    );
  }
  req.user = user;
  next();
});

export const requireRole = (roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role))
    return next(new AppError(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.'));
  next();
};
