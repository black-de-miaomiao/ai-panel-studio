import { DatabaseSync } from 'node:sqlite';
import type { Insight, InsightStance } from '@aps/shared';
import { withTransaction } from '../connection';
import { mapInsightRow, type InsightRow } from '../mappers';

interface InsightStanceRow {
  insight_id: string;
  participant_id: string;
  position: string;
}

export function listByDiscussion(
  database: DatabaseSync,
  discussionId: string
): Insight[] {
  const insightRows = database
    .prepare(
      `SELECT *
         FROM insights
        WHERE discussion_id = ?
        ORDER BY created_at ASC, id ASC`
    )
    .all(discussionId) as unknown as InsightRow[];

  if (insightRows.length === 0) {
    return [];
  }

  const stanceRows = database
    .prepare(
      `SELECT s.insight_id, s.participant_id, s.position
         FROM insight_stances AS s
         JOIN insights AS i ON i.id = s.insight_id
        WHERE i.discussion_id = ?
        ORDER BY s.participant_id ASC`
    )
    .all(discussionId) as unknown as InsightStanceRow[];
  const stancesByInsight = new Map<string, InsightStance[]>();

  for (const row of stanceRows) {
    const stances = stancesByInsight.get(row.insight_id) ?? [];
    stances.push({
      participantId: row.participant_id,
      position: row.position
    });
    stancesByInsight.set(row.insight_id, stances);
  }

  return insightRows.map((row) =>
    mapInsightRow(row, stancesByInsight.get(row.id) ?? [])
  );
}

export function replaceAll(
  database: DatabaseSync,
  discussionId: string,
  insights: readonly Insight[]
): Insight[] {
  withTransaction(database, () =>
    replaceAllInTransaction(database, discussionId, insights)
  );

  return listByDiscussion(database, discussionId);
}

export function replaceAllInTransaction(
  database: DatabaseSync,
  discussionId: string,
  insights: readonly Insight[]
): void {
  for (const insight of insights) {
    if (insight.discussionId !== discussionId) {
      throw new Error('Insight discussionId does not match replacement scope');
    }
  }

  database
    .prepare('DELETE FROM insights WHERE discussion_id = ?')
    .run(discussionId);

  const insertInsight = database.prepare(
    `INSERT INTO insights (
      id, discussion_id, kind, content, status, evidence_seqs,
      updated_at_seq, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertStance = database.prepare(
    `INSERT INTO insight_stances (insight_id, participant_id, position)
     SELECT ?, participant.id, ?
       FROM participants AS participant
      WHERE participant.discussion_id = ? AND participant.id = ?`
  );

  for (const insight of insights) {
    insertInsight.run(
      insight.id,
      discussionId,
      insight.kind,
      insight.content,
      insight.status,
      JSON.stringify(insight.evidenceSeqs),
      insight.updatedAtSeq,
      insight.createdAt,
      insight.updatedAt
    );

    for (const stance of insight.stances) {
      const result = insertStance.run(
        insight.id,
        stance.position,
        discussionId,
        stance.participantId
      );
      if (Number(result.changes) === 0) {
        throw new Error('Insight stance participant is outside the discussion');
      }
    }
  }
}
