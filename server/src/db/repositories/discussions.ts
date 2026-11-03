import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type {
  Discussion,
  DiscussionListItem,
  DiscussionStatus,
  DiscussionSource
} from '@aps/shared';
import { STATUS_PRIORITY } from '@aps/shared';
import { withTransaction } from '../connection';
import {
  mapDiscussionRow,
  mapParticipantBriefRow,
  type DiscussionRow,
  type ParticipantRow
} from '../mappers';
import { listByDiscussion as listParticipantsByDiscussion } from './participants';

export interface CreateDiscussionInput {
  topic: string;
  expertCount: number;
  maxTurns: number;
  source?: DiscussionSource;
}

export interface DiscussionListOptions {
  statuses?: readonly DiscussionStatus[];
  viewerCountOf?: (discussionId: string) => number;
}

export type DiscussionStatusPatch = Partial<
  Pick<Discussion, 'startedAt' | 'endedAt' | 'errorMessage'>
>;

interface DiscussionListRow extends DiscussionRow {
  utterance_count: number;
  latest_speaker_name: string | null;
  latest_utterance_content: string | null;
}

const statusOrderSql = `CASE d.status
  ${Object.entries(STATUS_PRIORITY)
    .map(([status, priority]) => `WHEN '${status}' THEN ${priority}`)
    .join('\n  ')}
END`;

function nowIso(): string {
  return new Date().toISOString();
}

export function create(
  database: DatabaseSync,
  input: CreateDiscussionInput
): Discussion {
  const now = nowIso();
  const id = randomUUID();

  database
    .prepare(
      `INSERT INTO discussions (
        id, topic, expert_count, status, max_turns, turn_count, summary,
        error_message, source, created_at, updated_at, started_at, ended_at
      ) VALUES (?, ?, ?, 'draft', ?, 0, NULL, NULL, ?, ?, ?, NULL, NULL)`
    )
    .run(id, input.topic, input.expertCount, input.maxTurns, input.source ?? 'user', now, now);

  return getById(database, id) as Discussion;
}

export function getById(
  database: DatabaseSync,
  id: string
): Discussion | null {
  const row = database
    .prepare('SELECT * FROM discussions WHERE id = ?')
    .get(id) as DiscussionRow | undefined;

  return row ? mapDiscussionRow(row) : null;
}

export function list(
  database: DatabaseSync,
  options: DiscussionListOptions = {}
): DiscussionListItem[] {
  const statuses = options.statuses;
  if (statuses && statuses.length === 0) {
    return [];
  }

  const whereClause = statuses
    ? `WHERE d.status IN (${statuses.map(() => '?').join(', ')})`
    : '';
  const rows = database
    .prepare(
      `SELECT
        d.*,
        (SELECT COUNT(*)
           FROM utterances u
          WHERE u.discussion_id = d.id) AS utterance_count,
        (SELECT p.name
           FROM utterances u
           JOIN participants p ON p.id = u.participant_id
          WHERE u.discussion_id = d.id
          ORDER BY u.seq DESC
          LIMIT 1) AS latest_speaker_name,
        (SELECT u.content
           FROM utterances u
          WHERE u.discussion_id = d.id
          ORDER BY u.seq DESC
          LIMIT 1) AS latest_utterance_content
       FROM discussions d
       ${whereClause}
       ORDER BY ${statusOrderSql} DESC, d.updated_at DESC`
    )
    .all(...(statuses ?? [])) as unknown as DiscussionListRow[];

  const viewerCountOf = options.viewerCountOf ?? (() => 0);

  return rows.map((row) => ({
    id: row.id,
    topic: row.topic,
    status: row.status,
    expertCount: row.expert_count,
    maxTurns: row.max_turns,
    turnCount: row.turn_count,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    participants: listParticipantsByDiscussion(database, row.id).map(
      mapParticipantBriefRow
    ),
    utteranceCount: row.utterance_count,
    viewerCount: viewerCountOf(row.id),
    latestUtterance:
      row.latest_speaker_name === null ||
      row.latest_utterance_content === null
        ? null
        : {
            speakerName: row.latest_speaker_name,
            content: row.latest_utterance_content
          }
  }));
}

export function updateStatus(
  database: DatabaseSync,
  id: string,
  status: DiscussionStatus,
  patch: DiscussionStatusPatch = {}
): Discussion | null {
  const assignments = ['status = ?', 'updated_at = ?'];
  const parameters: Array<string | null> = [status, nowIso()];

  if (Object.hasOwn(patch, 'startedAt')) {
    assignments.push('started_at = ?');
    parameters.push(patch.startedAt ?? null);
  }
  if (Object.hasOwn(patch, 'endedAt')) {
    assignments.push('ended_at = ?');
    parameters.push(patch.endedAt ?? null);
  }
  if (Object.hasOwn(patch, 'errorMessage')) {
    assignments.push('error_message = ?');
    parameters.push(patch.errorMessage ?? null);
  }

  database
    .prepare(
      `UPDATE discussions
          SET ${assignments.join(', ')}
        WHERE id = ?`
    )
    .run(...parameters, id);

  return getById(database, id);
}

export function incrementTurnCount(
  database: DatabaseSync,
  id: string
): number | null {
  database
    .prepare(
      `UPDATE discussions
          SET turn_count = turn_count + 1, updated_at = ?
        WHERE id = ?`
    )
    .run(nowIso(), id);

  const row = database
    .prepare('SELECT turn_count AS turnCount FROM discussions WHERE id = ?')
    .get(id) as { turnCount: number } | undefined;
  return row?.turnCount ?? null;
}

export function setSummary(
  database: DatabaseSync,
  id: string,
  summary: string
): Discussion | null {
  database
    .prepare(
      `UPDATE discussions
          SET summary = ?, updated_at = ?
        WHERE id = ?`
    )
    .run(summary, nowIso(), id);

  return getById(database, id);
}

export function remove(database: DatabaseSync, id: string): boolean {
  const result = database
    .prepare('DELETE FROM discussions WHERE id = ?')
    .run(id);
  return Number(result.changes) > 0;
}

export function markInterruptedAsPaused(database: DatabaseSync): string[] {
  return withTransaction(database, () => {
    const ids = database
      .prepare(
        `SELECT id
           FROM discussions
          WHERE status IN ('live', 'summarizing')
          ORDER BY id`
      )
      .all() as unknown as Array<{ id: string }>;

    if (ids.length === 0) {
      return [];
    }

    database
      .prepare(
        `UPDATE discussions
            SET status = 'paused', updated_at = ?
          WHERE status IN ('live', 'summarizing')`
      )
      .run(nowIso());

    return ids.map(({ id }) => id);
  });
}
