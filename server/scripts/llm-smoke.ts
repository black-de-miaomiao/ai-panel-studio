import { randomUUID } from 'node:crypto';
import type { Insight, Participant, Utterance } from '@aps/shared';
import {
  buildAliasMap,
  buildTranscriptWindow
} from '../src/core/context';
import {
  decideHostAction,
  type HostPolicyContext,
  type HostPolicyParticipant
} from '../src/core/hostPolicy';
import { normalizeBid } from '../src/core/bid';
import {
  enforceInterruptAvailability,
  resolveInterruptAvailability
} from '../src/core/interruptPolicy';
import { mergeInsights } from '../src/core/insights';
import { normalizeLineup } from '../src/core/lineup';
import { parseJsonLoose } from '../src/core/json';
import { createRng } from '../src/core/rng';
import { selectNextSpeaker } from '../src/core/scheduler';
import {
  clampSentences,
  createSentenceLimiter,
  sanitizeUtterance
} from '../src/core/sentences';
import { loadConfig, loadDotEnv } from '../src/config';
import {
  buildBidPrompt,
  buildHostPrompt,
  buildInsightsPrompt,
  buildLineupPrompt,
  buildSummaryPrompt,
  buildUtterancePrompt,
  type HostPromptDivergence,
  type PromptRosterEntry,
  type PromptParts,
  type PromptRoleCard
} from '../src/prompts';
import { createLLMGateway, type LLMGateway } from '../src/llm/gateway';
import { createOpenAICompatibleProvider } from '../src/llm/openaiCompatible';
import type { AppConfig } from '../src/config';
import type { NormalizedBid } from '../src/core/bid';
import type { NormalizedLineup, ParticipantDraft } from '../src/core/lineup';
import type { InsightPromptUtterance } from '../src/prompts';
import type { LLMTask } from '../src/llm/types';

const TOPIC = 'AI 编程助手会让初级程序员岗位消失吗？';
const EXPERT_COUNT = 4;
const SMOKE_MAX_TURNS = 6;
const UNSAFE_PUBLIC_TEXT =
  /\bsk-[a-z0-9_-]{8,}\b|authorization\s*:|reasoning_content/iu;

interface BidResult {
  participant: Participant;
  bid: NormalizedBid | null;
  failed: boolean;
  failureCategory: BidFailureCategory | null;
}

type BidFailureCategory =
  | '大模型调用或安全检查失败'
  | 'JSON 解析失败'
  | '大模型响应格式无效'
  | '出价校验失败';

interface SmokeState {
  discussionId: string;
  participants: Participant[];
  aliases: Record<string, string>;
  aliasByParticipantId: Map<string, string>;
  utterances: Utterance[];
  insights: Insight[];
  sequence: number;
  turnCount: number;
  expertTurnsSinceHost: number;
  addressedParticipantId: string | null;
  lastSpeakerId: string | null;
  recentExpertSpeakerIds: string[];
  lastSpokeTurn: Record<string, number>;
}

function assertPublicText(text: string): void {
  if (UNSAFE_PUBLIC_TEXT.test(text)) {
    throw new Error('PUBLIC_OUTPUT_REJECTED');
  }
}

