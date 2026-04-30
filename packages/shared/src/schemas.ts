import { z } from "zod";

// ───── auth ─────
export const RegisterRequest = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/, "字母/数字/下划线/中划线"),
  email: z.string().email(),
  password: z.string().min(8).max(72),
  full_name: z.string().max(50).optional(),
});
export type RegisterRequest = z.infer<typeof RegisterRequest>;

export const LoginRequest = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

// ───── notes ─────
export const NoteCreateRequest = z.object({
  ts_code: z.string().min(1),
  content: z.string().min(1).max(10000),
  analysis_type: z.enum(["DCF", "CAPM", "Technical", "Fundamental", "Other"]).optional(),
  rating: z.number().int().min(1).max(5).optional(),
  tags: z.array(z.string()).max(10).optional(),
});
export type NoteCreateRequest = z.infer<typeof NoteCreateRequest>;

export const NoteUpdateRequest = NoteCreateRequest.partial().omit({ ts_code: true });
export type NoteUpdateRequest = z.infer<typeof NoteUpdateRequest>;

// ───── favorites ─────
export const FavoriteAddRequest = z.object({
  ts_code: z.string().min(1),
});
export type FavoriteAddRequest = z.infer<typeof FavoriteAddRequest>;

export const FavoriteReorderRequest = z.object({
  order: z.array(z.string()).min(1), // ts_code 顺序
});
export type FavoriteReorderRequest = z.infer<typeof FavoriteReorderRequest>;

// ───── valuation ─────
export const DCFInputs = z.object({
  freeCashFlow: z.number().positive(), // 万元
  growthRate: z.number().min(0).max(100), // %
  discountRate: z.number().min(0.1).max(50),
  terminalGrowth: z.number().min(0).max(10),
});
export type DCFInputs = z.infer<typeof DCFInputs>;

export const CAPMInputs = z.object({
  riskFreeRate: z.number().min(0).max(20),
  marketReturn: z.number().min(0).max(50),
  beta: z.number().min(0).max(5),
});
export type CAPMInputs = z.infer<typeof CAPMInputs>;

// ───── pagination ─────
export const PaginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof PaginationQuery>;
