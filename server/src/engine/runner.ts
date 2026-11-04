import { randomUUID } from 'node:crypto';
import type {
  BidIntent,
  Discussion,
  DiscussionStatus,
  ExpertAct,
  HostAct,
  Insight,
  LiveUtterance,
  Participant,
  SpeechAct,
  StreamEvent,
  Utterance
} from '@aps/shared';
import { MAX_SENTENCES } from '@aps/shared';
import type { DatabaseSync } from 'node:sqlite';
import { normalizeBid, type NormalizedBid } from '../core/bid';
import {
  buildAliasMap,
  buildTranscriptWindow,
  insightsInCreatedOrder,
  type AliasMap
} from '../core/context';
import { decideHostAction } from '../core/hostPolicy';
import {
  enforceInterruptAvailability,
  resolveInterruptAvailability
} from '../core/interruptPolicy';
import { mergeInsights } from '../core/insights';
import { LLMFormatError, parseJsonLoose } from '../core/json';
import { createRng } from '../core/rng';
import {
  getRecentExpertActs,
  selectNextSpeaker as importSelectNextSpeaker
} from '../core/scheduler';
import {
  clampSentences,
  createSentenceLimiter,
  sanitizeUtterance
} from '../core/sentences';
import {
  getById,
  incrementTurnCount,
  setSummary,
  updateStatus
} from '../db/repositories/discussions';
import { appendInTransaction } from '../db/repositories/events';
import {
  listByDiscussion as listInsights,
  replaceAllInTransaction
} from '../db/repositories/insights';
import {
  incrementSpeakCount,
  listByDiscussion as listParticipants,
  resetAgentStates,
  updateAgentState
} from '../db/repositories/participants';
import {
  insert as insertUtterance,
  listByDiscussion as listUtterances,
  nextSeq
} from '../db/repositories/utterances';
import { withTransaction } from '../db/connection';
import {
  buildBidPrompt,
  buildHostPrompt,
  buildInsightsPrompt,
  buildSummaryPrompt,
  buildUtterancePrompt,
  type DiscussionPromptInput,
  type HostPromptDivergence,
  type InsightPromptUtterance,
  type PromptRoleCard
} from '../prompts';
import type { DiscussionEventBus, EventEnvelope } from './eventBus';
import type { LLMGateway } from '../llm/gateway';
import type { LLMTask } from '../llm/types';

export interface DiscussionRunnerConfig {
  maxTurns: number;
  pacingMs: number;
}

interface RunnerContext {
  discussion: Discussion;
  participants: Participant[];
  utterances: Utterance[];
  insights: Insight[];
}

interface BidResult {
  participant: Participant;
  bid: NormalizedBid;
}

interface UtteranceWrite {
  utterance: Utterance;
  envelopes: EventEnvelope[];
  status: DiscussionStatus;
}

interface SummaryResult {
  text: string;
  utteranceId: string;
}

const MAX_INSIGHTS_PER_KIND = 6;
const INSIGHT_SIMILARITY_THRESHOLD = 0.6;
const PAUSE_ERROR_MESSAGE = '大模型服务暂时不可用，讨论已暂停，可稍后继续';
const DROPOUT_MESSAGE = '某嘉宾暂时掉线，讨论继续';

function isoNow(): string {
  return new Date().toISOString();
}

function roleCard(participant: Participant): PromptRoleCard {
  return {
    name: participant.name,
    profession: participant.profession,
    title: participant.title,
    stance: participant.stance,
    stanceTag: participant.stanceTag,
    persona: participant.persona
  };
}

function aliasForParticipant(
  aliasMap: AliasMap,
  participantId: string | null
): string | null {
  if (!participantId) {
    return null;
  }
  return (
    Object.entries(aliasMap).find(([, id]) => id === participantId)?.[0] ?? null
  );
}

function mapUtteranceToPrompt(
  utterance: Utterance,
  aliasMap: AliasMap
): InsightPromptUtterance {
  return {
    seq: utterance.seq,
    speakerAlias: aliasForParticipant(aliasMap, utterance.participantId) ?? 'H',
    act: utterance.act,
    replyToAlias:
      aliasForParticipant(aliasMap, utterance.replyToParticipantId) ?? null,
    content: utterance.content
  };
}

function isJsonText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return true;
  }
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return true;
  }
  try {
    JSON.parse(trimmed) as unknown;
    return true;
  } catch {
    return false;
  }
}

