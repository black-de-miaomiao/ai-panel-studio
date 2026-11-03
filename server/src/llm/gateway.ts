import {
  TASK_ROUTING,
  type LLMProvider,
  type LLMRequest,
  type LLMTask,
  type LLMUsage
} from './types';

export interface LLMGateway {
  providerName: LLMProvider['name'];
  models: { quality: string; fast: string };
  complete(
    request: LLMRequest
  ): Promise<{ text: string; usage?: LLMUsage }>;
  stream(request: LLMRequest): AsyncIterable<string>;
}

interface SemaphoreWaiter {
  resolve: () => void;
  reject: (error: Error) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
}

function createSemaphore(maxConcurrency: number) {
  const limit = Math.max(1, Math.floor(maxConcurrency));
  let active = 0;
  const queue: SemaphoreWaiter[] = [];

  const makeRelease = (): (() => void) => {
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;

      let next = queue.shift();
      while (next?.signal?.aborted) {
        next.signal.removeEventListener('abort', next.onAbort as () => void);
        next.reject(new Error('大模型请求已取消'));
        next = queue.shift();
      }
      if (next) {
        if (next.onAbort) {
          next.signal?.removeEventListener('abort', next.onAbort);
        }
        next.resolve();
      } else {
        active -= 1;
      }
    };
  };

  const acquire = (signal?: AbortSignal): Promise<() => void> => {
    if (signal?.aborted) {
      return Promise.reject(new Error('大模型请求已取消'));
    }
    if (active < limit && queue.length === 0) {
      active += 1;
      return Promise.resolve(makeRelease());
    }

    return new Promise((resolve, reject) => {
      const waiter: SemaphoreWaiter = {
        resolve: () => resolve(makeRelease()),
        reject,
        signal
      };
      if (signal) {
        waiter.onAbort = () => {
          const index = queue.indexOf(waiter);
          if (index >= 0) {
            queue.splice(index, 1);
          }
          reject(new Error('大模型请求已取消'));
        };
        signal.addEventListener('abort', waiter.onAbort, { once: true });
      }
      queue.push(waiter);
    });
  };

  return { acquire };
}

function isJsonTask(task: LLMTask): boolean {
  return task === 'lineup' || task === 'bid' || task === 'insights';
}

export function createLLMGateway(opts: {
  provider: LLMProvider;
  models: { quality: string; fast: string };
  maxConcurrency: number;
  logger?: (line: string) => void;
}): LLMGateway {
  const semaphore = createSemaphore(opts.maxConcurrency);

  const routeRequest = (
    request: LLMRequest,
    observeUsage: (usage: LLMUsage) => void
  ): LLMRequest & { model: string } => {
    const routing = TASK_ROUTING[request.task];
    const model = opts.models[routing.tier];
    const callerUsage = request.onUsage;
    return {
      ...request,
      model,
      json: request.json ?? isJsonTask(request.task),
      thinking: request.thinking ?? routing.thinking,
      temperature: request.temperature ?? routing.temperature,
      maxTokens: request.maxTokens ?? routing.maxTokens,
      onUsage: (usage) => {
        observeUsage(usage);
        callerUsage?.(usage);
      }
    };
  };

  const logCall = (
    request: LLMRequest,
    model: string,
    startedAt: number,
    usage: LLMUsage | undefined
  ): void => {
    if (!opts.logger) {
      return;
    }
    const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
    const promptTokens = usage?.promptTokens ?? 'unknown';
    const completionTokens = usage?.completionTokens ?? 'unknown';
    try {
      opts.logger(
        `LLM task=${request.task} model=${model} durationMs=${durationMs} promptTokens=${promptTokens} completionTokens=${completionTokens}`
      );
    } catch {
      // Logging must not change the outcome of a model request.
    }
  };

  return {
    providerName: opts.provider.name,
    models: opts.models,
    async complete(request) {
      const release = await semaphore.acquire(request.signal);
      const startedAt = performance.now();
      let observedUsage: LLMUsage | undefined;
      const routed = routeRequest(request, (usage) => {
        observedUsage = usage;
      });
      try {
        const result = await opts.provider.complete(routed);
        const usage = result.usage ?? observedUsage;
        logCall(request, routed.model, startedAt, usage);
        return result;
      } catch (error) {
        logCall(request, routed.model, startedAt, observedUsage);
        throw error;
      } finally {
        release();
      }
    },
    async *stream(request) {
      const release = await semaphore.acquire(request.signal);
      const startedAt = performance.now();
      let observedUsage: LLMUsage | undefined;
      const routed = routeRequest(request, (usage) => {
        observedUsage = usage;
      });
      try {
        for await (const delta of opts.provider.stream(routed)) {
          yield delta;
        }
      } finally {
        logCall(request, routed.model, startedAt, observedUsage);
        release();
      }
    }
  };
}
