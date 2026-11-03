import { DatabaseSync } from 'node:sqlite';
import {
  DiscussionSnapshotSchema,
  type DiscussionSnapshot,
  type LiveUtterance
} from '@aps/shared';
import { getById } from './discussions';
import { lastSeq } from './events';
import { listByDiscussion as listInsightsByDiscussion } from './insights';
import { listByDiscussion as listParticipantsByDiscussion } from './participants';
import { listByDiscussion as listUtterancesByDiscussion } from './utterances';

export interface SnapshotOptions {
  viewerCount: number;
  liveUtterance: LiveUtterance | null;
}

export function buildSnapshot(
  database: DatabaseSync,
  discussionId: string,
  options: SnapshotOptions
): DiscussionSnapshot | null {
  const discussion = getById(database, discussionId);
  if (!discussion) {
    return null;
  }

  return DiscussionSnapshotSchema.parse({
    discussion,
    participants: listParticipantsByDiscussion(database, discussionId),
    utterances: listUtterancesByDiscussion(database, discussionId),
    insights: listInsightsByDiscussion(database, discussionId),
    liveUtterance: options.liveUtterance,
    lastEventSeq: lastSeq(database, discussionId),
    viewerCount: options.viewerCount
  });
}
