import 'dotenv/config';

const nodeEnv = process.env.NODE_ENV || 'development';
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error(
    'JWT_SECRET phải có ít nhất 32 ký tự. Sao chép server/.env.example sang server/.env và cấu hình trước khi chạy.',
  );
}

export const env = {
  nodeEnv,
  port: Number(process.env.PORT || 4000),
  databaseUrl:
    process.env.DATABASE_URL ||
    'postgres://sportbooking:sportbooking_dev@localhost:5432/sportbooking',
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  paymentSandboxEnabled: process.env.PAYMENT_SANDBOX_ENABLED === 'true',
};
