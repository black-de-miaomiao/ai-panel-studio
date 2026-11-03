import {
  ApiErrorBodySchema,
  DiscussionResponseSchema,
  HealthResponseSchema,
  ListDiscussionsResponseSchema,
  SnapshotResponseSchema,
  type ApiErrorCode,
  type CreateDiscussionRequest,
  type Discussion,
  type DiscussionListItem,
  type DiscussionSnapshot,
  type DiscussionStatus,
  type HealthResponse
} from '@aps/shared';
import type { DiscussionApi } from './types';

const NETWORK_MESSAGE = '无法连接服务器，请确认后端已启动';
const INVALID_RESPONSE_MESSAGE = '服务返回了无法识别的数据';

export type FrontendApiErrorCode = ApiErrorCode | 'NETWORK';

export class ApiError extends Error {
  constructor(
    public readonly code: FrontendApiErrorCode,
    message: string,
    public readonly details: unknown[] = []
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface SafeParseSchema<T> {
  safeParse(value: unknown):
    | { success: true; data: T }
    | { success: false };
}

async function readApiError(response: Response): Promise<ApiError> {
  const invalidErrorResponse = () =>
    response.status >= 500 && response.status < 600
      ? new ApiError('NETWORK', NETWORK_MESSAGE)
      : new ApiError('INTERNAL', INVALID_RESPONSE_MESSAGE);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return invalidErrorResponse();
  }

  const parsed = ApiErrorBodySchema.safeParse(body);
  if (!parsed.success) {
    return invalidErrorResponse();
  }

  const { code, message, details } = parsed.data.error;
  return new ApiError(code, message, details);
}

export function createHttpApi(fetchImpl?: typeof fetch): DiscussionApi {
  const request = async (path: string, init?: RequestInit): Promise<Response> => {
    try {
      const fetcher = fetchImpl ?? globalThis.fetch;
      return await fetcher(path, init);
    } catch {
      throw new ApiError('NETWORK', NETWORK_MESSAGE);
    }
  };

  const requestJson = async <T>(
    path: string,
    schema: SafeParseSchema<T>,
    init?: RequestInit,
    expectedStatus = 200
  ): Promise<T> => {
    const response = await request(path, init);
    if (!response.ok) throw await readApiError(response);
    if (response.status !== expectedStatus) {
      throw new ApiError('INTERNAL', INVALID_RESPONSE_MESSAGE);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ApiError('INTERNAL', INVALID_RESPONSE_MESSAGE);
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError('INTERNAL', INVALID_RESPONSE_MESSAGE);
    }
    return parsed.data;
  };

  const post = (body?: unknown): RequestInit => ({
    method: 'POST',
    ...(body === undefined
      ? {}
      : {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
  });

  const discussionPath = (id: string) =>
    `/api/discussions/${encodeURIComponent(id)}`;

  return {
    async getHealth(): Promise<HealthResponse> {
      return requestJson('/api/health', HealthResponseSchema);
    },

    async listDiscussions(
      statuses?: readonly DiscussionStatus[]
    ): Promise<DiscussionListItem[]> {
      const query =
        statuses && statuses.length > 0
          ? `?${new URLSearchParams({ status: statuses.join(',') }).toString()}`
          : '';
      const response = await requestJson(
        `/api/discussions${query}`,
        ListDiscussionsResponseSchema
      );
      return response.items;
    },

    async createDiscussion(
      createRequest: CreateDiscussionRequest
    ): Promise<DiscussionSnapshot> {
      const response = await requestJson(
        '/api/discussions',
        SnapshotResponseSchema,
        post(createRequest),
        201
      );
      return response.snapshot;
    },

    async getDiscussion(id: string): Promise<DiscussionSnapshot> {
      const response = await requestJson(
        discussionPath(id),
        SnapshotResponseSchema
      );
      return response.snapshot;
    },

    async regenerateLineup(id: string): Promise<DiscussionSnapshot> {
      const response = await requestJson(
        `${discussionPath(id)}/lineup/regenerate`,
        SnapshotResponseSchema,
        post()
      );
      return response.snapshot;
    },

    async start(id: string): Promise<Discussion> {
      const response = await requestJson(
        `${discussionPath(id)}/start`,
        DiscussionResponseSchema,
        post()
      );
      return response.discussion;
    },

    async pause(id: string): Promise<Discussion> {
      const response = await requestJson(
        `${discussionPath(id)}/pause`,
        DiscussionResponseSchema,
        post()
      );
      return response.discussion;
    },

    async resume(id: string): Promise<Discussion> {
      const response = await requestJson(
        `${discussionPath(id)}/resume`,
        DiscussionResponseSchema,
        post()
      );
      return response.discussion;
    },

    async end(id: string): Promise<Discussion> {
      const response = await requestJson(
        `${discussionPath(id)}/end`,
        DiscussionResponseSchema,
        post(),
        202
      );
      return response.discussion;
    },

    async deleteDiscussion(id: string): Promise<void> {
      const response = await request(discussionPath(id), { method: 'DELETE' });
      if (!response.ok) throw await readApiError(response);
      if (response.status !== 204) {
        throw new ApiError('INTERNAL', INVALID_RESPONSE_MESSAGE);
      }
    }
  };
}

export const httpApi = createHttpApi();
