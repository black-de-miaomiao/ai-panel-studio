import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type {
  AgentState,
  BidIntent,
  Participant
} from '@aps/shared';
import { withTransaction } from '../connection';
import {
  mapParticipantRow,
  type ParticipantRow
} from '../mappers';

export type ParticipantDraft = Pick<
  Participant,
  | 'role'
  | 'seat'
  | 'name'
  | 'profession'
  | 'title'
  | 'stance'
  | 'stanceTag'
  | 'persona'
  | 'color'
  | 'avatar'
> & { id?: string };

export interface AgentStateUpdate {
  agentState: AgentState;
  agentIntent: BidIntent | null;
  focus: string | null;
}

function participantById(
  database: DatabaseSync,
  discussionId: string,
  participantId: string
): Participant | null {
  const row = database
    .prepare(
      `SELECT *
         FROM participants
        WHERE discussion_id = ? AND id = ?`
    )
    .get(discussionId, participantId) as ParticipantRow | undefined;
  return row ? mapParticipantRow(row) : null;
}

export function listByDiscussion(
  database: DatabaseSync,
  discussionId: string
): Participant[] {
  const rows = database
    .prepare(
      `SELECT *
         FROM participants
        WHERE discussion_id = ?
        ORDER BY seat ASC`
    )
    .all(discussionId) as unknown as ParticipantRow[];
  return rows.map(mapParticipantRow);
}

export function replaceLineup(
  database: DatabaseSync,
  discussionId: string,
  drafts: readonly ParticipantDraft[]
): Participant[] {
  withTransaction(database, () => {
    database
      .prepare('DELETE FROM participants WHERE discussion_id = ?')
      .run(discussionId);

    const insert = database.prepare(
      `INSERT INTO participants (
        id, discussion_id, role, seat, name, profession, title, stance,
        stance_tag, persona, color, avatar, agent_state, agent_intent, focus,
        speak_count, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'idle', NULL, NULL, 0, ?)`
    );
    const createdAt = new Date().toISOString();

    for (const draft of drafts) {
      insert.run(
        draft.id ?? randomUUID(),
        discussionId,
        draft.role,
        draft.seat,
        draft.name,
        draft.profession,
        draft.title,
        draft.stance,
        draft.stanceTag,
        draft.persona,
        draft.color,
        draft.avatar,
        createdAt
      );
    }
  });

  return listByDiscussion(database, discussionId);
}

export function updateAgentState(
  database: DatabaseSync,
  discussionId: string,
  participantId: string,
  update: AgentStateUpdate
): Participant | null {
  database
    .prepare(
      `UPDATE participants
          SET agent_state = ?, agent_intent = ?, focus = ?
        WHERE discussion_id = ? AND id = ?`
    )
    .run(
      update.agentState,
      update.agentIntent,
      update.focus,
      discussionId,
      participantId
    );

  return participantById(database, discussionId, participantId);
}

export function incrementSpeakCount(
  database: DatabaseSync,
  discussionId: string,
  participantId: string
): number | null {
  database
    .prepare(
      `UPDATE participants
          SET speak_count = speak_count + 1
        WHERE discussion_id = ? AND id = ?`
    )
    .run(discussionId, participantId);

  const row = database
    .prepare(
      `SELECT speak_count AS speakCount
         FROM participants
        WHERE discussion_id = ? AND id = ?`
    )
    .get(discussionId, participantId) as { speakCount: number } | undefined;
  return row?.speakCount ?? null;
}

export function resetAgentStates(
  database: DatabaseSync,
  discussionId: string
): number {
  const result = database
    .prepare(
      `UPDATE participants
          SET agent_state = 'idle', agent_intent = NULL, focus = NULL
        WHERE discussion_id = ?`
    )
    .run(discussionId);
  return Number(result.changes);
}
