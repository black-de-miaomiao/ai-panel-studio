import type { LLMProvider, LLMRequest, LLMUsage } from './types';

interface WireUsage {
  prompt_tokens?: unknown;
  completion_tokens?: unknown;
}

interface ParsedSseLine {
  done: boolean;
  content?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readUsage(value: unknown): LLMUsage | undefined {
  if (!isRecord(value) || !isRecord(value.usage)) {
    return undefined;
  }
  const usage = value.usage as WireUsage;
  if (
    typeof usage.prompt_tokens !== 'number' ||
    !Number.isFinite(usage.prompt_tokens) ||
    typeof usage.completion_tokens !== 'number' ||
    !Number.isFinite(usage.completion_tokens)
  ) {
    return undefined;
  }
  return {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens
  };
}

function notifyUsage(request: LLMRequest, usage: LLMUsage | undefined): void {
  if (usage) {
    try {
      request.onUsage?.(usage);
    } catch {
      // Observability callbacks must not affect model output.
    }
  }
}

function makeRequestBody(
  request: LLMRequest & { model: string },
  stream: boolean
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: request.model,
    messages: [
      { role: 'system', content: request.system },
      { role: 'user', content: request.user }
    ]
  };

  if (request.maxTokens !== undefined) {
    body.max_tokens = request.maxTokens;
  }
  if (request.json) {
    body.response_format = { type: 'json_object' };
  }
  if (request.thinking === 'disabled') {
    body.thinking = { type: 'disabled' };
    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }
  } else if (request.thinking === 'low' || request.thinking === 'high') {
    body.thinking = { type: 'enabled' };
    body.reasoning_effort = request.thinking;
  } else if (request.temperature !== undefined) {
    body.temperature = request.temperature;
  }
  if (stream) {
    body.stream = true;
    body.stream_options = { include_usage: true };
  }
  return body;
}

function parseSseLine(line: string, request: LLMRequest): ParsedSseLine {
  const trimmed = line.replace(/\r$/u, '').trim();
  if (!trimmed || trimmed.startsWith(':') || !trimmed.startsWith('data:')) {
    return { done: false };
  }

  const data = trimmed.slice('data:'.length).trim();
  if (!data) {
    return { done: false };
  }
  if (data === '[DONE]') {
    return { done: true };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(data) as unknown;
  } catch {
    return { done: false };
  }
  notifyUsage(request, readUsage(payload));
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    return { done: false };
  }
  const choice = payload.choices[0];
  if (!isRecord(choice) || !isRecord(choice.delta)) {
    return { done: false };
  }
  const content = choice.delta.content;
  return typeof content === 'string'
    ? { done: false, content }
    : { done: false };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createOpenAICompatibleProvider(opts: {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutsMs?: { quality: number; fast: number };
  retryDelayMs?: number;
}): LLMProvider {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const endpoint = `${opts.baseUrl.replace(/\/+$/u, '')}/chat/completions`;
  const timeouts = {
    quality: opts.timeoutsMs?.quality ?? 90_000,
    fast: opts.timeoutsMs?.fast ?? 30_000
  };
  const retryDelayMs = Math.max(0, opts.retryDelayMs ?? 800);

  const fetchResponse = async (
    request: LLMRequest & { model: string },
    stream: boolean
  ): Promise<{ response: Response; cleanup: () => void; didTimeout: () => boolean }> => {
    const body = JSON.stringify(makeRequestBody(request, stream));
    const timeoutMs =
      request.task === 'lineup' || request.task === 'summary'
        ? timeouts.quality
        : timeouts.fast;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (request.signal?.aborted) {
        throw new Error('大模型请求已取消');
      }
      const controller = new AbortController();
      let timedOut = false;
      const abortFromCaller = () => controller.abort();
      request.signal?.addEventListener('abort', abortFromCaller, {
        once: true
      });
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timeout);
        request.signal?.removeEventListener('abort', abortFromCaller);
      };

      let response: Response;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${opts.apiKey}`
          },
          body,
          signal: controller.signal
        });
      } catch {
        cleanup();
        if (request.signal?.aborted) {
          throw new Error('大模型请求已取消');
        }
        if (timedOut) {
          throw new Error('大模型请求超时');
        }
        if (attempt === 0) {
          await delay(retryDelayMs);
          continue;
        }
        throw new Error('大模型网络请求失败');
      }

      if (response.status === 429 || response.status >= 500) {
        cleanup();
        try {
          await response.body?.cancel();
        } catch {
          // The response body is intentionally not included in errors or logs.
        }
        if (attempt === 0) {
          await delay(retryDelayMs);
          continue;
        }
        throw new Error(`大模型服务暂不可用（HTTP ${response.status}）`);
      }
      if (!response.ok) {
        cleanup();
        throw new Error(`大模型服务请求失败（HTTP ${response.status}）`);
      }
      return { response, cleanup, didTimeout: () => timedOut };
    }
    throw new Error('大模型网络请求失败');
  };

  return {
    name: 'deepseek',
    async complete(request) {
      const { response, cleanup, didTimeout } = await fetchResponse(
        request,
        false
      );
      try {
        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          if (didTimeout()) {
            throw new Error('大模型请求超时');
          }
          throw new Error('大模型响应格式无效');
        }

        const usage = readUsage(payload);
        notifyUsage(request, usage);
        if (!isRecord(payload) || !Array.isArray(payload.choices)) {
          throw new Error('大模型响应格式无效');
        }
        const choice = payload.choices[0];
        if (!isRecord(choice) || !isRecord(choice.message)) {
          throw new Error('大模型响应格式无效');
        }
        const content = choice.message.content;
        const result = { text: typeof content === 'string' ? content : '' };
        return usage ? { ...result, usage } : result;
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('大模型')) {
          throw error;
        }
        throw new Error(didTimeout() ? '大模型请求超时' : '大模型响应解析失败');
      } finally {
        cleanup();
      }
    },
    async *stream(request) {
      const { response, cleanup, didTimeout } = await fetchResponse(
        request,
        true
      );
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      let reachedEnd = false;
      try {
        if (!response.body) {
          return;
        }
        reader = response.body.getReader();
        const decoder = new TextDecoder();
        let lineBuffer = '';
        let finished = false;

        const processLine = (line: string): ParsedSseLine =>
          parseSseLine(line, request);

        while (!finished) {
          const next = await reader.read();
          if (next.done) {
            reachedEnd = true;
            lineBuffer += decoder.decode();
            break;
          }
          lineBuffer += decoder.decode(next.value, { stream: true });
          let newlineIndex = lineBuffer.indexOf('\n');
          while (newlineIndex >= 0) {
            const line = lineBuffer.slice(0, newlineIndex);
            lineBuffer = lineBuffer.slice(newlineIndex + 1);
            const parsed = processLine(line);
            if (parsed.content) {
              yield parsed.content;
            }
            if (parsed.done) {
              finished = true;
              break;
            }
            newlineIndex = lineBuffer.indexOf('\n');
          }
        }

        if (!finished && lineBuffer) {
          const parsed = processLine(lineBuffer);
          if (parsed.content) {
            yield parsed.content;
          }
        }
      } catch {
        if (request.signal?.aborted) {
          throw new Error('大模型请求已取消');
        }
        if (didTimeout()) {
          throw new Error('大模型请求超时');
        }
        throw new Error('大模型流式请求失败');
      } finally {
        if (reader) {
          if (!reachedEnd) {
            try {
              await reader.cancel();
            } catch {
              // Best-effort cancellation does not expose upstream details.
            }
          }
          reader.releaseLock();
        }
        cleanup();
      }
    }
  };
}