function errorCategory(error: unknown): string {
  if (error instanceof LLMFormatError) {
    return 'JSON 解析失败';
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return '请求已取消';
  }
  return '请求失败';
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

function persistDurableEvent(
  database: DatabaseSync,
  event: StreamEvent
): EventEnvelope {
  const seq = appendInTransaction(database, event.discussionId, event);
  return { event, seq };
}

export class DiscussionRunner {
  private readonly database: DatabaseSync;
  private readonly bus: DiscussionEventBus;
  private readonly llm: LLMGateway;
  private readonly config: DiscussionRunnerConfig;
  private readonly discussionId: string;
  private readonly rng: () => number;
  private readonly controllers = new Set<AbortController>();
  private readonly wakeups = new Set<() => void>();
  private donePromise: Promise<void> = Promise.resolve();
  private running = false;
  private stopped = false;
  private automaticPause = false;
  private consecutiveFailures = 0;
  private liveUtterance: LiveUtterance | null = null;
  private insightTask: Promise<void> = Promise.resolve();
  private insightRunning = false;
  private insightRerunRequested = false;
  private lastProcessedInsightSeq = 0;
  private expertTurnsSinceHost = 0;
  private noBidders = false;
  private addressed: string | null = null;
  private lastSpeakerId: string | null = null;
  private recentExpertSpeakerIds: string[] = [];
  private lastSpokeTurn: Record<string, number> = {};
  private readonly modelSpeakingBidCounts: Record<BidIntent, number> = {
    raise_hand: 0,
    interrupt: 0,
    supplement: 0,
    rebut: 0
  };
  private readonly effectiveSpeakingBidCounts: Record<BidIntent, number> = {
    raise_hand: 0,
    interrupt: 0,
    supplement: 0,
    rebut: 0
  };
  private interruptBidRewriteCount = 0;
  private bidFormatFailureCount = 0;
  private bidFormatRetrySuccessCount = 0;
  private bidFormatRetryStillFailedCount = 0;

  constructor(
    database: DatabaseSync,
    bus: DiscussionEventBus,
    llm: LLMGateway,
    config: DiscussionRunnerConfig,
    discussionId: string,
    rng?: () => number
  ) {
    this.database = database;
    this.bus = bus;
    this.llm = llm;
    this.config = config;
    this.discussionId = discussionId;
    this.rng = rng ?? createRng(discussionId);

    const context = this.readContext();
    if (!context) {
      throw new Error('Discussion does not exist');
    }
    this.rebuildStrategyContext(context);
    this.lastProcessedInsightSeq = context.insights.reduce(
      (maxSeq, insight) => Math.max(maxSeq, insight.updatedAtSeq),
      0
    );
  }

  get done(): Promise<void> {
    return this.donePromise;
  }

  start(): void {
    this.launch();
  }

  pause(): void {
    if (this.stopped || getById(this.database, this.discussionId)?.status !== 'live') {
      return;
    }
    this.changeStatus('paused');
    this.wake();
  }

  resume(): void {
    if (this.stopped) {
      return;
    }
    const discussion = getById(this.database, this.discussionId);
    if (!discussion || discussion.status !== 'paused') {
      return;
    }
    this.automaticPause = false;
    this.consecutiveFailures = 0;
    this.changeStatus('live', { errorMessage: null });
    this.wake();
    this.launch();
  }

  requestEnd(): void {
    if (this.stopped) {
      return;
    }
    const discussion = getById(this.database, this.discussionId);
    if (
      !discussion ||
      (discussion.status !== 'live' && discussion.status !== 'paused')
    ) {
      return;
    }
    this.automaticPause = false;
    this.changeStatus('summarizing');
    this.wake();
    this.launch();
  }

  stop(): void {
    if (this.stopped) {
      return;
    }
    this.stopped = true;
    for (const controller of this.controllers) {
      controller.abort();
    }
    this.wake();
  }

  getLiveUtterance(): LiveUtterance | null {
    return this.liveUtterance;
  }

  private launch(): void {
    if (this.running || this.stopped) {
      return;
    }
    this.running = true;
    this.donePromise = this.runLoop()
      .catch((error: unknown) => {
        this.logFailure('engine', error);
        if (!this.stopped) {
          this.pauseForFailure();
        }
      })
      .finally(() => {
        this.running = false;
      });
  }

  private readContext(): RunnerContext | null {
    const discussion = getById(this.database, this.discussionId);
    if (!discussion) {
      return null;
    }
    return {
      discussion,
      participants: listParticipants(this.database, this.discussionId),
      utterances: listUtterances(this.database, this.discussionId),
      insights: listInsights(this.database, this.discussionId)
    };
  }

  private rebuildStrategyContext(context: RunnerContext): void {
    const participantById = new Map(
      context.participants.map((participant) => [participant.id, participant])
    );
    let turnIndex = 0;
    this.lastSpeakerId = null;
    this.recentExpertSpeakerIds = [];
    this.lastSpokeTurn = {};
    this.expertTurnsSinceHost = 0;
    this.addressed = null;
    this.noBidders = false;

    for (const utterance of context.utterances) {
      const participant = participantById.get(utterance.participantId);
      if (!participant) {
        continue;
      }
      this.lastSpeakerId = participant.id;
      if (participant.role === 'host') {
        this.expertTurnsSinceHost = 0;
        this.noBidders = false;
        this.addressed =
          utterance.act === 'opening' || utterance.act === 'closing'
            ? null
            : utterance.replyToParticipantId;
        continue;
      }
      if (utterance.act === 'opening' || utterance.act === 'closing') {
        continue;
      }
      turnIndex += 1;
      this.expertTurnsSinceHost += 1;
      this.lastSpokeTurn[participant.id] = turnIndex;
      this.recentExpertSpeakerIds = [
        ...this.recentExpertSpeakerIds,
        participant.id
      ].slice(-2);
      if (this.addressed === participant.id) {
        this.addressed = null;
      }
    }
  }

  private async runLoop(): Promise<void> {
    if (this.stopped) {
      return;
    }

    const initialContext = this.readContext();
    if (!initialContext) {
      return;
    }
    if (
      initialContext.discussion.status === 'live' &&
      initialContext.utterances.length === 0
    ) {
      const host = initialContext.participants.find(
        (participant) => participant.role === 'host'
      );
      if (host) {
        await this.speak(host.id, 'opening', null);
      }
    }

    while (!this.stopped) {
      const context = this.readContext();
      if (!context) {
        return;
      }
      if (context.discussion.status === 'paused') {
        if (this.automaticPause) {
          return;
        }
        await this.waitWhilePaused();
        continue;
      }
      if (context.discussion.status === 'summarizing') {
        await this.summarize();
        return;
      }
      if (context.discussion.status !== 'live') {
        return;
      }
      if (context.discussion.turnCount >= context.discussion.maxTurns) {
        this.changeStatus('summarizing');
        continue;
      }

      await this.runRound(context);
      if (this.stopped || this.automaticPause) {
        return;
      }
      const afterRound = this.readContext();
      if (!afterRound) {
        return;
      }
      if (
        afterRound.discussion.status === 'paused' ||
        afterRound.discussion.status === 'summarizing'
      ) {
        continue;
      }
      if (afterRound.discussion.status !== 'live') {
        return;
      }
      await this.waitForPacingOrControl();
    }
  }

  private async runRound(context: RunnerContext): Promise<void> {
    const participantById = new Map(
      context.participants.map((participant) => [
        participant.id,
        participant
      ])
    );
    const lastIntervention = [...context.utterances]
      .reverse()
      .find((utterance) => {
        const participant = participantById.get(utterance.participantId);
        return (
          participant?.role === 'host' &&
          (utterance.act === 'bridge' || utterance.act === 'follow_up')
        );
      });
    const lastInterventionAct =
      lastIntervention?.act === 'bridge' ||
      lastIntervention?.act === 'follow_up'
        ? lastIntervention.act
        : null;
    const decision = decideHostAction({
      participants: context.participants,
      lastSpeakerId: this.lastSpeakerId,
      lastInterventionAct,
      expertTurnsSinceHost: this.expertTurnsSinceHost,
      noBidders: this.noBidders,
      turnCount: context.discussion.turnCount,
      maxTurns: context.discussion.maxTurns,
      expertCount: context.discussion.expertCount,
      insights: context.insights
    });

    if (decision.action !== 'experts') {
      if (!this.isLive()) {
        return;
      }
      const targetId = decision.targetParticipantId;
      const target = context.participants.find(
        (participant) => participant.id === targetId
      );
      const divergence =
        decision.action === 'bridge'
          ? this.bridgeContext(context, targetId)
          : undefined;
      const success = await this.speak(
        context.participants.find(({ role }) => role === 'host')?.id ?? '',
        decision.action,
        targetId,
        divergence
      );
      if (success && target) {
        this.addressed = target.id;
        this.expertTurnsSinceHost = 0;
        this.noBidders = false;
      }
      return;
    }

    const experts = context.participants.filter(
      (participant) => participant.role === 'expert'
    );
    if (experts.length === 0) {
      this.noBidders = true;
      return;
    }
    const settled = await this.collectBids(context, experts);

    if (this.stopped) {
      return;
    }
    if (!this.isLive()) {
      this.resetBidStates(experts);
      return;
    }
    const fulfilled = settled.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : []
    );
    if (fulfilled.length === 0) {
      this.recordFailure();
      return;
    }

    const bids = fulfilled.map(({ bid }) => bid);
    const pick = selectSpeaker({
      bids,
      participants: experts,
      lastSpeakerId: this.lastSpeakerId,
      recentExpertSpeakerIds: this.recentExpertSpeakerIds,
      recentExpertActs: getRecentExpertActs(
        context.utterances,
        context.participants
      ),
      lastSpokeTurn: this.lastSpokeTurn,
      turnIndex: getById(this.database, this.discussionId)?.turnCount ?? 0,
      addressedParticipantId: this.addressed,
      rng: this.rng
    });

    if (!pick) {
      this.resetBidStates(experts);
      this.noBidders = true;
      if (
        context.discussion.turnCount >=
        context.discussion.maxTurns - 1
      ) {
        const eligible = experts.filter(
          (participant) => participant.id !== this.lastSpeakerId
        );
        const fallbackPool = eligible.length > 0 ? eligible : experts;
        const fallback = [...fallbackPool].sort(
          (left, right) =>
            left.speakCount - right.speakCount || left.seat - right.seat
        )[0];
        if (fallback) {
          this.noBidders = false;
          await this.speak(fallback.id, 'statement', null);
        }
      }
      return;
    }

    const selected = experts.find(
      (participant) => participant.id === pick.participantId
    );
    this.resetBidStates(experts, selected?.id);
    if (!selected) {
      this.noBidders = true;
      return;
    }

    const act: SpeechAct =
      pick.intent === 'raise_hand' ? 'statement' : pick.intent;
    const success = await this.speak(
      selected.id,
      act,
      pick.replyToParticipantId
    );
    if (success) {
      this.noBidders = false;
      if (this.addressed === selected.id) {
        this.addressed = null;
      }
    }
  }

  private async collectBids(
    context: RunnerContext,
    experts: readonly Participant[]
  ): Promise<PromiseSettledResult<BidResult>[]> {
    const aliasMap = buildAliasMap(context.participants);
    const aliasesById = new Map(
      Object.entries(aliasMap).map(([alias, id]) => [id, alias])
    );
    const latest = context.utterances.at(-1);
    const previousUtterance = latest
      ? {
          seq: latest.seq,
          speakerAlias:
            aliasesById.get(latest.participantId) ?? 'H'
        }
      : null;
    const base = this.promptInput(context);
    const bodyUtterances = context.utterances.filter(
      ({ act }) => act !== 'opening' && act !== 'closing'
    );
    const expertIds = new Set(experts.map(({ id }) => id));
    const usedInterruptCount = bodyUtterances.filter(
      ({ act, participantId }) =>
        act === 'interrupt' && expertIds.has(participantId)
    ).length;
    const interruptAvailability = resolveInterruptAvailability({
      maxTurns: context.discussion.maxTurns,
      usedCount: usedInterruptCount,
      lastBodyAct: bodyUtterances.at(-1)?.act ?? null
    });

    return Promise.allSettled(
      experts.map(async (participant): Promise<BidResult> => {
        const controller = this.createController();
        try {
          const prompt = buildBidPrompt({
            ...base,
            speakerAlias: aliasesById.get(participant.id) ?? 'E1',
            speaker: roleCard(participant),
            previousUtterance,
            addressed: this.addressed === participant.id,
            interruptAvailability
          });
          const request = {
            task: 'bid',
            discussionId: this.discussionId,
            system: prompt.system,
            user: prompt.user,
            context: prompt.context,
            signal: controller.signal
          } satisfies Parameters<LLMGateway['complete']>[0];
          const response = await this.llm.complete(request);
          let raw: unknown;
          try {
            raw = parseJsonLoose(response.text);
          } catch (error) {
            if (!(error instanceof LLMFormatError)) {
              throw error;
            }
            this.bidFormatFailureCount += 1;
            this.logFailure('bid', error, {
              contentLength: response.text.length
            });
            if (this.stopped || !this.isLive()) {
              throw error;
            }

            const retryResponse = await this.llm.complete(request);
            try {
              raw = parseJsonLoose(retryResponse.text);
              this.bidFormatRetrySuccessCount += 1;
            } catch (retryError) {
              if (!(retryError instanceof LLMFormatError)) {
                throw retryError;
              }
              this.bidFormatFailureCount += 1;
              this.bidFormatRetryStillFailedCount += 1;
              this.logFailure('bid', retryError, {
                contentLength: retryResponse.text.length
              });
              throw retryError;
            }
          }
          const normalized = normalizeBid(raw, {
            selfId: participant.id,
            aliasToParticipantId: aliasMap
          });
          const bid = enforceInterruptAvailability(
            normalized,
            interruptAvailability
          );
          if (normalized.wantToSpeak) {
            this.modelSpeakingBidCounts[normalized.intent] += 1;
            this.effectiveSpeakingBidCounts[bid.intent] += 1;
            if (normalized.intent === 'interrupt' && bid.intent === 'rebut') {
              this.interruptBidRewriteCount += 1;
            }
          }
          const bidWithParticipant = {
            ...bid,
            participantId: participant.id
          };
          const currentlyLive = this.isLive();
          this.publishParticipantState(
            participant.id,
            currentlyLive && bidWithParticipant.wantToSpeak
              ? 'preparing'
              : 'idle',
            currentlyLive && bidWithParticipant.wantToSpeak
              ? bidWithParticipant.intent
              : null,
            bidWithParticipant.focus
          );
          return { participant, bid: bidWithParticipant };
        } catch (error) {
          if (!this.stopped) {
            if (!(error instanceof LLMFormatError)) {
              this.logFailure('bid', error);
            }
            this.publishParticipantState(
              participant.id,
              'idle',
              null,
              participant.focus
            );
          }
          throw error;
        } finally {
          this.releaseController(controller);
        }
      })
    );
  }

  private promptInput(context: RunnerContext): DiscussionPromptInput {
    const aliasMap = buildAliasMap(context.participants);
    const aliasById = new Map(
      Object.entries(aliasMap).map(([alias, id]) => [id, alias])
    );
    return {
      topic: context.discussion.topic,
      transcriptWindow: buildTranscriptWindow(
        context.utterances,
        context.participants
      ),
      insights: context.insights,
      aliasMap,
      roster: context.participants.map((participant) => ({
        alias: aliasById.get(participant.id) ?? 'E1',
        name: participant.name,
        profession: participant.profession,
        title: participant.title,
        stanceTag: participant.stanceTag,
        stance: participant.stance
      }))
    };
  }

  private bridgeContext(
    context: RunnerContext,
    targetParticipantId: string
  ): HostPromptDivergence | undefined {
    const experts = new Set(
      context.participants
        .filter(({ role }) => role === 'expert')
        .map(({ id }) => id)
    );
    const divergence = context.insights
      .filter(
        (insight) =>
          insight.kind === 'divergence' &&
          insight.status === 'active' &&
          new Set(
            insight.stances
              .map(({ participantId }) => participantId)
              .filter((participantId) => experts.has(participantId))
          ).size >= 2
      )
      .toSorted((left, right) => right.updatedAtSeq - left.updatedAtSeq)[0];
    if (!divergence) {
      return undefined;
    }
    const aliasMap = buildAliasMap(context.participants);
    const aliasesById = new Map(
      Object.entries(aliasMap).map(([alias, id]) => [id, alias])
    );
    const targetAlias = aliasesById.get(targetParticipantId);
    if (!targetAlias) {
      return undefined;
    }
    const matchingDivergences = insightsInCreatedOrder(
      context.insights,
      'divergence'
    );
    const refIndex = matchingDivergences.findIndex(
      (insight) => insight.id === divergence.id
    );
    return {
      ref: refIndex >= 0 ? `D${refIndex + 1}` : null,
      content: divergence.content,
      stances: divergence.stances.flatMap((stance) => {
        const speakerAlias = aliasesById.get(stance.participantId);
        return speakerAlias && experts.has(stance.participantId)
          ? [{ speakerAlias, position: stance.position }]
          : [];
      })
    };
  }

  private resetBidStates(
    experts: readonly Participant[],
    selectedParticipantId?: string
  ): void {
    for (const expert of experts) {
      if (expert.id === selectedParticipantId) {
        continue;
      }
      const current =
        listParticipants(this.database, this.discussionId).find(
          ({ id }) => id === expert.id
        ) ?? expert;
      this.publishParticipantState(
        expert.id,
        'idle',
        null,
        current.focus
      );
    }
  }

  private async speak(
    participantId: string,
    act: HostAct | Exclude<SpeechAct, HostAct>,
    replyToParticipantId: string | null,
    divergence?: HostPromptDivergence
  ): Promise<boolean> {
    if (this.stopped) {
      return false;
    }
    const context = this.readContext();
    const participant = context?.participants.find(
      ({ id }) => id === participantId
    );
    if (!context || !participant) {
      return false;
    }

    const aliasMap = buildAliasMap(context.participants);
    const speakerAlias = aliasForParticipant(aliasMap, participant.id) ?? 'H';
    const replyToAlias = aliasForParticipant(aliasMap, replyToParticipantId);
    const promptInput = this.promptInput(context);
    const isHost = participant.role === 'host';
    const prompt =
      isHost && isHostAct(act)
        ? buildHostPrompt({
            ...promptInput,
            hostRoleCard: roleCard(participant),
            action: act,
            targetAlias: replyToAlias,
            divergence
          })
        : buildUtterancePrompt({
            ...promptInput,
            speakerAlias,
            speaker: roleCard(participant),
            act: act as Exclude<SpeechAct, HostAct>,
            replyToAlias
          });
    const task: LLMTask = isHost ? 'host' : 'utterance';
    const sentenceLimit =
      act === 'opening'
        ? MAX_SENTENCES.opening
        : MAX_SENTENCES.expert;
    const utteranceId = randomUUID();
    const seq = nextSeq(this.database, this.discussionId);

    this.publishParticipantState(
      participant.id,
      'speaking',
      null,
      participant.focus
    );

    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (this.stopped) {
        this.clearLiveUtterance();
        return false;
      }
      const controller = this.createController();
      const at = isoNow();
      this.liveUtterance = {
        utteranceId,
        participantId: participant.id,
        act,
        replyToParticipantId,
        seq,
        text: ''
      };
      this.bus.publish({
        type: 'utterance.started',
        discussionId: this.discussionId,
        at,
        utteranceId,
        participantId: participant.id,
        act,
        replyToParticipantId,
        seq
      });
      const limiter = createSentenceLimiter(sentenceLimit, participant.name);
      let generated = '';

      try {
        for await (const delta of this.llm.stream({
          task,
          discussionId: this.discussionId,
          system: prompt.system,
          user: prompt.user,
          context: prompt.context,
          signal: controller.signal
        })) {
          if (this.stopped) {
            return false;
          }
          generated += delta;
          const visible = limiter.push(delta);
          if (visible) {
            this.appendLiveDelta(utteranceId, visible);
          }
          if (limiter.done) {
            controller.abort();
            break;
          }
        }

        const finalText = clampSentences(
          sanitizeUtterance(generated, participant.name),
          sentenceLimit
        );
        if (!finalText) {
          throw new Error('发言内容为空');
        }
        const write = this.persistUtterance({
          utteranceId,
          participant,
          seq,
          act,
          replyToParticipantId,
          content: finalText,
          countAsTurn: act !== 'opening'
        });
        if (!write) {
          this.clearLiveUtterance();
          return false;
        }
        this.lastSpeakerId = participant.id;
        this.updateStrategyAfterUtterance(
          participant,
          act,
          replyToParticipantId,
          write.utterance.seq
        );
        this.liveUtterance = null;
        for (const envelope of write.envelopes) {
          broadcastPersisted(this.bus, envelope);
        }
        this.publishParticipantState(
          participant.id,
          'idle',
          null,
          participant.focus
        );
        this.consecutiveFailures = 0;
        if (act !== 'opening') {
          this.scheduleInsights();
        }
        return true;
      } catch (error) {
        if (this.stopped) {
          this.clearLiveUtterance();
          return false;
        }
        if (attempt === 1) {
          this.logFailure(task, error);
          this.bus.publish({
            type: 'error',
            discussionId: this.discussionId,
            at: isoNow(),
            code: 'LLM_ERROR',
            message: DROPOUT_MESSAGE
          });
        }
      } finally {
        this.releaseController(controller);
      }
    }

    this.clearLiveUtterance();
    this.publishParticipantState(participant.id, 'idle', null, participant.focus);
    this.recordFailure();
    return false;
  }

  private persistUtterance(input: {
    utteranceId: string;
    participant: Participant;
    seq: number;
    act: SpeechAct;
    replyToParticipantId: string | null;
    content: string;
    countAsTurn: boolean;
  }): UtteranceWrite | null {
    const at = isoNow();
    const envelopes: EventEnvelope[] = [];
    let utterance: Utterance | null = null;
    let status: DiscussionStatus = 'live';

    withTransaction(this.database, () => {
      utterance = insertUtterance(this.database, this.discussionId, {
        id: input.utteranceId,
        participantId: input.participant.id,
        seq: input.seq,
        act: input.act,
        replyToParticipantId: input.replyToParticipantId,
        content: input.content,
        createdAt: at
      });
      const speakCount = incrementSpeakCount(
        this.database,
        this.discussionId,
        input.participant.id
      );
      if (speakCount === null) {
        throw new Error('Speaker is outside the discussion');
      }

      if (input.countAsTurn) {
        const turnCount = incrementTurnCount(
          this.database,
          this.discussionId,
          at
        );
        if (turnCount === null) {
          throw new Error('Discussion is unavailable');
        }
        let discussion = getById(this.database, this.discussionId);
        if (!discussion) {
          throw new Error('Discussion is unavailable');
        }
        if (
          turnCount >= discussion.maxTurns &&
          (discussion.status === 'live' || discussion.status === 'paused')
        ) {
          discussion =
            updateStatus(this.database, this.discussionId, 'summarizing', {}, at) ??
            discussion;
        }
        status = discussion.status;
      } else {
        const discussion = getById(this.database, this.discussionId);
        if (!discussion) {
          throw new Error('Discussion is unavailable');
        }
        status = discussion.status;
      }

      const completedEvent: StreamEvent = {
        type: 'utterance.completed',
        discussionId: this.discussionId,
        at,
        utterance
      };
      envelopes.push(persistDurableEvent(this.database, completedEvent));

      if (input.countAsTurn) {
        const discussion = getById(this.database, this.discussionId);
        if (!discussion) {
          throw new Error('Discussion is unavailable');
        }
        const statusEvent: StreamEvent = {
          type: 'discussion.status',
          discussionId: this.discussionId,
          at,
          status: discussion.status,
          turnCount: discussion.turnCount,
          maxTurns: discussion.maxTurns
        };
        envelopes.push(persistDurableEvent(this.database, statusEvent));
      }
    });

    if (!utterance) {
      return null;
    }
    return { utterance, envelopes, status };
  }

  private updateStrategyAfterUtterance(
    participant: Participant,
    act: SpeechAct,
    replyToParticipantId: string | null,
    seq: number
  ): void {
    if (participant.role === 'host') {
      this.expertTurnsSinceHost = 0;
      this.noBidders = false;
      this.addressed =
        act === 'opening' || act === 'closing' ? null : replyToParticipantId;
      return;
    }

    if (act === 'opening' || act === 'closing') {
      return;
    }
    this.expertTurnsSinceHost += 1;
    const turnCount =
      getById(this.database, this.discussionId)?.turnCount ?? seq;
    this.lastSpokeTurn[participant.id] = turnCount;
    this.recentExpertSpeakerIds = [
      ...this.recentExpertSpeakerIds,
      participant.id
    ].slice(-2);
    if (this.addressed === participant.id) {
      this.addressed = null;
    }
  }

  private appendLiveDelta(utteranceId: string, delta: string): void {
    if (!this.liveUtterance || this.liveUtterance.utteranceId !== utteranceId) {
      return;
    }
    this.liveUtterance = {
      ...this.liveUtterance,
      text: this.liveUtterance.text + delta
    };
    this.bus.publish({
      type: 'utterance.delta',
      discussionId: this.discussionId,
      at: isoNow(),
      utteranceId,
      delta
    });
  }

  private clearLiveUtterance(): void {
    this.liveUtterance = null;
  }

  private publishParticipantState(
    participantId: string,
    agentState: Participant['agentState'],
    agentIntent: Participant['agentIntent'],
    focus: string | null
  ): void {
    if (this.stopped) {
      return;
    }
    const participant = updateAgentState(
      this.database,
      this.discussionId,
      participantId,
      { agentState, agentIntent, focus }
    );
    if (!participant) {
      return;
    }
    this.bus.publish({
      type: 'participant.state',
      discussionId: this.discussionId,
      at: isoNow(),
      participantId,
      agentState,
      agentIntent,
      focus
    });
  }

  private async summarize(): Promise<void> {
    if (this.stopped) {
      return;
    }
    await this.waitForInsights();
    if (this.stopped) {
      return;
    }
    const context = this.readContext();
    const host = context?.participants.find(
      (participant) => participant.role === 'host'
    );
    if (!context || !host || context.discussion.status !== 'summarizing') {
      return;
    }
    this.resetBidStates(
      context.participants.filter(({ role }) => role === 'expert')
    );
    this.publishParticipantState(host.id, 'speaking', null, host.focus);

    const seq = nextSeq(this.database, this.discussionId);
    const result = await this.generateSummary(context, host, seq);
    if (!result || this.stopped) {
      this.clearLiveUtterance();
      return;
    }

    const { utteranceId } = result;
    const replyToParticipantId = null;
    if (this.liveUtterance?.utteranceId === utteranceId) {
      this.liveUtterance = {
        ...this.liveUtterance,
        text: result.text
      };
    }

    const at = isoNow();
    const envelopes: EventEnvelope[] = [];
    let closing: Utterance | null = null;
    const priorParticipants = context.participants;
    withTransaction(this.database, () => {
      const inserted = insertUtterance(this.database, this.discussionId, {
        id: utteranceId,
        participantId: host.id,
        seq,
        act: 'closing',
        replyToParticipantId,
        content: result.text,
        createdAt: at
      });
      closing = inserted;
      const speakCount = incrementSpeakCount(
        this.database,
        this.discussionId,
        host.id
      );
      if (speakCount === null) {
        throw new Error('Host is outside the discussion');
      }
      setSummary(this.database, this.discussionId, result.text, at);
      resetAgentStates(this.database, this.discussionId);

      const utteranceEvent: StreamEvent = {
        type: 'utterance.completed',
        discussionId: this.discussionId,
        at,
        utterance: inserted
      };
      const summaryEvent: StreamEvent = {
        type: 'summary.completed',
        discussionId: this.discussionId,
        at,
        summary: result.text
      };
      envelopes.push(persistDurableEvent(this.database, utteranceEvent));
      envelopes.push(persistDurableEvent(this.database, summaryEvent));
    });

    this.liveUtterance = null;
    this.lastSpeakerId = host.id;
    for (const envelope of envelopes) {
      broadcastPersisted(this.bus, envelope);
    }
    for (const participant of priorParticipants) {
      if (
        participant.id === host.id ||
        participant.agentState !== 'idle' ||
        participant.agentIntent !== null ||
        participant.focus !== null
      ) {
        this.publishParticipantState(
          participant.id,
          'idle',
          null,
          null
        );
      }
    }
    const endedAt = isoNow();
    this.changeStatus('ended', { endedAt }, endedAt);
    this.reportBidMetrics();
  }

  private reportBidMetrics(): void {
    if (process.env.APS_REPORT_BID_METRICS !== '1') {
      return;
    }
    console.info(
      `APS_BID_METRICS ${JSON.stringify({
        discussionId: this.discussionId,
        modelSpeakingBids: this.modelSpeakingBidCounts,
        effectiveSpeakingBids: this.effectiveSpeakingBidCounts,
        interruptBidRewrites: this.interruptBidRewriteCount,
        bidFormatFailureCount: this.bidFormatFailureCount,
        bidFormatRetrySuccessCount: this.bidFormatRetrySuccessCount,
        bidFormatRetryStillFailedCount:
          this.bidFormatRetryStillFailedCount
      })}`
    );
  }

  private async generateSummary(
    context: RunnerContext,
    host: Participant,
    seq: number
  ): Promise<SummaryResult | null> {
    const fullContext: RunnerContext = this.readContext() ?? context;
    const allUtterances = fullContext.utterances;
    const prompt = buildSummaryPrompt({
      ...this.promptInput(fullContext),
      transcriptWindow: buildTranscriptWindow(
        allUtterances,
        fullContext.participants,
        allUtterances.length
      )
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (this.stopped) {
        return null;
      }
      const controller = this.createController();
      const chunks: string[] = [];
      let pending = '';
      let utteranceId: string | null = null;
      try {
        for await (const delta of this.llm.stream({
          task: 'summary',
          discussionId: this.discussionId,
          system: prompt.system,
          user: prompt.user,
          context: prompt.context,
          signal: controller.signal
        })) {
          if (this.stopped) {
            return null;
          }
          chunks.push(delta);
          if (!utteranceId) {
            pending += delta;
            const firstVisibleIndex = pending.search(/\S/u);
            if (firstVisibleIndex < 0) {
              continue;
            }
            const firstVisible = pending.trimStart()[0];
            if (firstVisible === '{' || firstVisible === '[') {
              throw new LLMFormatError('总结不能为 JSON');
            }
            utteranceId = this.startSummaryUtterance(host, seq);
            this.appendLiveDelta(utteranceId, pending);
            pending = '';
          } else {
            this.appendLiveDelta(utteranceId, delta);
          }
        }
        if (this.stopped) {
          return null;
        }
        const text = chunks.join('').trim();
        if (!text || isJsonText(text)) {
          throw new LLMFormatError(
            text ? '总结不能为 JSON' : '总结内容为空'
          );
        }
        if (!utteranceId) {
          throw new LLMFormatError('总结内容为空');
        }
        return { text, utteranceId };
      } catch (error) {
        if (this.stopped) {
          return null;
        }
        this.logFailure('summary', error);
      } finally {
        this.releaseController(controller);
      }
    }

    if (this.stopped) {
      return null;
    }
    const fallback = this.fallbackSummary(fullContext);
    const utteranceId = this.startSummaryUtterance(host, seq);
    this.appendLiveDelta(utteranceId, fallback);
    return { text: fallback, utteranceId };
  }

  private startSummaryUtterance(host: Participant, seq: number): string {
    const utteranceId = randomUUID();
    this.liveUtterance = {
      utteranceId,
      participantId: host.id,
      act: 'closing',
      replyToParticipantId: null,
      seq,
      text: ''
    };
    this.bus.publish({
      type: 'utterance.started',
      discussionId: this.discussionId,
      at: isoNow(),
      utteranceId,
      participantId: host.id,
      act: 'closing',
      replyToParticipantId: null,
      seq
    });
    return utteranceId;
  }

  private fallbackSummary(context: RunnerContext): string {
    const participants = new Map(
      context.participants.map((participant) => [participant.id, participant])
    );
    const spoken = new Set(
      context.utterances
        .filter((utterance) => {
          const participant = participants.get(utterance.participantId);
          return participant?.role === 'expert';
        })
        .map(({ participantId }) => participantId)
    );
    const spokenNames = [...spoken]
      .map((id) => participants.get(id)?.name)
      .filter((name): name is string => Boolean(name));
    const consensus = context.insights
      .filter((insight) => insight.kind === 'consensus')
      .map((insight) => insight.content);
    const divergences = context.insights
      .filter((insight) => insight.kind === 'divergence')
      .map((insight) => insight.content);
    const first = spokenNames.length
      ? `本场围绕「${context.discussion.topic}」展开，${spokenNames.join('、')}结合讨论中的具体问题分享了各自的判断。`
      : `本场围绕「${context.discussion.topic}」展开，讨论梳理了当前议题及其需要进一步确认的条件。`;
    const second =
      consensus.length > 0
        ? `洞察区记录的共识是：${consensus.join('；')}。`
        : divergences.length > 0
          ? `讨论中的主要分歧是：${divergences.join('；')}。`
          : '各位嘉宾从不同角度分析了议题，尚需结合更多具体条件继续判断。';
    const third =
      divergences.length > 0
        ? `仍待进一步厘清的问题包括：${divergences.join('；')}。`
        : '后续可以继续检验哪些事实与适用边界会改变现有判断。';
    return `${first}\n\n${second}\n\n${third}\n\n感谢各位嘉宾参与讨论，也感谢观众收看。`;
  }

  private scheduleInsights(): void {
    if (this.stopped) {
      return;
    }
    if (this.insightRunning) {
      this.insightRerunRequested = true;
      return;
    }
    this.insightRunning = true;
    this.insightRerunRequested = false;
    this.insightTask = (async () => {
      do {
        this.insightRerunRequested = false;
        await this.processInsightsOnce();
      } while (this.insightRerunRequested && !this.stopped);
    })().finally(() => {
      this.insightRunning = false;
      if (this.insightRerunRequested && !this.stopped) {
        this.scheduleInsights();
      }
    });
  }

  private async processInsightsOnce(): Promise<void> {
    if (this.stopped) {
      return;
    }
    const context = this.readContext();
    if (!context) {
      return;
    }
    const added = context.utterances.filter(
      ({ seq }) => seq > this.lastProcessedInsightSeq
    );
    if (added.length === 0) {
      return;
    }

    const aliasMap = buildAliasMap(context.participants);
    const prompt = buildInsightsPrompt({
      topic: context.discussion.topic,
      aliasMap,
      roster: this.promptInput(context).roster,
      existingInsights: context.insights,
      transcriptWindow: context.utterances
        .slice(-10)
        .map((utterance) => mapUtteranceToPrompt(utterance, aliasMap)),
      newUtterances: added.map((utterance) =>
        mapUtteranceToPrompt(utterance, aliasMap)
      )
    });
    const controller = this.createController();
    try {
      const response = await this.llm.complete({
        task: 'insights',
        discussionId: this.discussionId,
        system: prompt.system,
        user: prompt.user,
        context: prompt.context,
        signal: controller.signal
      });
      const patch = parseJsonLoose(response.text);
      const now = isoNow();
      const maxSeq = context.utterances.reduce(
        (current, utterance) => Math.max(current, utterance.seq),
        this.lastProcessedInsightSeq
      );
      const refs: Record<string, string> = {};
      for (const kind of ['consensus', 'divergence'] as const) {
        const prefix = kind === 'consensus' ? 'C' : 'D';
        insightsInCreatedOrder(context.insights, kind).forEach(
          (insight, index) => {
            refs[`${prefix}${index + 1}`] = insight.id;
          }
        );
      }
      const merged = mergeInsights(context.insights, patch, {
        discussionId: this.discussionId,
        aliasToParticipantId: aliasMap,
        refToInsightId: refs,
        validSeqs: new Set(context.utterances.map(({ seq }) => seq)),
        currentSeq: maxSeq,
        now,
        newId: randomUUID,
        maxPerKind: MAX_INSIGHTS_PER_KIND,
        similarityThreshold: INSIGHT_SIMILARITY_THRESHOLD
      });
      if (merged.changed) {
        const envelopes: EventEnvelope[] = [];
        withTransaction(this.database, () => {
          replaceAllInTransaction(
            this.database,
            this.discussionId,
            merged.insights
          );
          const updatedInsights = listInsights(
            this.database,
            this.discussionId
          );
          const event: StreamEvent = {
            type: 'insights.updated',
            discussionId: this.discussionId,
            at: now,
            insights: updatedInsights
          };
          envelopes.push(persistDurableEvent(this.database, event));
        });
        for (const envelope of envelopes) {
          broadcastPersisted(this.bus, envelope);
        }
      }
      this.lastProcessedInsightSeq = maxSeq;
    } catch (error) {
      if (!this.stopped) {
        this.logFailure('insights', error);
      }
    } finally {
      this.releaseController(controller);
    }
  }

  private async waitForInsights(): Promise<void> {
    while (this.insightRunning || this.insightRerunRequested) {
      const current = this.insightTask;
      await current;
      if (this.stopped) {
        return;
      }
    }
  }

  private recordFailure(): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= 3) {
      this.automaticPause = true;
      this.pauseForFailure();
    }
  }

  private pauseForFailure(): void {
    if (this.stopped) {
      return;
    }
    const discussion = getById(this.database, this.discussionId);
    if (
      !discussion ||
      (discussion.status !== 'live' && discussion.status !== 'paused')
    ) {
      return;
    }
    this.changeStatus(
      'paused',
      { errorMessage: PAUSE_ERROR_MESSAGE },
      isoNow()
    );
    this.bus.publish({
      type: 'error',
      discussionId: this.discussionId,
      at: isoNow(),
      code: 'LLM_ERROR',
      message: PAUSE_ERROR_MESSAGE
    });
    this.wake();
  }

  private changeStatus(
    status: DiscussionStatus,
    patch: Partial<Pick<Discussion, 'startedAt' | 'endedAt' | 'errorMessage'>> = {},
    at = isoNow()
  ): Discussion | null {
    let updated: Discussion | null = null;
    let envelope: EventEnvelope | null = null;
    withTransaction(this.database, () => {
      updated = updateStatus(this.database, this.discussionId, status, patch, at);
      if (!updated) {
        return;
      }
      const event: StreamEvent = {
        type: 'discussion.status',
        discussionId: this.discussionId,
        at,
        status: updated.status,
        turnCount: updated.turnCount,
        maxTurns: updated.maxTurns
      };
      envelope = persistDurableEvent(this.database, event);
    });
    if (envelope) {
      broadcastPersisted(this.bus, envelope);
    }
    return updated;
  }

  private isLive(): boolean {
    return getById(this.database, this.discussionId)?.status === 'live';
  }

  private async waitWhilePaused(): Promise<void> {
    while (!this.stopped && !this.automaticPause) {
      if (getById(this.database, this.discussionId)?.status !== 'paused') {
        return;
      }
      await new Promise<void>((resolve) => {
        const wake = () => {
          this.wakeups.delete(wake);
          resolve();
        };
        this.wakeups.add(wake);
      });
    }
  }

  private async waitForPacingOrControl(): Promise<void> {
    const delayMs = Math.max(0, Math.floor(this.config.pacingMs));
    if (
      delayMs === 0 ||
      this.stopped ||
      getById(this.database, this.discussionId)?.status !== 'live'
    ) {
      return;
    }
    await new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        this.wakeups.delete(finish);
        resolve();
      };
      const timer = setTimeout(finish, delayMs);
      this.wakeups.add(finish);
    });
  }

  private wake(): void {
    for (const wake of [...this.wakeups]) {
      wake();
    }
  }

  private createController(): AbortController {
    const controller = new AbortController();
    this.controllers.add(controller);
    return controller;
  }

  private releaseController(controller: AbortController): void {
    this.controllers.delete(controller);
  }

  private logFailure(
    task: string,
    error: unknown,
    metadata?: { contentLength: number }
  ): void {
    const contentLength =
      metadata === undefined ? '' : ` contentLength=${metadata.contentLength}`;
    console.warn(
      `${task} failed: discussionId=${this.discussionId} category=${errorCategory(error)}${contentLength}`
    );
  }
}

function isHostAct(act: SpeechAct): act is HostAct {
  return (
    act === 'opening' ||
    act === 'follow_up' ||
    act === 'bridge' ||
    act === 'invite' ||
    act === 'closing'
  );
}

function selectSpeaker(input: {
  bids: readonly NormalizedBid[];
  participants: readonly Participant[];
  lastSpeakerId: string | null;
  recentExpertSpeakerIds: readonly string[];
  recentExpertActs?: readonly ExpertAct[];
  lastSpokeTurn: Readonly<Record<string, number>>;
  turnIndex: number;
  addressedParticipantId: string | null;
  rng: () => number;
}) {
  const seatByParticipantId = Object.fromEntries(
    input.participants.map((participant) => [
      participant.id,
      participant.seat
    ])
  );
  return importSelectNextSpeaker({
    bids: input.bids,
    lastSpeakerId: input.lastSpeakerId,
    recentExpertSpeakerIds: input.recentExpertSpeakerIds,
    recentExpertActs: input.recentExpertActs,
    lastSpokeTurn: input.lastSpokeTurn,
    turnIndex: input.turnIndex,
    addressedParticipantId: input.addressedParticipantId,
    seatByParticipantId,
    rng: input.rng
  });
}