function printPublic(text: string): void {
  assertPublicText(text);
  console.info(text);
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

function toParticipant(
  draft: ParticipantDraft,
  discussionId: string
): Participant {
  return {
    ...draft,
    id: randomUUID(),
    discussionId,
    agentState: 'idle',
    agentIntent: null,
    focus: null,
    speakCount: 0
  };
}

function createGateway(config: AppConfig): LLMGateway {
  return createLLMGateway({
    provider: createOpenAICompatibleProvider({
      baseUrl: config.llm.baseUrl,
      apiKey: config.llm.apiKey
    }),
    models: {
      quality: config.llm.qualityModel,
      fast: config.llm.fastModel
    },
    maxConcurrency: config.llm.maxConcurrency,
    logger: (line) => {
      assertPublicText(line);
      console.info(line);
    }
  });
}

async function completePrompt(
  gateway: LLMGateway,
  state: SmokeState,
  currentTask: { value: string },
  task: LLMTask,
  prompt: PromptParts,
  thinking?: 'disabled' | 'low'
): Promise<string> {
  currentTask.value = task;
  try {
    const response = await gateway.complete({
      task,
      system: prompt.system,
      user: prompt.user,
      context: prompt.context,
      discussionId: state.discussionId,
      json: task === 'lineup' || task === 'bid' || task === 'insights',
      ...(thinking ? { thinking } : {})
    });
    assertPublicText(response.text);
    return response.text;
  } catch {
    throw new Error('LLM_CALL_FAILED');
  }
}

async function streamPrompt(
  gateway: LLMGateway,
  state: SmokeState,
  currentTask: { value: string },
  task: 'host' | 'utterance' | 'summary',
  prompt: PromptParts,
  speakerName: string,
  maxSentences?: number
): Promise<string> {
  currentTask.value = task;
  const limiter =
    maxSentences === undefined
      ? null
      : createSentenceLimiter(maxSentences, speakerName);
  let rawText = '';
  try {
    for await (const delta of gateway.stream({
      task,
      system: prompt.system,
      user: prompt.user,
      context: prompt.context,
      discussionId: state.discussionId
    })) {
      rawText += delta;
      limiter?.push(delta);
    }
  } catch {
    throw new Error('LLM_STREAM_FAILED');
  }
  assertPublicText(rawText);

  if (task === 'summary') {
    return rawText.trim();
  }
  const cleaned = sanitizeUtterance(rawText, speakerName);
  return clampSentences(cleaned, maxSentences ?? 2);
}

function transcript(state: SmokeState): string {
  return buildTranscriptWindow(state.utterances, state.participants);
}

function rosterForPrompt(state: SmokeState): PromptRosterEntry[] {
  return state.participants.map((participant) => ({
    alias:
      state.aliasByParticipantId.get(participant.id) ??
      (participant.role === 'host' ? 'H' : `E${participant.seat}`),
    name: participant.name,
    profession: participant.profession,
    title: participant.title,
    stanceTag: participant.stanceTag,
    stance: participant.stance
  }));
}

function discussionPromptInput(state: SmokeState) {
  return {
    topic: TOPIC,
    transcriptWindow: transcript(state),
    insights: state.insights,
    roster: rosterForPrompt(state),
    aliasMap: state.aliases
  };
}

function previousUtteranceForPrompt(
  state: SmokeState
): { seq: number; speakerAlias: string } | null {
  const utterance = state.utterances.at(-1);
  if (!utterance) {
    return null;
  }
  return {
    seq: utterance.seq,
    speakerAlias:
      state.aliasByParticipantId.get(utterance.participantId) ?? 'H'
  };
}

function latestDivergenceForPrompt(
  state: SmokeState
): HostPromptDivergence | undefined {
  const insight = state.insights
    .filter(({ kind, status }) => kind === 'divergence' && status === 'active')
    .toSorted((left, right) => right.updatedAtSeq - left.updatedAtSeq)[0];
  if (!insight) {
    return undefined;
  }
  const stances = insight.stances.flatMap(({ participantId, position }) => {
    const speakerAlias = state.aliasByParticipantId.get(participantId);
    return speakerAlias
      ? [{ speakerAlias, position }]
      : [];
  });
  return stances.length >= 2
    ? { content: insight.content, stances }
    : undefined;
}

function recordUtterance(
  state: SmokeState,
  participantId: string,
  act: Utterance['act'],
  replyToParticipantId: string | null,
  content: string
): Utterance {
  const participant = state.participants.find(({ id }) => id === participantId);
  if (!participant) {
    throw new Error('PARTICIPANT_MISSING');
  }
  const utterance: Utterance = {
    id: randomUUID(),
    discussionId: state.discussionId,
    participantId,
    seq: ++state.sequence,
    act,
    replyToParticipantId,
    content,
    createdAt: new Date().toISOString()
  };
  state.utterances.push(utterance);
  state.participants = state.participants.map((candidate) =>
    candidate.id === participantId
      ? { ...candidate, speakCount: candidate.speakCount + 1 }
      : candidate
  );
  return utterance;
}

function publicUtterance(
  state: SmokeState,
  utterance: Utterance,
  label: string
): void {
  const participant = state.participants.find(
    ({ id }) => id === utterance.participantId
  );
  const alias =
    state.aliasByParticipantId.get(utterance.participantId) ?? '嘉宾';
  printPublic(
    `${label} ${alias} ${participant?.name ?? '未知嘉宾'}（${utterance.act}）：${utterance.content}`
  );
}

function hasSpeakerPrefix(text: string, speakerName: string): boolean {
  const prefixes = [
    `${speakerName}：`,
    `${speakerName}:`,
    `【${speakerName}】`,
    `**${speakerName}**：`,
    '主持人：'
  ];
  return prefixes.some((prefix) => text.trimStart().startsWith(prefix));
}

function makeState(lineup: NormalizedLineup): SmokeState {
  const discussionId = randomUUID();
  const host = toParticipant(lineup.host, discussionId);
  const experts = lineup.experts.map((expert) =>
    toParticipant(expert, discussionId)
  );
  const participants = [host, ...experts];
  const aliases = buildAliasMap(participants);
  const aliasByParticipantId = new Map(
    Object.entries(aliases).map(([alias, participantId]) => [
      participantId,
      alias
    ])
  );
  return {
    discussionId,
    participants,
    aliases,
    aliasByParticipantId,
    utterances: [],
    insights: [],
    sequence: 0,
    turnCount: 0,
    expertTurnsSinceHost: 0,
    addressedParticipantId: null,
    lastSpeakerId: null,
    recentExpertSpeakerIds: [],
    lastSpokeTurn: {}
  };
}

function refMapForInsights(insights: readonly Insight[]): Record<string, string> {
  const refs: Record<string, string> = {};
  for (const kind of ['consensus', 'divergence'] as const) {
    const prefix = kind === 'consensus' ? 'C' : 'D';
    const matching = insights
      .filter((insight) => insight.kind === kind)
      .toSorted(
        (left, right) =>
          left.createdAt.localeCompare(right.createdAt) ||
          left.updatedAtSeq - right.updatedAtSeq
      );
    matching.forEach((insight, index) => {
      refs[`${prefix}${index + 1}`] = insight.id;
    });
  }
  return refs;
}

function printLineup(state: SmokeState, heading: string): void {
  printPublic(heading);
  for (const participant of state.participants) {
    const alias = state.aliasByParticipantId.get(participant.id) ?? 'H';
    printPublic(
      `${alias}｜${participant.name}｜${participant.profession}｜${participant.title}｜${participant.stanceTag}｜${participant.stance}｜${participant.persona}`
    );
  }
}

function lineupQuality(lineup: NormalizedLineup): {
  diversity: number;
  hasSupport: boolean;
  hasOpposition: boolean;
  roleRelevance: number;
  personaCoverage: number;
} {
  const experts = lineup.experts;
  const stanceTags = new Set(experts.map(({ stanceTag }) => stanceTag));
  const hasSupport = experts.some(({ stanceTag }) =>
    /支持|赞成/u.test(stanceTag)
  );
  const hasOpposition = experts.some(({ stanceTag }) =>
    /反对/u.test(stanceTag)
  );
  const roleRelevance = experts.filter(({ profession, title }) =>
    /程序|开发|软件|编程|工程|计算机|科技|技术|招聘|人才|教育|就业|职业|人力|经济/u.test(
      `${profession} ${title}`
    )
  ).length;
  const personaCoverage = experts.filter(
    ({ persona }) => persona.trim().length > 0
  ).length;
  return {
    diversity: stanceTags.size,
    hasSupport,
    hasOpposition,
    roleRelevance,
    personaCoverage
  };
}

function printQuality(
  mode: string,
  quality: ReturnType<typeof lineupQuality>
): void {
  printPublic(
    `${mode} 阵容质量：立场种类=${quality.diversity}；偏支持=${quality.hasSupport ? '有' : '无'}；偏反对=${quality.hasOpposition ? '有' : '无'}；相关职业=${quality.roleRelevance}/${EXPERT_COUNT}；persona=${quality.personaCoverage}/${EXPERT_COUNT}`
  );
}

async function runComparison(
  gateway: LLMGateway,
  currentTask: { value: string }
): Promise<void> {
  const results: Array<{
    mode: 'disabled' | 'low';
    quality: ReturnType<typeof lineupQuality>;
  }> = [];
  const prompt = buildLineupPrompt({
    topic: TOPIC,
    expertCount: EXPERT_COUNT
  });

  for (const mode of ['disabled', 'low'] as const) {
    const state: SmokeState = {
      discussionId: randomUUID(),
      participants: [],
      aliases: {},
      aliasByParticipantId: new Map(),
      utterances: [],
      insights: [],
      sequence: 0,
      turnCount: 0,
      expertTurnsSinceHost: 0,
      addressedParticipantId: null,
      lastSpeakerId: null,
      recentExpertSpeakerIds: [],
      lastSpokeTurn: {}
    };
    const responseText = await completePrompt(
      gateway,
      state,
      currentTask,
      'lineup',
      prompt,
      mode
    );
    const normalized = normalizeLineup(
      parseJsonLoose(responseText),
      EXPERT_COUNT
    );
    const comparisonState = makeState(normalized);
    printLineup(comparisonState, `阵容思考模式对照：${mode}`);
    const quality = lineupQuality(normalized);
    printQuality(mode, quality);
    results.push({ mode, quality });
  }

  const disabled = results.find(({ mode }) => mode === 'disabled')?.quality;
  const low = results.find(({ mode }) => mode === 'low')?.quality;
  if (disabled && low) {
    printPublic(
      `对照差异（low - disabled）：立场种类=${low.diversity - disabled.diversity}；相关职业=${low.roleRelevance - disabled.roleRelevance}；persona=${low.personaCoverage - disabled.personaCoverage}；偏支持=${disabled.hasSupport ? '有' : '无'}=>${low.hasSupport ? '有' : '无'}；偏反对=${disabled.hasOpposition ? '有' : '无'}=>${low.hasOpposition ? '有' : '无'}。`
    );
  }
  printPublic('阵容对照完成：每种思考模式各调用 lineup 一次。');
}

async function speakHost(
  gateway: LLMGateway,
  state: SmokeState,
  currentTask: { value: string },
  action: 'opening' | 'follow_up' | 'bridge' | 'invite',
  targetParticipantId: string | null
): Promise<Utterance> {
  const host = state.participants.find(({ role }) => role === 'host');
  if (!host) {
    throw new Error('HOST_MISSING');
  }
  const targetAlias = targetParticipantId
    ? state.aliasByParticipantId.get(targetParticipantId) ?? null
    : null;
  const prompt = buildHostPrompt({
    ...discussionPromptInput(state),
    hostRoleCard: roleCard(host),
    action,
    targetAlias,
    ...(action === 'bridge'
      ? { divergence: latestDivergenceForPrompt(state) }
      : {})
  });
  const maxSentences = action === 'opening' ? 3 : 2;
  const content = await streamPrompt(
    gateway,
    state,
    currentTask,
    'host',
    prompt,
    host.name,
    maxSentences
  );
  if (!content || hasSpeakerPrefix(content, host.name)) {
    throw new Error('HOST_OUTPUT_INVALID');
  }
  const utterance = recordUtterance(
    state,
    host.id,
    action,
    targetParticipantId,
    content
  );
  state.lastSpeakerId = host.id;
  state.expertTurnsSinceHost = 0;
  state.addressedParticipantId = targetParticipantId;
  state.turnCount += action === 'opening' ? 0 : 1;
  publicUtterance(state, utterance, '主持人发言：');
  return utterance;
}

async function requestBid(
  gateway: LLMGateway,
  state: SmokeState,
  participant: Participant,
  currentTask: { value: string }
): Promise<BidResult> {
  const speakerAlias =
    state.aliasByParticipantId.get(participant.id) ?? 'E1';
  const bodyUtterances = state.utterances.filter(
    ({ act }) => act !== 'opening' && act !== 'closing'
  );
  const expertIds = new Set(
    state.participants
      .filter(({ role }) => role === 'expert')
      .map(({ id }) => id)
  );
  const interruptAvailability = resolveInterruptAvailability({
    maxTurns: SMOKE_MAX_TURNS,
    usedCount: bodyUtterances.filter(
      ({ act, participantId }) =>
        act === 'interrupt' && expertIds.has(participantId)
    ).length,
    lastBodyAct: bodyUtterances.at(-1)?.act ?? null
  });
  const prompt = buildBidPrompt({
    ...discussionPromptInput(state),
    speakerAlias,
    speaker: roleCard(participant),
    previousUtterance: previousUtteranceForPrompt(state),
    addressed: state.addressedParticipantId === participant.id,
    interruptAvailability
  });
  let responseText: string;
  try {
    responseText = await completePrompt(
      gateway,
      state,
      currentTask,
      'bid',
      prompt
    );
  } catch {
    return {
      participant,
      bid: null,
      failed: true,
      failureCategory: '大模型调用或安全检查失败'
    };
  }

  let parsed: unknown;
  try {
    parsed = parseJsonLoose(responseText);
  } catch {
    return {
      participant,
      bid: null,
      failed: true,
      failureCategory: 'JSON 解析失败'
    };
  }

  if (!hasBidResponseShape(parsed)) {
    return {
      participant,
      bid: null,
      failed: true,
      failureCategory: '大模型响应格式无效'
    };
  }

  try {
    const normalized = normalizeBid(parsed, {
      selfId: participant.id,
      aliasToParticipantId: state.aliases
    });
    return {
      participant,
      bid: enforceInterruptAvailability(normalized, interruptAvailability),
      failed: false,
      failureCategory: null
    };
  } catch {
    return {
      participant,
      bid: null,
      failed: true,
      failureCategory: '出价校验失败'
    };
  }
}

function hasBidResponseShape(
  value: unknown
): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.wantToSpeak === 'boolean' &&
    ['raise_hand', 'interrupt', 'supplement', 'rebut'].includes(
      String(record.intent)
    ) &&
    typeof record.urgency === 'number' &&
    Number.isFinite(record.urgency) &&
    (record.replyTo === null || typeof record.replyTo === 'string') &&
    (record.focus === null || typeof record.focus === 'string')
  );
}

