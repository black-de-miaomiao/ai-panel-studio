import { describe, expect, it } from 'vitest';
import {
  ApiErrorBodySchema,
  CreateDiscussionRequestSchema,
  HealthResponseSchema,
  isApiErrorBody
} from './api';

describe('API schemas', () => {
  it('trims the topic and defaults expertCount to four', () => {
    expect(
      CreateDiscussionRequestSchema.parse({ topic: '  AI 与教育  ' })
    ).toEqual({ topic: 'AI 与教育', expertCount: 4 });
  });

  it('returns Chinese validation messages for out-of-range values', () => {
    const shortTopic = CreateDiscussionRequestSchema.safeParse({
      topic: ' a '
    });
    const tooManyExperts = CreateDiscussionRequestSchema.safeParse({
      topic: '有效话题',
      expertCount: 7
    });

    expect(shortTopic.success).toBe(false);
    if (!shortTopic.success) {
      expect(shortTopic.error.issues[0]?.message).toContain('话题长度');
    }
    expect(tooManyExperts.success).toBe(false);
    if (!tooManyExperts.success) {
      expect(tooManyExperts.error.issues[0]?.message).toContain('专家人数');
    }
  });

  it('validates response and error envelopes', () => {
    expect(
      HealthResponseSchema.parse({
        ok: true,
        llm: {
          provider: 'mock',
          qualityModel: 'deepseek-v4-pro',
          fastModel: 'deepseek-flash'
        }
      }).ok
    ).toBe(true);

    const body = {
      error: {
        code: 'NOT_FOUND',
        message: '未找到讨论',
        details: []
      }
    };
    expect(ApiErrorBodySchema.parse(body).error.code).toBe('NOT_FOUND');
    expect(isApiErrorBody(body)).toBe(true);
    expect(isApiErrorBody({ error: { code: 'UNKNOWN', message: 'bad' } })).toBe(
      false
    );
  });
});
