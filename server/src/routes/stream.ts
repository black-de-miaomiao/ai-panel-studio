import { Router, type Request, type Response } from 'express';
import type { StreamEvent } from '@aps/shared';
import type { DatabaseSync } from 'node:sqlite';
import { getById } from '../db/repositories/discussions';
import { listSince } from '../db/repositories/events';
import type { DiscussionEventBus, EventEnvelope } from '../engine/eventBus';

export interface StreamRouteDeps {
  db: DatabaseSync;
  bus: DiscussionEventBus;
}

function sendError(
  response: Response,
  status: number,
  code: string,
  message: string
): void {
  response.status(status).json({
    error: { code, message }
  });
}

function parseCursor(value: string | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  if (!/^\d+$/u.test(value)) {
    return Number.NaN;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : Number.NaN;
}

function writeEnvelope(
  response: Response,
  envelope: EventEnvelope
): void {
  if (response.writableEnded || response.destroyed) {
    return;
  }
  if (envelope.seq !== null) {
    response.write(`id: ${envelope.seq}\n`);
  }
  response.write(`data: ${JSON.stringify(envelope.event)}\n\n`);
}

function streamError(
  request: Request,
  response: Response,
  deps: StreamRouteDeps
): void {
  const rawId = request.params.id;
  const discussionId = Array.isArray(rawId) ? rawId[0] ?? '' : rawId;
  if (!getById(deps.db, discussionId)) {
    sendError(response, 404, 'NOT_FOUND', '讨论不存在');
    return;
  }

  const lastEventIdHeader = request.get('Last-Event-ID');
  const headerCursor = parseCursor(lastEventIdHeader);
  let cursor: number;
  if (lastEventIdHeader !== undefined) {
    if (headerCursor === null || Number.isNaN(headerCursor)) {
      sendError(response, 400, 'VALIDATION_ERROR', '事件游标无效');
      return;
    }
    cursor = headerCursor;
  } else {
    const sinceParameter = request.query.since;
    if (sinceParameter !== undefined && typeof sinceParameter !== 'string') {
      sendError(response, 400, 'VALIDATION_ERROR', '事件游标无效');
      return;
    }
    const queryCursor = parseCursor(
      typeof sinceParameter === 'string' ? sinceParameter : undefined
    );
    if (queryCursor !== null && Number.isNaN(queryCursor)) {
      sendError(response, 400, 'VALIDATION_ERROR', '事件游标无效');
      return;
    }
    cursor = queryCursor ?? 0;
  }

  let direct = false;
  let closedByDiscussion = false;
  let cleaned = false;
  let maxSentSeq = cursor;
  const buffered: EventEnvelope[] = [];
  let pingTimer: NodeJS.Timeout | undefined;
  const unsubscribe = deps.bus.subscribe(
    discussionId,
    (envelope) => {
      if (direct) {
        if (
          envelope.seq === null ||
          envelope.seq > maxSentSeq
        ) {
          writeEnvelope(response, envelope);
          if (envelope.seq !== null) {
            maxSentSeq = Math.max(maxSentSeq, envelope.seq);
          }
        }
      } else {
        buffered.push(envelope);
      }
    },
    () => {
      closedByDiscussion = true;
      if (!response.writableEnded) {
        response.end();
      }
    }
  );

  const cleanup = (): void => {
    if (cleaned) {
      return;
    }
    cleaned = true;
    if (pingTimer) {
      clearInterval(pingTimer);
    }
    unsubscribe();
    if (!closedByDiscussion) {
      const event: StreamEvent = {
        type: 'viewers.updated',
        discussionId,
        at: new Date().toISOString(),
        viewerCount: deps.bus.viewerCount(discussionId)
      };
      deps.bus.publish(event);
    }
  };
  response.on('close', cleanup);
  response.on('finish', cleanup);

  deps.bus.publish({
    type: 'viewers.updated',
    discussionId,
    at: new Date().toISOString(),
    viewerCount: deps.bus.viewerCount(discussionId)
  });

  response.status(200);
  response.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  response.flushHeaders();
  response.write('retry: 3000\n\n');

  pingTimer = setInterval(() => {
    if (!response.writableEnded && !response.destroyed) {
      response.write(': ping\n\n');
    }
  }, 15_000);
  pingTimer.unref();

  const persistedEvents = listSince(deps.db, discussionId, cursor);
  for (const persisted of persistedEvents) {
    writeEnvelope(response, {
      event: persisted.payload,
      seq: persisted.seq
    });
    maxSentSeq = Math.max(maxSentSeq, persisted.seq);
  }

  while (buffered.length > 0 && !response.writableEnded) {
    const pending = buffered.splice(0);
    for (const envelope of pending) {
      if (envelope.seq !== null) {
        if (envelope.seq <= maxSentSeq) {
          continue;
        }
        writeEnvelope(response, envelope);
        maxSentSeq = Math.max(maxSentSeq, envelope.seq);
      } else {
        writeEnvelope(response, envelope);
      }
    }
  }
  direct = true;
}

export function createStreamRouter(deps: StreamRouteDeps) {
  const router = Router();
  router.get('/:id/stream', (request, response, next) => {
    try {
      streamError(request, response, deps);
    } catch (error) {
      if (response.headersSent) {
        response.end();
      } else {
        next(error);
      }
    }
  });
  return router;
}
