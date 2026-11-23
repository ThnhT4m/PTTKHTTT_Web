import { z } from 'zod';

export const email = z.string().trim().email().max(254)
  .transform((value) => value.toLowerCase());

// bcrypt only uses the first 72 UTF-8 bytes. Reject longer values instead of
// accepting passwords that differ only in a suffix bcrypt silently ignores.
export const password = z.string().min(8).max(72).refine(
  (value) => Buffer.byteLength(value, 'utf8') <= 72,
  'Mật khẩu tối đa 72 byte UTF-8; ký tự tiếng Việt có thể chiếm nhiều byte.',
);

export const registerBody = z.object({
  full_name: z.string().trim().min(2).max(120),
  email,
  phone: z.string().trim().max(20).optional(),
  password,
}).strict();

export const loginBody = z.object({ email, password }).strict();
