import {
  CreateDiscussionRequestSchema,
  STATUS_PRIORITY,
  type ApiErrorCode,
  type CreateDiscussionRequest,
  type Discussion,
  type DiscussionListItem,
  type DiscussionSnapshot,
  type DiscussionStatus,
  type HealthResponse
} from '@aps/shared';
import type { DiscussionApi } from '../api/types';
import {
  createLineupSnapshot,
  createLobbySnapshots,
  createParticipants
} from './fixtures';

export class MockApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'MockApiError';
  }
}

function cloneSnapshot(snapshot: DiscussionSnapshot): DiscussionSnapshot {
  return {
    ...snapshot,
    discussion: { ...snapshot.discussion },
    participants: snapshot.participants.map((participant) => ({
      ...participant
    })),
    utterances: snapshot.utterances.map((utterance) => ({ ...utterance })),
    insights: snapshot.insights.map((insight) => ({
      ...insight,
      evidenceSeqs: [...insight.evidenceSeqs],
      stances: insight.stances.map((stance) => ({ ...stance }))
    })),
    liveUtterance: snapshot.liveUtterance
      ? { ...snapshot.liveUtterance }
      : null
  };
}

function toListItem(snapshot: DiscussionSnapshot): DiscussionListItem {
  const utterances = [...snapshot.utterances].sort(
    (left, right) => right.seq - left.seq
  );
  const latest = utterances[0];
  const latestSpeaker = latest
    ? snapshot.participants.find(
        (participant) => participant.id === latest.participantId
      )
    : undefined;
  return {
    id: snapshot.discussion.id,
    topic: snapshot.discussion.topic,
    status: snapshot.discussion.status,
    expertCount: snapshot.discussion.expertCount,
    maxTurns: snapshot.discussion.maxTurns,
    turnCount: snapshot.discussion.turnCount,
    source: snapshot.discussion.source,
    createdAt: snapshot.discussion.createdAt,
    updatedAt: snapshot.discussion.updatedAt,
    participants: [...snapshot.participants]
      .sort((left, right) => left.seat - right.seat)
      .map(({ id, role, name, title, color, avatar }) => ({
        id,
        role,
        name,
        title,
        color,
        avatar
      })),
    utteranceCount: snapshot.utterances.length,
    viewerCount: snapshot.viewerCount,
    latestUtterance:
      latest && latestSpeaker
        ? { speakerName: latestSpeaker.name, content: latest.content }
        : null
  };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

class MemoryDiscussionApi implements DiscussionApi {
  private snapshots = new Map<string, DiscussionSnapshot>();
  private fixtureNumbers = new Map<string, number>();
  private createCount = 0;
  private regenerateCount = new Map<string, number>();

  constructor() {
    this.reset();
  }

  reset(): void {
    this.snapshots.clear();
    this.fixtureNumbers.clear();
    this.regenerateCount.clear();
    this.createCount = 0;
    for (const snapshot of createLobbySnapshots()) {
      this.snapshots.set(snapshot.discussion.id, snapshot);
      const fixtureNo = Number(snapshot.discussion.id.slice(-12));
      this.fixtureNumbers.set(snapshot.discussion.id, fixtureNo);
    }
  }

  async getHealth(): Promise<HealthResponse> {
    return {
      ok: true,
      llm: {
        provider: 'mock',
        qualityModel: '演示质量档',
        fastModel: '演示速度档'
      }
    };
  }

  async listDiscussions(
    statuses?: readonly DiscussionStatus[]
  ): Promise<DiscussionListItem[]> {
    const allowed = statuses ? new Set(statuses) : null;
    return [...this.snapshots.values()]
      .filter(
        (snapshot) =>
          !allowed || allowed.has(snapshot.discussion.status)
      )
      .map(toListItem)
      .sort((left, right) => {
        const priority =
          STATUS_PRIORITY[right.status] - STATUS_PRIORITY[left.status];
        return priority || right.updatedAt.localeCompare(left.updatedAt);
      });
  }

  async createDiscussion(
    request: CreateDiscussionRequest
  ): Promise<DiscussionSnapshot> {
    const parsed = CreateDiscussionRequestSchema.safeParse(request);
    if (!parsed.success) {
      throw new MockApiError(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? '请检查话题和专家人数。'
      );
    }
    await delay(560);
    this.createCount += 1;
    const fixtureNo = 100 + this.createCount;
    const createdAt = new Date().toISOString();
    const snapshot = createLineupSnapshot({
      fixtureNo,
      topic: parsed.data.topic,
      expertCount: parsed.data.expertCount,
      status: 'lineup_ready',
      source: 'user',
      createdAt,
      updatedAt: createdAt
    });
    this.snapshots.set(snapshot.discussion.id, snapshot);
    this.fixtureNumbers.set(snapshot.discussion.id, fixtureNo);
    return cloneSnapshot(snapshot);
  }

  async getDiscussion(id: string): Promise<DiscussionSnapshot> {
    const snapshot = this.snapshots.get(id);
    if (!snapshot) throw new MockApiError('NOT_FOUND', '没有找到这场讨论。');
    return cloneSnapshot(snapshot);
  }

  async regenerateLineup(id: string): Promise<DiscussionSnapshot> {
    const snapshot = this.requireDiscussion(id);
    if (snapshot.discussion.status !== 'lineup_ready' && snapshot.discussion.status !== 'failed') {
      throw new MockApiError('INVALID_STATE', '当前状态不能更换阵容。');
    }
    await delay(430);
    const attempt = (this.regenerateCount.get(id) ?? 0) + 1;
    this.regenerateCount.set(id, attempt);
    const fixtureNo = (this.fixtureNumbers.get(id) ?? 1) + attempt;
    const participants = createParticipants(
      id,
      fixtureNo,
      snapshot.discussion.expertCount,
      attempt
    );
    const updated: DiscussionSnapshot = {
      ...snapshot,
      discussion: {
        ...snapshot.discussion,
        status: 'lineup_ready',
        errorMessage: null,
        updatedAt: new Date().toISOString()
      },
      participants,
      utterances: [],
      insights: [],
      liveUtterance: null,
      lastEventSeq: snapshot.lastEventSeq + 1
    };
    this.snapshots.set(id, updated);
    return cloneSnapshot(updated);
  }

  async start(id: string): Promise<Discussion> {
    const snapshot = this.requireDiscussion(id);
    if (snapshot.discussion.status !== 'lineup_ready') {
      throw new MockApiError('INVALID_STATE', '当前状态不能开始直播。');
    }
    return this.updateDiscussion(id, {
      status: 'live',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  async pause(id: string): Promise<Discussion> {
    const snapshot = this.requireDiscussion(id);
    if (snapshot.discussion.status !== 'live') {
      throw new MockApiError('INVALID_STATE', '当前状态不能暂停。');
    }
    return this.updateDiscussion(id, {
      status: 'paused',
      updatedAt: new Date().toISOString()
    });
  }

  async resume(id: string): Promise<Discussion> {
    const snapshot = this.requireDiscussion(id);
    if (snapshot.discussion.status !== 'paused') {
      throw new MockApiError('INVALID_STATE', '当前状态不能继续。');
    }
    return this.updateDiscussion(id, {
      status: 'live',
      updatedAt: new Date().toISOString()
    });
  }

  async end(id: string): Promise<Discussion> {
    const snapshot = this.requireDiscussion(id);
    if (snapshot.discussion.status !== 'live' && snapshot.discussion.status !== 'paused') {
      throw new MockApiError('INVALID_STATE', '当前状态不能结束讨论。');
    }
    return this.updateDiscussion(id, {
      status: 'summarizing',
      updatedAt: new Date().toISOString()
    });
  }

  completeSummary(id: string, summary: string): Discussion {
    const snapshot = this.requireDiscussion(id);
    if (snapshot.discussion.status !== 'summarizing') {
      throw new MockApiError('INVALID_STATE', '当前讨论尚未进入总结阶段。');
    }
    const endedAt = new Date().toISOString();
    return this.updateDiscussion(id, {
      status: 'ended',
      summary,
      endedAt,
      updatedAt: endedAt
    });
  }

  async deleteDiscussion(id: string): Promise<void> {
    if (!this.snapshots.delete(id)) {
      throw new MockApiError('NOT_FOUND', '没有找到这场讨论。');
    }
    this.fixtureNumbers.delete(id);
  }

  private requireDiscussion(id: string): DiscussionSnapshot {
    const snapshot = this.snapshots.get(id);
    if (!snapshot) throw new MockApiError('NOT_FOUND', '没有找到这场讨论。');
    return snapshot;
  }

  private updateDiscussion(
    id: string,
    update: Partial<Discussion>
  ): Discussion {
    const snapshot = this.requireDiscussion(id);
    const discussion = { ...snapshot.discussion, ...update };
    this.snapshots.set(id, { ...snapshot, discussion });
    return { ...discussion };
  }
}

export const mockApi = new MemoryDiscussionApi();