function logBids(state: SmokeState, results: readonly BidResult[]): void {
  printPublic('本轮专家出价：');
  for (const result of results) {
    const alias =
      state.aliasByParticipantId.get(result.participant.id) ?? '专家';
    if (!result.bid) {
      printPublic(
        `${alias}｜请求失败（${result.failureCategory ?? '出价处理失败'}）`
      );
      continue;
    }
    const replyTo = result.bid.replyToParticipantId
      ? state.aliasByParticipantId.get(result.bid.replyToParticipantId) ?? null
      : null;
    printPublic(
      `${alias}｜wantToSpeak=${result.bid.wantToSpeak}｜intent=${result.bid.intent}｜urgency=${result.bid.urgency.toFixed(2)}｜replyTo=${replyTo ?? '无'}｜focus=${result.bid.focus ?? '无'}`
    );
  }
}

function scheduleSpeaker(
  state: SmokeState,
  results: readonly BidResult[],
  turnIndex: number
) {
  const bids = results
    .map(({ bid }) => bid)
    .filter((bid): bid is NormalizedBid => bid !== null);
  return selectNextSpeaker({
    bids,
    lastSpeakerId: state.lastSpeakerId,
    recentExpertSpeakerIds: state.recentExpertSpeakerIds,
    lastSpokeTurn: state.lastSpokeTurn,
    turnIndex,
    addressedParticipantId: state.addressedParticipantId,
    seatByParticipantId: Object.fromEntries(
      state.participants
        .filter(({ role }) => role === 'expert')
        .map(({ id, seat }) => [id, seat])
    ),
    rng: createRng(`${state.discussionId}:${turnIndex}`)
  });
}

