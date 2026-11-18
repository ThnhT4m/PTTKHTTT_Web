import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/http.js';
import * as repository from './auth.repository.js';

export const publicUser = ({ password_hash, token_version, ...user }) => user;
const session = (user) => ({
  user: publicUser(user),
  token: jwt.sign({ ver: user.token_version }, env.jwtSecret, {
    subject: user.id,
    algorithm: 'HS256',
    expiresIn: env.jwtExpiresIn,
  }),
});

export async function register(input) {
  if (await repository.findByEmail(input.email))
    throw new AppError(409, 'EMAIL_EXISTS', 'Email đã được đăng ký.');
  const user = await repository.createUser({
    full_name: input.full_name,
    email: input.email,
    phone: input.phone || null,
    password_hash: await bcrypt.hash(input.password, 12),
    role: 'CUSTOMER',
  });
  return session(user);
}

export async function login(input) {
  const user = await repository.findByEmail(input.email);
  if (!user || !(await bcrypt.compare(input.password, user.password_hash)))
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng.');
  if (!user.is_active) throw new AppError(403, 'ACCOUNT_DISABLED', 'Tài khoản đã bị khóa.');
  return session(user);
}

export async function logout(user) {
  await repository.revokeSessions(user.id);
  return { message: 'Đã đăng xuất và thu hồi các phiên hiện tại của tài khoản.' };
}
