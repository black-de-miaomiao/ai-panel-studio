import { DatabaseSync } from 'node:sqlite';
import { isDurableEvent, StreamEventSchema } from '@aps/shared';
import type { StreamEvent } from '@aps/shared';
import { withTransaction } from '../connection';

export interface PersistedEvent {
  discussionId: string;
  seq: number;
  type: StreamEvent['type'];
  payload: StreamEvent;
  createdAt: string;
}

interface EventRow {
  discussion_id: string;
  seq: number;
  type: string;
  payload: string;
  created_at: string;
}

export function append(
  database: DatabaseSync,
  discussionId: string,
  event: StreamEvent
): number {
  const validatedEvent = StreamEventSchema.parse(event);
  if (validatedEvent.discussionId !== discussionId) {
    throw new Error('Event discussionId does not match append scope');
  }
  if (!isDurableEvent(validatedEvent)) {
    throw new Error('Only durable events can be appended');
  }

  return withTransaction(database, () => {
    const row = database
      .prepare(
        `SELECT COALESCE(MAX(seq), 0) AS maxSeq
           FROM events
          WHERE discussion_id = ?`
      )
      .get(discussionId) as { maxSeq: number } | undefined;
    const seq = (row?.maxSeq ?? 0) + 1;

    database
      .prepare(
        `INSERT INTO events (
          discussion_id, seq, type, payload, created_at
        ) VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        discussionId,
        seq,
        validatedEvent.type,
        JSON.stringify(validatedEvent),
        validatedEvent.at
      );

    return seq;
  });
}

export function listSince(
  database: DatabaseSync,
  discussionId: string,
  seq: number
): PersistedEvent[] {
  const rows = database
    .prepare(
      `SELECT discussion_id, seq, type, payload, created_at
         FROM events
        WHERE discussion_id = ? AND seq > ?
        ORDER BY seq ASC`
    )
    .all(discussionId, seq) as unknown as EventRow[];

  return rows.map((row) => {
    const payload = StreamEventSchema.parse(JSON.parse(row.payload) as unknown);
    if (payload.discussionId !== discussionId || payload.type !== row.type) {
      throw new TypeError(`Event payload does not match stored event ${row.seq}`);
    }

    return {
      discussionId: row.discussion_id,
      seq: row.seq,
      type: payload.type,
      payload,
      createdAt: row.created_at
    };
  });
}

export function lastSeq(
  database: DatabaseSync,
  discussionId: string
): number {
  const row = database
    .prepare(
      `SELECT COALESCE(MAX(seq), 0) AS maxSeq
         FROM events
        WHERE discussion_id = ?`
    )
    .get(discussionId) as { maxSeq: number } | undefined;
  return row?.maxSeq ?? 0;
}