async function buildBidResults(
  gateway: LLMGateway,
  state: SmokeState,
  currentTask: { value: string }
): Promise<BidResult[]> {
  const experts = state.participants.filter(({ role }) => role === 'expert');
  return Promise.all(
    experts.map((expert) => requestBid(gateway, state, expert, currentTask))
  );
}

async function scheduleNoBidFallback(
  gateway: LLMGateway,
  state: SmokeState,
  currentTask: { value: string },
  results: readonly BidResult[],
  turnIndex: number
) {
  const hostContext: HostPolicyContext = {
    participants: state.participants.map(
      ({ id, role, seat, speakCount }): HostPolicyParticipant => ({
        id,
        role,
        seat,
        speakCount
      })
    ),
    lastSpeakerId: state.lastSpeakerId,
    expertTurnsSinceHost: state.expertTurnsSinceHost,
    noBidders: true,
    turnCount: state.turnCount,
    maxTurns: Number.MAX_SAFE_INTEGER,
    expertCount: state.participants.filter(({ role }) => role === 'expert')
      .length,
    insights: state.insights
  };
  const decision = decideHostAction(hostContext);
  if (
    decision.action !== 'invite' ||
    !decision.targetParticipantId
  ) {
    return null;
  }
  await speakHost(
    gateway,
    state,
    currentTask,
    'invite',
    decision.targetParticipantId
  );
  return scheduleSpeaker(state, results, turnIndex);
}

