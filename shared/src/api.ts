import { z } from 'zod';
import { EXPERT_COUNT } from './constants';
import {
  DiscussionListItemSchema,
  DiscussionSchema,
  DiscussionSnapshotSchema
} from './domain';

const topicLengthMessage = '话题长度需在 2–200 字之间';
const expertCountMessage = '专家人数需为 2–6 人之间的整数';

export const CreateDiscussionRequestSchema = z
  .object({
    topic: z
      .string({ error: '话题必填' })
      .trim()
      .min(2, { error: topicLengthMessage })
      .max(200, { error: topicLengthMessage }),
    expertCount: z
      .number({ error: expertCountMessage })
      .int({ error: expertCountMessage })
      .min(EXPERT_COUNT.min, { error: expertCountMessage })
      .max(EXPERT_COUNT.max, { error: expertCountMessage })
      .default(EXPERT_COUNT.default)
  })
  .strict();

export const ListDiscussionsResponseSchema = z
  .object({
    items: z.array(DiscussionListItemSchema)
  })
  .strict();

export const SnapshotResponseSchema = z
  .object({
    snapshot: DiscussionSnapshotSchema
  })
  .strict();

export const DiscussionResponseSchema = z
  .object({
    discussion: DiscussionSchema
  })
  .strict();

export const HealthResponseSchema = z
  .object({
    ok: z.boolean(),
    llm: z
      .object({
        provider: z.enum(['deepseek', 'mock']),
        qualityModel: z.string().min(1),
        fastModel: z.string().min(1)
      })
      .strict()
  })
  .strict();

export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'INVALID_STATE',
  'LLM_ERROR',
  'INTERNAL'
] as const;

export const ApiErrorBodySchema = z
  .object({
    error: z
      .object({
        code: z.enum(ERROR_CODES),
        message: z.string().min(1),
        details: z.array(z.unknown())
      })
      .strict()
  })
  .strict();

export type CreateDiscussionRequest = z.infer<
  typeof CreateDiscussionRequestSchema
>;
export type ListDiscussionsResponse = z.infer<
  typeof ListDiscussionsResponseSchema
>;
export type SnapshotResponse = z.infer<typeof SnapshotResponseSchema>;
export type DiscussionResponse = z.infer<typeof DiscussionResponseSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type ApiErrorCode = (typeof ERROR_CODES)[number];
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return ApiErrorBodySchema.safeParse(value).success;
}
