import { z } from 'zod';
import { ok } from '../../lib/http.js';
import * as service from './payments.service.js';

const createSchema = z
  .object({
    booking_id: z.string().uuid(),
    method: z.enum(['BANK_TRANSFER', 'CREDIT_CARD', 'E_WALLET']),
  })
  .strict();
const confirmSchema = z.object({ transaction_code: z.string().trim().min(1).max(120) }).strict();
export const create = async (req, res) =>
  ok(res, await service.createPayment(req.user, createSchema.parse(req.body)), 201);
export const confirm = async (req, res) =>
  ok(res, await service.confirmPayment(req.user, confirmSchema.parse(req.body)));
