import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { SpeechAct, Utterance } from '@aps/shared';
import { mapUtteranceRow, type UtteranceRow } from '../mappers';

export interface InsertUtteranceInput {
  id?: string;
  participantId: string;
  seq: number;
  act: SpeechAct;
  replyToParticipantId: string | null;
  content: string;
  createdAt?: string;
}

export function insert(
  database: DatabaseSync,
  discussionId: string,
  input: InsertUtteranceInput
): Utterance {
  const id = input.id ?? randomUUID();
  const createdAt = input.createdAt ?? new Date().toISOString();
  const result = database
    .prepare(
      `INSERT INTO utterances (
        id, discussion_id, participant_id, seq, act, reply_to_participant_id,
        content, created_at
      )
      SELECT ?, ?, speaker.id, ?, ?, ?, ?, ?
        FROM participants AS speaker
       WHERE speaker.discussion_id = ?
         AND speaker.id = ?
         AND (
           ? IS NULL OR EXISTS (
             SELECT 1
               FROM participants AS target
              WHERE target.discussion_id = ?
                AND target.id = ?
           )
         )`
    )
    .run(
      id,
      discussionId,
      input.seq,
      input.act,
      input.replyToParticipantId,
      input.content,
      createdAt,
      discussionId,
      input.participantId,
      input.replyToParticipantId,
      discussionId,
      input.replyToParticipantId
    );

  if (Number(result.changes) === 0) {
    throw new Error('Utterance participants must belong to the discussion');
  }

  const row = database
    .prepare('SELECT * FROM utterances WHERE discussion_id = ? AND id = ?')
    .get(discussionId, id) as UtteranceRow | undefined;

  if (!row) {
    throw new Error('Inserted utterance could not be read back');
  }
  return mapUtteranceRow(row);
}

export function listByDiscussion(
  database: DatabaseSync,
  discussionId: string
): Utterance[] {
  const rows = database
    .prepare(
      `SELECT *
         FROM utterances
        WHERE discussion_id = ?
        ORDER BY seq ASC`
    )
    .all(discussionId) as unknown as UtteranceRow[];
  return rows.map(mapUtteranceRow);
}

export function count(
  database: DatabaseSync,
  discussionId: string
): number {
  const row = database
    .prepare(
      `SELECT COUNT(*) AS count
         FROM utterances
        WHERE discussion_id = ?`
    )
    .get(discussionId) as { count: number } | undefined;
  return row?.count ?? 0;
}

export function nextSeq(
  database: DatabaseSync,
  discussionId: string
): number {
  const row = database
    .prepare(
      `SELECT COALESCE(MAX(seq), 0) + 1 AS nextSeq
         FROM utterances
        WHERE discussion_id = ?`
    )
    .get(discussionId) as { nextSeq: number } | undefined;
  return row?.nextSeq ?? 1;
}

export function latest(
  database: DatabaseSync,
  discussionId: string
): Utterance | null {
  const row = database
    .prepare(
      `SELECT *
         FROM utterances
        WHERE discussion_id = ?
        ORDER BY seq DESC
        LIMIT 1`
    )
    .get(discussionId) as UtteranceRow | undefined;
  return row ? mapUtteranceRow(row) : null;
}
