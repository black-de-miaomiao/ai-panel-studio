import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { Insight, Participant, Utterance } from '@aps/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { create as createDiscussion, getById, updateStatus } from '../db/repositories/discussions';
import { listByDiscussion as listInsights } from '../db/repositories/insights';
import { listByDiscussion as listParticipants, replaceLineup } from '../db/repositories/participants';
import { listByDiscussion as listUtterances } from '../db/repositories/utterances';
import { createRng } from '../core/rng';
import { normalizeLineup } from '../core/lineup';
import { parseJsonLoose } from '../core/json';
import { createTestDb } from '../test/helpers';
import { createLLMGateway } from '../llm/gateway';
import { createMockProvider } from '../llm/mock';
import {
  MOCK_PROFILE_GROUPS,
  topicGroup,
  topicIssues,
  topicProfiles,
  type MockArgument,
  type MockTopicGroup
} from '../llm/mockProfiles';
import type { LLMProvider, LLMRequest, LLMTask } from '../llm/types';
import { buildLineupPrompt } from '../prompts';
import { createEventBus } from './eventBus';
import { DiscussionRunner } from './runner';

const FLOW_TOPICS = {
  programming: 'AI 编程工具会如何改变初级软件工程师的培养？',
  service: '客服中心应该全面使用 AI 自动回复吗？',
  general: '城市应该限制网约车数量吗？'
} as const;

const INDUSTRY_TERMS =
  /程序|编程|开发|代码|软件|客服|服务|用户|消费者|网约车|车辆|交通|行业|产业/u;

interface FlowScene {
  discussionId: string;
  topic: string;
  discussion: ReturnType<typeof getById>;
  participants: Participant[];
  utterances: Utterance[];
  insights: Insight[];
}

let database: DatabaseSync;

function modelRequest(
  task: LLMTask,
  prompt: { system: string; user: string; context: unknown },
  discussionId: string
): LLMRequest & { model: string } {
  return {
    task,
    ...prompt,
    discussionId,
    json: task === 'lineup' || task === 'bid' || task === 'insights',
    model: task === 'lineup' || task === 'summary' ? 'quality-model' : 'fast-model'
  };
}

async function runMockFlow(
  topic: string,
  discussionId: string
): Promise<FlowScene> {
  const created = createDiscussion(database, {
    topic,
    expertCount: 4,
    maxTurns: 12
  });
  if (created.id !== discussionId) {
    const result = database
      .prepare('UPDATE discussions SET id = ? WHERE id = ?')
      .run(discussionId, created.id);
    if (Number(result.changes) !== 1) {
      throw new Error('Could not assign the requested mock discussion ID');
    }
  }

  const provider = createMockProvider({
    latencyMs: 0,
    streamDelayMs: 0
  });
  const lineupPrompt = buildLineupPrompt({ topic, expertCount: 4 });
  const lineupResult = await provider.complete(
    modelRequest('lineup', lineupPrompt, discussionId)
  );
  const lineup = normalizeLineup(parseJsonLoose(lineupResult.text), 4);
  replaceLineup(database, discussionId, [
    { ...lineup.host, id: randomUUID() },
    ...lineup.experts.map((expert) => ({
      ...expert,
      id: randomUUID()
    }))
  ]);
  updateStatus(database, discussionId, 'live');

  const bus = createEventBus(database);
  const gateway = createLLMGateway({
    provider,
    models: { quality: 'quality-model', fast: 'fast-model' },
    maxConcurrency: 6
  });
  const runner = new DiscussionRunner(
    database,
    bus,
    gateway,
    { maxTurns: 12, pacingMs: 0 },
    discussionId,
    createRng(discussionId)
  );
  runner.start();
  await runner.done;

  return {
    discussionId,
    topic,
    discussion: getById(database, discussionId),
    participants: listParticipants(database, discussionId),
    utterances: listUtterances(database, discussionId),
    insights: listInsights(database, discussionId)
  };
}