async function speakExpert(
  gateway: LLMGateway,
  state: SmokeState,
  currentTask: { value: string },
  participantId: string,
  intent: NormalizedBid['intent'],
  replyToParticipantId: string | null
): Promise<Utterance> {
  const participant = state.participants.find(({ id }) => id === participantId);
  if (!participant) {
    throw new Error('EXPERT_MISSING');
  }
  const speakerAlias =
    state.aliasByParticipantId.get(participant.id) ?? 'E1';
  const replyToAlias = replyToParticipantId
    ? state.aliasByParticipantId.get(replyToParticipantId) ?? null
    : null;
  const act = intent === 'raise_hand' ? 'statement' : intent;
  const prompt = buildUtterancePrompt({
    ...discussionPromptInput(state),
    speakerAlias,
    speaker: roleCard(participant),
    act,
    replyToAlias
  });
  const content = await streamPrompt(
    gateway,
    state,
    currentTask,
    'utterance',
    prompt,
    participant.name,
    2
  );
  if (!content || hasSpeakerPrefix(content, participant.name)) {
    throw new Error('EXPERT_OUTPUT_INVALID');
  }
  const utterance = recordUtterance(
    state,
    participant.id,
    act,
    replyToParticipantId,
    content
  );
  state.lastSpeakerId = participant.id;
  state.lastSpokeTurn[participant.id] = state.turnCount + 1;
  state.recentExpertSpeakerIds = [
    ...state.recentExpertSpeakerIds,
    participant.id
  ].slice(-2);
  state.expertTurnsSinceHost += 1;
  state.turnCount += 1;
  if (state.addressedParticipantId === participant.id) {
    state.addressedParticipantId = null;
  }
  publicUtterance(state, utterance, '专家发言：');
  return utterance;
}

