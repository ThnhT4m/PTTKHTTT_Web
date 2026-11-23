import { z } from 'zod';

export const uuid = z.string().uuid();
export const sport = z.enum(['FOOTBALL', 'BADMINTON', 'TENNIS', 'PICKLEBALL', 'BASKETBALL']);
export const operationalStatuses = ['ACTIVE', 'INACTIVE', 'MAINTENANCE'];
export const reason = z.string().trim().min(5).max(1000);
export const pagination = {
  limit: z.coerce.number().int().min(1).max(300).default(100),
  offset: z.coerce.number().int().min(0).max(1000000).default(0),
};
export const statusBody = (statuses) => z.object({
  status: z.enum(statuses),
  expected_version: z.number().int().positive(),
  reason,
}).strict();

export const priceFilters = {
  min_price: z.coerce.number().int().min(0).max(100000000).optional(),
  max_price: z.coerce.number().int().min(0).max(100000000).optional(),
};
export const validPriceRange = (value) =>
  value.min_price === undefined || value.max_price === undefined || value.min_price <= value.max_price;