function profileFor(participant: Participant, topic: string) {
  return topicProfiles(topic).find(
    ({ stance }) => stance.trim() === participant.stance.trim()
  );
}

function argumentForSource(
  participant: Participant,
  topic: string,
  source: string
): MockArgument | undefined {
  const profile = profileFor(participant, topic);
  return profile?.arguments.find(
    ({ text, position, claim, detail }) =>
      source.includes(text) ||
      source.includes(position) ||
      source.includes(claim) ||
      source.includes(detail.text)
  ) ?? (
    profile && source.includes(profile.stanceClaim)
      ? profile.arguments[0]
      : undefined
  );
}

function lcsLength(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, () => 0);
  let best = 0;
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = Array.from({ length: right.length + 1 }, () => 0);
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      if (left[leftIndex - 1] === right[rightIndex - 1]) {
        current[rightIndex] = previous[rightIndex - 1]! + 1;
        best = Math.max(best, current[rightIndex]!);
      }
    }
    previous = current;
  }
  return best;
}

function firstSentence(value: string): string {
  return value.match(/^[^。！？!?]*[。！？!?]/u)?.[0] ?? value.trim();
}

function sceneGroup(topic: string): MockTopicGroup {
  return topicGroup(topic);
}

function inspectFlow(scene: FlowScene): Record<string, boolean> {
  const checks: Record<string, boolean> = {};
  const mark = (name: string, passed: boolean) => {
    checks[name] = (checks[name] ?? true) && passed;
  };
  const participantById = new Map(
    scene.participants.map((participant) => [participant.id, participant])
  );
  const experts = scene.participants.filter(({ role }) => role === 'expert');
  const host = scene.participants.find(({ role }) => role === 'host');
  const body = scene.utterances.filter(
    ({ act }) => act !== 'opening' && act !== 'closing'
  );
  const expertBody = body.filter(
    ({ participantId }) => participantById.get(participantId)?.role === 'expert'
  );
  const profiles = topicProfiles(scene.topic);
  const issues = topicIssues(scene.topic);
  const summary = scene.discussion?.summary ?? '';
  const outputs = [
    ...scene.utterances.map(({ content }) => content),
    ...scene.insights.map(({ content }) => content),
    summary,
    ...scene.participants.flatMap(({ name, profession, title, stance, persona }) => [
      name,
      profession,
      title,
      stance,
      persona
    ])
  ];
  const byParticipant = (participantId: string) =>
    scene.utterances.filter(({ participantId: id }) => id === participantId);
  const spokenArgument = (
    participant: Participant,
    source: string,
    issue?: string
  ) => {
    const argument = argumentForSource(participant, scene.topic, source);
    return argument && (!issue || argument.issue === issue)
      ? argument
      : undefined;
  };
  const argumentForQuotedClaim = (
    participant: Participant,
    quote: string | undefined
  ) => {
    const profile = profileFor(participant, scene.topic);
    if (!profile || !quote) {
      return undefined;
    }
    return quote === profile.stanceClaim
      ? profile.arguments[0]
      : profile.arguments.find(({ claim }) => claim === quote);
  };
  const dependentLead =
    /^(?:才|就|但|而|所以|因此|并且|并|也|还|再|否则|不然|如果|若|即使|只要|只有|因为|由于|以免|从而|进而|然后)/u;
  const cjkPunctuation = /[，。；：！？,.!?]/u;
  const profileClaimsAreSound = profiles.every((profile) => {
    const stanceClaimLength = Array.from(profile.stanceClaim).length;
    return (
      profile.stance.includes(profile.stanceClaim) &&
      stanceClaimLength >= 4 &&
      stanceClaimLength <= 20 &&
      !cjkPunctuation.test(profile.stanceClaim) &&
      !dependentLead.test(profile.stanceClaim) &&
      profile.arguments.length === issues.length &&
      profile.arguments.every((argument) => {
        const claimLength = Array.from(argument.claim).length;
        return (
          issues.some((issue) =>
            issue.issue === argument.issue && issue.sides.includes(argument.side)
          ) &&
          argument.text.includes(argument.claim) &&
          claimLength >= 4 &&
          claimLength <= 20 &&
          !cjkPunctuation.test(argument.claim) &&
          !dependentLead.test(argument.claim) &&
          argument.detail.text.trim().length > 0 &&
          ['example', 'condition', 'evidence'].includes(argument.detail.kind)
        );
      })
    );
  });
  const stanceSideDirectionValid = profiles.every((profile) => {
    const tag = profile.stanceTag;
    const expectedSide = /反对|不支持|不赞成|不认同|否定/u.test(tag)
      ? 1
      : /中立|观望|谨慎|审慎|保留/u.test(tag)
        ? null
        : /支持|赞成|认同|认可|赞同|看好|乐观/u.test(tag)
          ? 0
          : null;
    const sideIndexes = new Set(
      profile.arguments.map((argument) =>
        issues.find(({ issue }) => issue === argument.issue)?.sides.indexOf(argument.side)
      )
    );
    if (expectedSide === null) {
      return sideIndexes.size === 2;
    }
    return profile.arguments.every(
      (argument) =>
        argument.side ===
        issues.find(({ issue }) => issue === argument.issue)?.sides[expectedSide]
    );
  });
  mark(
    'runner-completes-configured-turns',
    scene.discussion?.status === 'ended' &&
      scene.discussion.turnCount === 12 &&
      body.length === 12 &&
      scene.utterances[0]?.act === 'opening' &&
      scene.utterances.at(-1)?.act === 'closing'
  );
  mark(
    'topic-profiles-have-source-claims-sides-and-details',
    profiles.length === MOCK_PROFILE_GROUPS[sceneGroup(scene.topic)].length &&
      profiles.length === 6 &&
      profileClaimsAreSound
  );
  mark('stance-directions-match-argument-sides', stanceSideDirectionValid);
  mark(
    'general-profile-and-output-stay-topic-neutral',
    sceneGroup(scene.topic) !== 'general' ||
      (() => {
        const topicWithoutTerminalMark = scene.topic.replace(/[。！？!?]+$/u, '');
        const sourceText = profiles
          .flatMap(({ name, profession, title, stance, persona, arguments: args }) => [
            name,
            profession,
            title,
            stance,
            persona,
            ...args.flatMap(({ issue, text, position, claim, detail }) => [
              issue,
              text,
              position,
              claim,
              detail.text
            ])
          ])
          .join('\n');
        const outputText = outputs
          .map((value) =>
            value
              .replaceAll(scene.topic, '')
              .replaceAll(topicWithoutTerminalMark, '')
          )
          .join('\n');
        return !INDUSTRY_TERMS.test(sourceText) && !INDUSTRY_TERMS.test(outputText);
      })()
  );
  mark(
    'outputs-avoid-ellipsis-and-malformed-punctuation',
    outputs.every(
      (value) => !value.includes('…') && !/[。！？!?][，；：]/u.test(value)
    )
  );
  const opening = scene.utterances.find(({ act }) => act === 'opening');
  const closing = scene.utterances.find(({ act }) => act === 'closing');
  mark(
    'opening-quotes-original-topic-and-closing-differs',
    Boolean(
      opening &&
        closing &&
        opening.content.includes(`“${scene.topic}”`) &&
        firstSentence(opening.content) !== firstSentence(closing.content)
    )
  );
  const hostOutputs = scene.utterances.filter(
    ({ participantId }) => participantById.get(participantId)?.role === 'host'
  );
  mark(
    'host-language-avoids-malformed-particles-and-quotes',
    hostOutputs.every(
      ({ content }) => !/吗[。，；]/u.test(content) && !content.includes('提到“')
    ) && outputs.every((value) => !value.includes('提到“'))
  );
  const invalidGeneratedQuotes = scene.utterances
    .filter(({ act }) => act !== 'closing')
    .flatMap((utterance) =>
      [...utterance.content.matchAll(/“([^”]+)”/gu)].flatMap((match) => {
        const quote = match[1] ?? '';
        if (quote === scene.topic) {
          return [];
        }
        const sourceParticipant = utterance.replyToParticipantId
          ? participantById.get(utterance.replyToParticipantId)
          : undefined;
        const sourceProfile = sourceParticipant
          ? profileFor(sourceParticipant, scene.topic)
          : undefined;
        const declaredClaim = Boolean(
          sourceProfile &&
            (sourceProfile.stanceClaim === quote ||
              sourceProfile.arguments.some(({ claim }) => claim === quote))
        );
        const claimWasSpoken = Boolean(
          utterance.replyToParticipantId &&
            scene.utterances.some(
              (candidate) =>
                candidate.seq < utterance.seq &&
                candidate.participantId === utterance.replyToParticipantId &&
                candidate.content.includes(quote)
            )
        );
        return declaredClaim && claimWasSpoken
          ? []
          : [`utterance#${utterance.seq}:${quote}`];
      })
    );
  const invalidSummaryQuotes = [...summary.matchAll(/“([^”]+)”/gu)].flatMap(
    (match) => {
      const quote = match[1] ?? '';
      if (quote === scene.topic) {
        return [];
      }
      const isValid = experts.some((participant) => {
        const profile = profileFor(participant, scene.topic);
        return Boolean(
          profile?.arguments.some(
            (argument) =>
              argument.claim === quote &&
              byParticipant(participant.id).some((utterance) =>
                utterance.content.includes(quote)
              )
          )
        );
      });
      return isValid ? [] : [`summary:${quote}`];
    }
  );
  if (invalidGeneratedQuotes.length > 0 || invalidSummaryQuotes.length > 0) {
    console.info(
      `INVALID_FLOW_QUOTES ${scene.discussionId} ${[
        ...invalidGeneratedQuotes,
        ...invalidSummaryQuotes
      ].join(' | ')}`
    );
  }
  mark(
    'quotes-come-only-from-previously-spoken-claims',
    invalidGeneratedQuotes.length === 0 &&
      invalidSummaryQuotes.length === 0 &&
      scene.insights.every(({ content }) => !content.includes('“'))
  );
  const repeatedUtterances = new Set(
    scene.utterances.map(({ content }) => content)
  ).size;
  mark('no-identical-utterance-sentences', repeatedUtterances === scene.utterances.length);
  const usedArgumentsAtMostOnce = experts.every((participant) => {
    const profile = profileFor(participant, scene.topic);
    const utterances = byParticipant(participant.id);
    return Boolean(
      profile &&
        profile.arguments.every(
          ({ claim, text }) =>
            utterances.filter(({ content }) => content.includes(claim)).length <= 1 &&
            utterances.filter(({ content }) => content.includes(text)).length <= 1
        ) &&
        utterances.filter(({ content }) => content.includes(profile.stanceClaim))
          .length <= 1
    );
  });
  mark('speaker-stance-and-each-argument-used-at-most-once', usedArgumentsAtMostOnce);
  const noLongSpeakerOverlap = experts.every((participant) => {
    const contents = byParticipant(participant.id).map(({ content }) => content);
    return contents.every((content, index) =>
      contents
        .slice(index + 1)
        .every((other) => lcsLength(content, other) <= 8)
    );
  });
  mark('same-speaker-lcs-at-most-eight-characters', noLongSpeakerOverlap);
  const sideDirectedActs = expertBody
    .filter(({ act }) => ['supplement', 'rebut', 'interrupt'].includes(act))
    .every((utterance) => {
      const speaker = participantById.get(utterance.participantId);
      const target = utterance.replyToParticipantId
        ? participantById.get(utterance.replyToParticipantId)
        : undefined;
      const targetUtterance = target
        ? scene.utterances
            .filter(
              (candidate) =>
                candidate.seq < utterance.seq &&
                candidate.participantId === target.id
            )
            .at(-1)
        : undefined;
      if (!speaker || !target || !targetUtterance) {
        return false;
      }
      const speakerArgument = spokenArgument(speaker, utterance.content);
      const targetQuote = utterance.content.match(/“([^”]+)”/u)?.[1];
      const targetArgument =
        argumentForQuotedClaim(target, targetQuote) ??
        spokenArgument(target, targetUtterance.content);
      if (
        !speakerArgument ||
        !targetArgument ||
        speakerArgument.issue !== targetArgument.issue
      ) {
        return false;
      }
      return utterance.act === 'supplement'
        ? speakerArgument.side === targetArgument.side
        : speakerArgument.side !== targetArgument.side;
    });
  mark('supplement-rebut-interrupt-follow-topic-sides', sideDirectedActs);
  const responsePatterns = expertBody
    .filter(({ act }) => ['supplement', 'rebut', 'interrupt'].includes(act))
    .map(({ content }) => content.split(/[，；：。]/u)[0]?.trim() ?? content);
  mark(
    'rebut-supplement-interrupt-use-three-distinct-sentence-patterns',
    new Set(responsePatterns).size >= 3
  );
  const hostPrompts = scene.utterances.filter(
    ({ act, participantId }) =>
      participantById.get(participantId)?.role === 'host' &&
      ['follow_up', 'invite', 'bridge'].includes(act)
  );
  const directedResponses = hostPrompts
    .filter(({ act }) => act === 'follow_up' || act === 'invite')
    .every((prompt) => {
      const response = scene.utterances.find(({ seq }) => seq > prompt.seq);
      return Boolean(
        prompt.replyToParticipantId &&
          response &&
          response.participantId === prompt.replyToParticipantId &&
          response.act === 'statement' &&
          response.replyToParticipantId === host?.id
      );
    });
  mark('invite-follow-up-addressed-expert-speaks-next-to-host', directedResponses);
  const followUpChecks = hostPrompts
    .filter(({ act }) => act === 'follow_up')
    .every((prompt) => {
      const target = prompt.replyToParticipantId
        ? participantById.get(prompt.replyToParticipantId)
        : undefined;
      const source = target
        ? scene.utterances
            .filter(
              (candidate) =>
                candidate.seq < prompt.seq && candidate.participantId === target.id
            )
            .at(-1)
        : undefined;
      const argument = target && source
        ? spokenArgument(target, source.content)
        : undefined;
      const response = scene.utterances.find(({ seq }) => seq > prompt.seq);
      const quote = prompt.content.match(/“([^”]+)”/u)?.[1];
      const kindQuestion = argument
        ? argument.detail.kind === 'example'
          ? /例|案例|情形/u.test(prompt.content)
          : argument.detail.kind === 'condition'
            ? /条件/u.test(prompt.content)
            : /记录|证据|核对|检验/u.test(prompt.content)
        : false;
      const profile = target ? profileFor(target, scene.topic) : undefined;
      return Boolean(
        target &&
          source &&
          argument &&
          profile &&
          quote === argument.claim &&
          source.content.includes(quote) &&
          kindQuestion &&
          response?.participantId === target.id &&
          response.act === 'statement' &&
          response.replyToParticipantId === host?.id &&
          response.content.includes(argument.detail.text) &&
          !response.content.includes(profile.stance)
      );
    });
  mark(
    'follow-up-quotes-claim-asks-detail-and-gets-detail',
    !hostPrompts.some(({ act }) => act === 'follow_up') || followUpChecks
  );
  const inviteChecks = hostPrompts
    .filter(({ act }) => act === 'invite')
    .every((prompt) => {
      const target = prompt.replyToParticipantId
        ? participantById.get(prompt.replyToParticipantId)
        : undefined;
      const profile = target ? profileFor(target, scene.topic) : undefined;
      const response = scene.utterances.find(({ seq }) => seq > prompt.seq);
      if (!target || !profile || !response || response.participantId !== target.id) {
        return false;
      }
      const earlier = scene.utterances.filter(
        (utterance) =>
          utterance.seq < prompt.seq && utterance.participantId === target.id
      );
      if (earlier.length === 0) {
        return response.content.includes(profile.stanceClaim);
      }
      return profile.arguments.some(
        ({ claim }) =>
          response.content.includes(claim) &&
          earlier.every((utterance) => !utterance.content.includes(claim))
      );
    });
  mark(
    'invite-elicits-stance-or-unused-claim',
    hostPrompts.some(({ act }) => act === 'invite') && inviteChecks
  );
  const bridgeChecks = hostPrompts
    .filter(({ act }) => act === 'bridge')
    .every((prompt) => {
      const target = prompt.replyToParticipantId
        ? participantById.get(prompt.replyToParticipantId)
        : undefined;
      const response = scene.utterances.find(({ seq }) => seq > prompt.seq);
      const opponent = experts.find(
        (candidate) =>
          candidate.id !== target?.id && prompt.content.includes(candidate.name)
      );
      const opponentSource = opponent
        ? scene.utterances
            .filter(
              (candidate) =>
                candidate.seq < prompt.seq &&
                candidate.participantId === opponent.id
            )
            .at(-1)
        : undefined;
      const quote = response?.content.match(/“([^”]+)”/u)?.[1];
      const opponentProfile = opponent
        ? profileFor(opponent, scene.topic)
        : undefined;
      const opponentArgument = opponent && opponentSource
        ? argumentForQuotedClaim(opponent, quote) ??
          spokenArgument(opponent, opponentSource.content)
        : undefined;
      const targetArgument = target && response
        ? spokenArgument(target, response.content)
        : undefined;
      const quoteIsDeclared =
        quote === opponentProfile?.stanceClaim ||
        opponentProfile?.arguments.some(({ claim }) => claim === quote);
      return Boolean(
        target &&
          opponent &&
          opponentSource &&
          opponentArgument &&
          quoteIsDeclared &&
          opponentSource.content.includes(quote ?? '') &&
          response?.participantId === target.id &&
          response.replyToParticipantId === opponent.id &&
          targetArgument?.issue === opponentArgument.issue &&
          targetArgument.side !== opponentArgument.side
      );
    });
  mark(
    'bridge-reply-targets-opposing-claim-side',
    hostPrompts.some(({ act }) => act === 'bridge') && bridgeChecks
  );
  const divergenceInsights = scene.insights.filter(
    ({ kind }) => kind === 'divergence'
  );
  const divergenceByIssue = new Map<string, number>();
  const divergenceDataValid = divergenceInsights.every((insight) => {
    const issue = issues.find(({ issue: value }) =>
      insight.content.startsWith(`${value}：`)
    );
    if (!issue) {
      return false;
    }
    divergenceByIssue.set(issue.issue, (divergenceByIssue.get(issue.issue) ?? 0) + 1);
    const expectedContent = `${issue.issue}：${issue.sides.join('；')}`;
    const sides = new Set<string>();
    const stancesValid = insight.stances.every((stance) => {
      const participant = participantById.get(stance.participantId);
      const argument = participant
        ? profileFor(participant, scene.topic)?.arguments.find(
            (candidate) =>
              candidate.issue === issue.issue &&
              candidate.position === stance.position
          )
        : undefined;
      if (argument) {
        sides.add(argument.side);
      }
      return Boolean(argument);
    });
    return (
      insight.content === expectedContent &&
      experts.every(({ name }) => !insight.content.includes(name)) &&
      stancesValid &&
      sides.size === 2
    );
  });
  mark(
    'one-name-free-two-side-divergence-per-issue',
    divergenceDataValid && [...divergenceByIssue.values()].every((count) => count <= 1)
  );
  const consensusInsights = scene.insights.filter(
    ({ kind }) => kind === 'consensus'
  );
  const consensusDataValid = consensusInsights.every((insight) => {
    const participantNames = experts
      .filter(({ name }) => insight.content.includes(name))
      .map(({ name }) => name);
    const validPosition = experts.some((participant) =>
      profileFor(participant, scene.topic)?.arguments.some(({ position }) =>
        insight.content.endsWith(position)
      )
    );
    return (
      participantNames.length === 2 &&
      insight.content.includes('都') &&
      !/[“”]/u.test(insight.content) &&
      validPosition &&
      insight.stances.length >= 2 &&
      insight.stances.every(({ participantId }) => participantById.has(participantId))
    );
  });
  mark(
    'insights-use-grounded-consensus-and-distinct-divergence',
      consensusDataValid &&
      new Set(scene.insights.map(({ content }) => content)).size === scene.insights.length
  );
  const paragraphs = summary
    .split(/\r?\n\s*\r?\n/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const summaryIssueChecks = issues.every((issue) => {
    const block = paragraphs[1]
      ?.split('。')
      .find((sentence) => sentence.startsWith(`${issue.issue}：`));
    if (!block) {
      return false;
    }
    const claims = experts.flatMap((participant) => {
      const profile = profileFor(participant, scene.topic);
      const escapedName = participant.name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
      const claimPattern = new RegExp(`${escapedName}认为“([^”]+)”`, 'gu');
      return [...block.matchAll(claimPattern)].flatMap((match) => {
        const claim = match[1] ?? '';
        const argument = profile?.arguments.find(
          (candidate) =>
            candidate.issue === issue.issue && candidate.claim === claim
        );
        const spoken = byParticipant(participant.id).some(({ content }) =>
          content.includes(claim)
        );
        return argument && spoken ? [{ participant, side: argument.side }] : [];
      });
    });
    return (
      claims.length === 2 &&
      new Set(claims.map(({ participant }) => participant.id)).size === 2 &&
      new Set(claims.map(({ side }) => side)).size === 2 &&
      experts.filter(({ name }) => block.includes(name)).length <= 2
    );
  });
  const summaryClauses = summary
    .split(/[，。；：！？]/u)
    .map((clause) => clause.trim())
    .filter((clause) => Array.from(clause).length >= 4);
  const summaryHasNoDuplicateClauses =
    new Set(summaryClauses).size === summaryClauses.length;
  const summaryHasNoDoubleColon = summary
    .split(/[。！？!?]/u)
    .every((sentence) => (sentence.match(/：/gu) ?? []).length <= 1);
  mark(
    'summary-paragraph-two-uses-opposite-spoken-claims-per-issue',
    paragraphs.length === 2 &&
      paragraphs[0] !== paragraphs[1] &&
      Boolean(paragraphs[0]?.startsWith(`今天的话题是“${scene.topic}”。`)) &&
      summaryIssueChecks
  );
  mark(
    'summary-clauses-unique-and-single-colon',
    summaryHasNoDuplicateClauses && summaryHasNoDoubleColon
  );
  return checks;
}
function assertSceneChecks(scene: FlowScene, checks: Record<string, boolean>) {
  const failures = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  const participants = new Map(
    scene.participants.map(({ id, name }) => [id, name])
  );
  const transcript = scene.utterances
    .map(
      ({ seq, act, participantId, replyToParticipantId, content }) =>
        `${seq} ${act} ${participants.get(participantId)} -> ${participants.get(replyToParticipantId ?? '') ?? '-'}: ${content}`
    )
    .join('\n');
  expect(
    failures,
    `${scene.discussionId}: ${failures.join(', ')}\n${transcript}`
  ).toEqual([]);
}

beforeEach(() => {
  database = createTestDb();
});

afterEach(() => {
  database.close();
});

describe('mock Runner full-flow quality', () => {
  it('programming, service, and general groups complete six fixed-ID discussions', async () => {
    const scenes: FlowScene[] = [];
    let fixedIdIndex = 1;
    for (const topic of Object.values(FLOW_TOPICS)) {
      for (let index = 1; index <= 2; index += 1) {
        const discussionId = `00000000-0000-4000-8000-${String(
          fixedIdIndex
        ).padStart(12, '0')}`;
        fixedIdIndex += 1;
        const scene = await runMockFlow(topic, discussionId);
        scenes.push(scene);
        assertSceneChecks(scene, inspectFlow(scene));
      }
    }
    const interruptCount = scenes.filter((scene) =>
      scene.utterances.some(({ act }) => act === 'interrupt')
    ).length;
    const bridgeCount = scenes.filter((scene) =>
      scene.utterances.some(({ act }) => act === 'bridge')
    ).length;
    const followUpCount = scenes.filter((scene) =>
      scene.utterances.some(({ act }) => act === 'follow_up')
    ).length;
    const inviteCount = scenes.filter((scene) =>
      scene.utterances.some(({ act }) => act === 'invite')
    ).length;
    const checkNames = Object.keys(inspectFlow(scenes[0]!));
    console.info(`MOCK_FLOW_CHECK_NAMES ${checkNames.join(',')}`);
    expect(bridgeCount).toBeGreaterThan(0);
    expect(followUpCount).toBeGreaterThan(0);
    expect(inviteCount).toBeGreaterThan(0);
    expect(
      interruptCount,
      scenes.map((scene) => `${scene.discussionId}:${scene.utterances.some(({ act }) => act === 'interrupt')}`).join(' ')
    ).toBeGreaterThanOrEqual(1);
    console.info(
      `FIXED_MOCK_FLOW_COVERAGE scenes=${scenes.length} bridge=${bridgeCount}/${scenes.length} follow_up=${followUpCount}/${scenes.length} invite=${inviteCount}/${scenes.length} interrupt=${interruptCount}/${scenes.length}`
    );
  }, 120_000);

  const randomRunSetting = process.env.APS_MOCK_FLOW_RANDOM_RUNS;
  const randomRunCount =
    randomRunSetting === undefined ? 0 : Number.parseInt(randomRunSetting, 10);
  if (
    randomRunSetting !== undefined &&
    (!/^\d+$/u.test(randomRunSetting) || randomRunCount < 1)
  ) {
    throw new Error('APS_MOCK_FLOW_RANDOM_RUNS must be a positive integer');
  }
  const randomFlowTest = randomRunCount > 0 ? it : it.skip;
  randomFlowTest(`runs ${randomRunCount} random-ID discussions when enabled`, async () => {
    const topics = Object.values(FLOW_TOPICS);
    const successes = new Map<string, number>();
    const totals = new Map<string, number>();
    let interruptCount = 0;
    let bridgeCount = 0;
    let followUpCount = 0;
    let inviteCount = 0;
    for (let index = 0; index < randomRunCount; index += 1) {
      const scene = await runMockFlow(topics[index % topics.length]!, randomUUID());
      const checks = inspectFlow(scene);
      assertSceneChecks(scene, checks);
      for (const [name, passed] of Object.entries(checks)) {
        totals.set(name, (totals.get(name) ?? 0) + 1);
        if (passed) {
          successes.set(name, (successes.get(name) ?? 0) + 1);
        }
      }
      if (scene.utterances.some(({ act }) => act === 'interrupt')) {
        interruptCount += 1;
      }
      if (scene.utterances.some(({ act }) => act === 'bridge')) bridgeCount += 1;
      if (scene.utterances.some(({ act }) => act === 'follow_up')) followUpCount += 1;
      if (scene.utterances.some(({ act }) => act === 'invite')) inviteCount += 1;
    }
    const rates = [...successes]
      .map(([name, count]) => `${name}=${count}/${totals.get(name)}`)
      .join(' ');
    console.info(
      `RANDOM_MOCK_FLOW_RATES discussions=${randomRunCount} ${rates} bridge=${bridgeCount}/${randomRunCount} follow_up=${followUpCount}/${randomRunCount} invite=${inviteCount}/${randomRunCount} interrupt=${interruptCount}/${randomRunCount}`
    );
    expect(
      [...successes].every(([name, count]) => count === totals.get(name))
    ).toBe(true);
    expect(bridgeCount).toBeGreaterThan(0);
    expect(followUpCount).toBeGreaterThan(0);
    expect(inviteCount).toBeGreaterThan(0);
  }, 120_000);
});
