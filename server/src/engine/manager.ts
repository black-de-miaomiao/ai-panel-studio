import type {
  Discussion,
  DiscussionStatus,
  LiveUtterance,
  StreamEvent
} from '@aps/shared';
import type { DatabaseSync } from 'node:sqlite';
import {
  getById,
  markInterruptedAsPausedInTransaction,
  updateStatus
} from '../db/repositories/discussions';
import { appendInTransaction } from '../db/repositories/events';
import { withTransaction } from '../db/connection';
import type { LLMGateway } from '../llm/gateway';
import {
  DiscussionRunner,
  type DiscussionRunnerConfig
} from './runner';
import type { DiscussionEventBus, EventEnvelope } from './eventBus';

export interface DiscussionManagerConfig {
  maxTurns: number;
  pacingMs: number;
}

export interface DiscussionManager {
  start(discussionId: string): Discussion | null;
  pause(discussionId: string): Discussion | null;
  resume(discussionId: string): Discussion | null;
  end(discussionId: string): Discussion | null;
  remove(discussionId: string): boolean;
  recoverOnBoot(): void;
  getLiveUtterance(discussionId: string): LiveUtterance | null;
  stopAll(): void;
}

function nowIso(): string {
  return new Date().toISOString();
}

function broadcastPersisted(
  bus: DiscussionEventBus,
  envelope: EventEnvelope
): void {
  if (bus.broadcastPersisted) {
    bus.broadcastPersisted(envelope);
  } else {
    bus.publish(envelope.event);
  }
}

class DiscussionManagerRuntime implements DiscussionManager {
  private readonly database: DatabaseSync;
  private readonly bus: DiscussionEventBus;
  private readonly llm: LLMGateway;
  private readonly config: DiscussionRunnerConfig;
  private readonly runners = new Map<string, DiscussionRunner>();

  constructor(
    database: DatabaseSync,
    bus: DiscussionEventBus,
    llm: LLMGateway,
    config: DiscussionManagerConfig
  ) {
    this.database = database;
    this.bus = bus;
    this.llm = llm;
    this.config = config;
  }

  start(discussionId: string): Discussion | null {
    const discussion = getById(this.database, discussionId);
    if (!discussion || discussion.status !== 'lineup_ready') {
      return null;
    }
    const at = nowIso();
    const updated = this.changeStatus(
      discussionId,
      'live',
      { startedAt: at, errorMessage: null },
      at
    );
    if (!updated) {
      return null;
    }
    const runner = this.createRunner(discussionId);
    this.runners.set(discussionId, runner);
    runner.start();
    return getById(this.database, discussionId);
  }

  pause(discussionId: string): Discussion | null {
    const discussion = getById(this.database, discussionId);
    if (!discussion || discussion.status !== 'live') {
      return null;
    }
    let runner = this.runners.get(discussionId);
    if (!runner) {
      runner = this.createRunner(discussionId);
      this.runners.set(discussionId, runner);
    }
    runner.pause();
    runner.start();
    return getById(this.database, discussionId);
  }

  resume(discussionId: string): Discussion | null {
    const discussion = getById(this.database, discussionId);
    if (!discussion || discussion.status !== 'paused') {
      return null;
    }
    let runner = this.runners.get(discussionId);
    if (!runner) {
      runner = this.createRunner(discussionId);
      this.runners.set(discussionId, runner);
    }
    runner.resume();
    return getById(this.database, discussionId);
  }

  end(discussionId: string): Discussion | null {
    const discussion = getById(this.database, discussionId);
    if (
      !discussion ||
      (discussion.status !== 'live' && discussion.status !== 'paused')
    ) {
      return null;
    }
    let runner = this.runners.get(discussionId);
    if (!runner) {
      runner = this.createRunner(discussionId);
      this.runners.set(discussionId, runner);
    }
    runner.requestEnd();
    return getById(this.database, discussionId);
  }

  remove(discussionId: string): boolean {
    if (!getById(this.database, discussionId)) {
      return false;
    }
    this.runners.get(discussionId)?.stop();
    this.runners.delete(discussionId);
    this.bus.closeDiscussion(discussionId);
    return this.deleteDiscussion(discussionId);
  }

  recoverOnBoot(): void {
    const at = nowIso();
    const envelopes: EventEnvelope[] = [];
    withTransaction(this.database, () => {
      const discussionIds = markInterruptedAsPausedInTransaction(
        this.database,
        at
      );
      for (const discussionId of discussionIds) {
        const discussion = getById(this.database, discussionId);
        if (!discussion) {
          continue;
        }
        const event: StreamEvent = {
          type: 'discussion.status',
          discussionId,
          at,
          status: 'paused',
          turnCount: discussion.turnCount,
          maxTurns: discussion.maxTurns
        };
        const seq = appendInTransaction(this.database, discussionId, event);
        envelopes.push({ event, seq });
      }
    });
    for (const envelope of envelopes) {
      broadcastPersisted(this.bus, envelope);
    }
  }

  getLiveUtterance(discussionId: string): LiveUtterance | null {
    return this.runners.get(discussionId)?.getLiveUtterance() ?? null;
  }

  stopAll(): void {
    for (const runner of this.runners.values()) {
      runner.stop();
    }
    this.runners.clear();
    this.bus.closeAll();
  }

  private createRunner(discussionId: string): DiscussionRunner {
    return new DiscussionRunner(
      this.database,
      this.bus,
      this.llm,
      this.config,
      discussionId
    );
  }

  private changeStatus(
    discussionId: string,
    status: DiscussionStatus,
    patch: Partial<
      Pick<Discussion, 'startedAt' | 'endedAt' | 'errorMessage'>
    >,
    at: string
  ): Discussion | null {
    let updated: Discussion | null = null;
    let envelope: EventEnvelope | null = null;
    withTransaction(this.database, () => {
      updated = updateStatus(
        this.database,
        discussionId,
        status,
        patch,
        at
      );
      if (!updated) {
        return;
      }
      const event: StreamEvent = {
        type: 'discussion.status',
        discussionId,
        at,
        status: updated.status,
        turnCount: updated.turnCount,
        maxTurns: updated.maxTurns
      };
      const seq = appendInTransaction(this.database, discussionId, event);
      envelope = { event, seq };
    });
    if (envelope) {
      broadcastPersisted(this.bus, envelope);
    }
    return updated;
  }

  private deleteDiscussion(discussionId: string): boolean {
    const result = this.database
      .prepare('DELETE FROM discussions WHERE id = ?')
      .run(discussionId);
    return Number(result.changes) > 0;
  }
}

export const DiscussionManager = DiscussionManagerRuntime;