function insightPromptUtterances(
  state: SmokeState
): InsightPromptUtterance[] {
  return state.utterances.map((utterance) => ({
    seq: utterance.seq,
    speakerAlias:
      state.aliasByParticipantId.get(utterance.participantId) ?? 'E1',
    act: utterance.act,
    replyToAlias: utterance.replyToParticipantId
      ? state.aliasByParticipantId.get(utterance.replyToParticipantId) ?? null
      : null,
    content: utterance.content
  }));
}

async function runFullSmoke(
  gateway: LLMGateway,
  currentTask: { value: string }
): Promise<void> {
  const lineupPrompt = buildLineupPrompt({
    topic: TOPIC,
    expertCount: EXPERT_COUNT
  });
  const lineupText = await completePrompt(
    gateway,
    {
      discussionId: randomUUID(),
      participants: [],
      aliases: {},
      aliasByParticipantId: new Map(),
      utterances: [],
      insights: [],
      sequence: 0,
      turnCount: 0,
      expertTurnsSinceHost: 0,
      addressedParticipantId: null,
      lastSpeakerId: null,
      recentExpertSpeakerIds: [],
      lastSpokeTurn: {}
    },
    currentTask,
    'lineup',
    lineupPrompt
  );
  const lineup = normalizeLineup(parseJsonLoose(lineupText), EXPERT_COUNT);
  const state = makeState(lineup);
  printLineup(state, '阵容表：');

  const opening = await speakHost(gateway, state, currentTask, 'opening', null);
  const experts = state.participants.filter(({ role }) => role === 'expert');
  const openingMissingNames = experts
    .filter(({ name }) => !opening.content.includes(name))
    .map(({ name }) => name);
  const openingNamesPass = openingMissingNames.length === 0;
  const allBidResults: BidResult[] = [];
  for (let turnIndex = 1; turnIndex <= 5; turnIndex += 1) {
    currentTask.value = 'bid';
    const results = await buildBidResults(gateway, state, currentTask);
    allBidResults.push(...results);
    logBids(state, results);
    if (results.every(({ failed }) => failed)) {
      throw new Error('ALL_BIDS_FAILED');
    }

    let pick = scheduleSpeaker(state, results, turnIndex);
    if (!pick) {
      printPublic('本轮无人主动出价，主持人按规则点名发言最少的专家。');
      pick = await scheduleNoBidFallback(
        gateway,
        state,
        currentTask,
        results,
        turnIndex
      );
    }
    if (!pick) {
      throw new Error('NO_SPEAKER_SELECTED');
    }

    const selected = {
      participantId: pick.participantId,
      intent: pick.intent,
      replyToParticipantId: pick.replyToParticipantId
    };
    await speakExpert(
      gateway,
      state,
      currentTask,
      selected.participantId,
      selected.intent,
      selected.replyToParticipantId
    );
    if (turnIndex === 3) {
      const addressed = selected.participantId;
      await speakHost(gateway, state, currentTask, 'follow_up', addressed);
    }
  }

  const validSeqs = new Set(state.utterances.map(({ seq }) => seq));
  const utteranceWindow = insightPromptUtterances(state);
  const newExpertUtterances = utteranceWindow.filter(
    ({ speakerAlias }) => speakerAlias !== 'H'
  );
  const insightsPrompt = buildInsightsPrompt({
    topic: TOPIC,
    aliasMap: state.aliases,
    roster: rosterForPrompt(state),
    existingInsights: state.insights,
    transcriptWindow: utteranceWindow.slice(-10),
    newUtterances: newExpertUtterances
  });
  const patchText = await completePrompt(
    gateway,
    state,
    currentTask,
    'insights',
    insightsPrompt
  );
  const merged = mergeInsights(state.insights, parseJsonLoose(patchText), {
    discussionId: state.discussionId,
    aliasToParticipantId: Object.fromEntries(
      Object.entries(state.aliases).filter(([alias]) => alias !== 'H')
    ),
    refToInsightId: refMapForInsights(state.insights),
    validSeqs,
    currentSeq: state.sequence,
    now: new Date().toISOString(),
    newId: randomUUID,
    maxPerKind: 6,
    similarityThreshold: 0.6
  });
  state.insights = merged.insights;
  printPublic('洞察：');
  const insightEvidencePass = state.insights.every((insight) =>
    insight.evidenceSeqs.every((seq) => validSeqs.has(seq))
  );
  if (state.insights.length === 0) {
    printPublic('暂无新增有效洞察。');
  } else {
    for (const insight of state.insights) {
      const participants = insight.stances
        .map(
          ({ participantId, position }) =>
            `${state.aliasByParticipantId.get(participantId) ?? '专家'}：${position}`
        )
        .join('；');
      printPublic(
        `${insight.kind === 'consensus' ? '共识' : '分歧'}｜${insight.content}｜${participants}｜证据序号 ${insight.evidenceSeqs.join(',')}`
      );
    }
  }
  printPublic(
    `检查：洞察条数=${state.insights.length}；证据序号真实=${insightEvidencePass ? '是' : '否'}。`
  );

  const host = state.participants.find(({ role }) => role === 'host');
  if (!host) {
    throw new Error('HOST_MISSING');
  }
  const summaryPrompt = buildSummaryPrompt({
    ...discussionPromptInput(state)
  });
  const summary = await streamPrompt(
    gateway,
    state,
    currentTask,
    'summary',
    summaryPrompt,
    host.name
  );
  if (summaryLooksJson(summary)) {
    throw new Error('SUMMARY_JSON_REJECTED');
  }
  assertPublicText(summary);
  printPublic(`总结：\n${summary}`);

  const speechUtterances = state.utterances.filter(
    ({ act }) => act !== 'closing'
  );
  const sentenceLimitsPass = speechUtterances.every((utterance) => {
    const speaker = state.participants.find(
      ({ id }) => id === utterance.participantId
    );
    const limit =
      utterance.act === 'opening'
        ? 3
        : utterance.act === 'follow_up' ||
            utterance.act === 'bridge' ||
            utterance.act === 'invite' ||
            utterance.act === 'statement' ||
            utterance.act === 'interrupt' ||
            utterance.act === 'supplement' ||
            utterance.act === 'rebut'
          ? 2
          : 100;
    return (
      clampSentences(utterance.content, limit) === utterance.content &&
      !hasSpeakerPrefix(utterance.content, speaker?.name ?? '')
    );
  });
  const summaryParagraphs = summary
    .split(/\r?\n\s*\r?\n/u)
    .filter((paragraph) => paragraph.trim().length > 0).length;
  const summaryParagraphsPass =
    summaryParagraphs >= 3 && summaryParagraphs <= 5;
  const intentCounts: Record<NormalizedBid['intent'], number> = {
    raise_hand: 0,
    interrupt: 0,
    supplement: 0,
    rebut: 0
  };
  const speakingIntentCounts: Record<NormalizedBid['intent'], number> = {
    raise_hand: 0,
    interrupt: 0,
    supplement: 0,
    rebut: 0
  };
  for (const { bid } of allBidResults) {
    if (bid) {
      intentCounts[bid.intent] += 1;
      if (bid.wantToSpeak) {
        speakingIntentCounts[bid.intent] += 1;
      }
    }
  }
  const validBidCount = allBidResults.filter(({ bid }) => bid !== null).length;
  const speakingBidCount = allBidResults.filter(
    ({ bid }) => bid?.wantToSpeak
  ).length;
  const failedBidCount = allBidResults.filter(({ failed }) => failed).length;
  printPublic(
    `检查：开场嘉宾姓名覆盖=${experts.length - openingMissingNames.length}/${experts.length}${openingNamesPass ? '' : `；缺少=${openingMissingNames.join('、')}`}。`
  );
  printPublic(
    `检查：出价意图分布（有效出价 / wantToSpeak=true）：raise_hand=${intentCounts.raise_hand}/${speakingIntentCounts.raise_hand}；interrupt=${intentCounts.interrupt}/${speakingIntentCounts.interrupt}；supplement=${intentCounts.supplement}/${speakingIntentCounts.supplement}；rebut=${intentCounts.rebut}/${speakingIntentCounts.rebut}；wantToSpeak=${speakingBidCount}/${validBidCount}；失败=${failedBidCount}/${allBidResults.length}。`
  );
  if (
    !sentenceLimitsPass ||
    !summaryParagraphsPass ||
    !openingNamesPass ||
    !insightEvidencePass ||
    state.insights.length === 0
  ) {
    throw new Error('SMOKE_CHECK_FAILED');
  }
  printPublic('检查：未发现隐藏推理文本泄漏。');
  printPublic('检查：发言句数上限与姓名前缀均通过。');
  printPublic('检查：总结不是 JSON，且包含 3 至 5 段。');
  printPublic(
    `检查：完成 ${state.utterances.filter(({ act }) => act !== 'opening' && act !== 'closing').length} 条正文发言，当前讨论计数 ${state.turnCount}。`
  );
}

function summaryLooksJson(summary: string): boolean {
  const trimmed = summary.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return true;
  }
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const currentTask = { value: '配置' };
  let config: AppConfig;
  try {
    loadDotEnv();
    config = loadConfig();
  } catch {
    printPublic('无法读取服务器配置；未输出任何配置内容。');
    process.exitCode = 1;
    return;
  }
  if (!config.llm.apiKey.trim()) {
    printPublic('未检测到 DeepSeek 密钥，请在 server/.env 中配置后重试。');
    process.exitCode = 1;
    return;
  }

  try {
    const gateway = createGateway(config);
    if (process.argv.includes('--comparison')) {
      await runComparison(gateway, currentTask);
    } else {
      await runFullSmoke(gateway, currentTask);
    }
  } catch {
    printPublic(
      `真实模型冒烟未完成（当前任务：${currentTask.value}）；底层错误与响应正文未输出。`
    );
    process.exitCode = 1;
  }
}

void main();
