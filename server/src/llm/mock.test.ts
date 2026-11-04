import { describe, expect, it } from 'vitest';
import { normalizeBid } from '../core/bid';
import { normalizeLineup } from '../core/lineup';
import { parseJsonLoose } from '../core/json';
import { mergeInsights } from '../core/insights';
import {
  buildBidPrompt,
  buildHostPrompt,
  buildInsightsPrompt,
  buildSummaryPrompt,
  buildUtterancePrompt,
  type DiscussionPromptInput,
  type InsightPromptUtterance,
  type PromptRoleCard,
  type PromptRosterEntry
} from '../prompts';
import { createMockProvider, mockStanceRelation } from './mock';
import { MOCK_ISSUE_GROUPS, MOCK_PROFILE_GROUPS } from './mockProfiles';
import type { LLMRequest } from './types';
import { makeTestInsight } from '../test/helpers';

const fuelTopic = '城市是否应该全面禁止燃油车？';
const fuelRoster: PromptRosterEntry[] = [
  {
    alias: 'H',
    name: '林知远',
    profession: '圆桌主持人',
    title: '公共议题主持人',
    stanceTag: '中立',
    stance: '帮助嘉宾把具体条件说清楚。'
  },
  {
    alias: 'E1',
    name: '沈清和',
    profession: '交通规划师',
    title: '城市交通规划研究员',
    stanceTag: '支持',
    stance: '支持分区推进公交优先与慢行改善。'
  },
  {
    alias: 'E2',
    name: '顾南乔',
    profession: '环境政策研究员',
    title: '空气质量评估研究员',
    stanceTag: '反对',
    stance: '反对一刀切禁行，应先评估替代交通供给。'
  },
  {
    alias: 'E3',
    name: '周景行',
    profession: '公共政策研究员',
    title: '交通政策顾问',
    stanceTag: '谨慎',
    stance: '主张按区域与时段评估效果后再逐步调整。'
  },
  {
    alias: 'E4',
    name: '唐知意',
    profession: '能源经济研究员',
    title: '能源转型分析师',
    stanceTag: '支持',
    stance: '支持同步核算出行成本与减排收益。'
  }
];
const fuelAliasMap = {
  H: 'host-id',
  E1: 'expert-1-id',
  E2: 'expert-2-id',
  E3: 'expert-3-id',
  E4: 'expert-4-id'
};
const fuelMockProfileNames: Record<string, string> = {
  E1: '沈清和',
  E2: '林予川',
  E3: '顾南乔',
  E4: '沈清和'
};

function fuelMockProfile(alias: string) {
  const name = fuelMockProfileNames[alias];
  return MOCK_PROFILE_GROUPS.general.find((profile) => profile.name === name);
}

function fuelDiscussion(
  transcriptWindow = '',
  insights: ReturnType<typeof makeTestInsight>[] = []
): DiscussionPromptInput {
  return {
    topic: fuelTopic,
    transcriptWindow,
    insights,
    roster: fuelRoster,
    aliasMap: fuelAliasMap
  };
}

function roleCardFor(alias: string): PromptRoleCard {
  const entry =
    fuelRoster.find((candidate) => candidate.alias === alias) ?? fuelRoster[1]!;
  return {
    name: entry.name,
    profession: entry.profession,
    title: entry.title,
    stance: entry.stance,
    stanceTag: entry.stanceTag,
    persona: `${entry.profession}视角，关注议题中的实际条件。`
  };
}

function utteranceEntry(
  seq: number,
  speakerAlias: string,
  act: InsightPromptUtterance['act'],
  replyToAlias: string | null,
  content: string
): InsightPromptUtterance {
  return { seq, speakerAlias, act, replyToAlias, content };
}

function transcriptLine(entry: InsightPromptUtterance): string {
  const speaker = fuelRoster.find(
    ({ alias }) => alias === entry.speakerAlias
  );
  return `#${entry.seq} ${entry.speakerAlias} ${speaker?.name ?? '未知嘉宾'}（${speaker?.title ?? '身份未提供'}）：${entry.content}`;
}

function request(
  task: LLMRequest['task'],
  context: unknown = {},
  discussionId = 'discussion-test'
): LLMRequest & { model: string } {
  return {
    task,
    system: `完成${task}任务`,
    user: '围绕测试话题开展讨论',
    context,
    discussionId,
    model: task === 'lineup' || task === 'summary' ? 'quality-model' : 'fast-model'
  };
}

function longestCommonSubstringLength(left: string, right: string): number {
  const leftCharacters = Array.from(left);
  const rightCharacters = Array.from(right);
  let previous = Array<number>(rightCharacters.length + 1).fill(0);
  let best = 0;
  for (const leftCharacter of leftCharacters) {
    const current = Array<number>(rightCharacters.length + 1).fill(0);
    for (let index = 1; index <= rightCharacters.length; index += 1) {
      if (leftCharacter === rightCharacters[index - 1]) {
        current[index] = previous[index - 1]! + 1;
        best = Math.max(best, current[index]!);
      }
    }
    previous = current;
  }
  return best;
}

async function simulateMockDiscussion(topic: string, discussionId: string) {
  const provider = createMockProvider({
    latencyMs: 0,
    streamDelayMs: 0
  });
  const complete = async (task: LLMRequest['task'], context: unknown) =>
    provider.complete(request(task, context, discussionId));
  const lineupResult = await complete('lineup', { topic, expertCount: 4 });
  const lineup = normalizeLineup(parseJsonLoose(lineupResult.text), 4);
  const roster: PromptRosterEntry[] = [
    { alias: 'H', ...lineup.host },
    ...lineup.experts.map((expert, index) => ({
      alias: `E${index + 1}`,
      ...expert
    }))
  ];
  const aliasMap = Object.fromEntries(
    roster.map(({ alias }, index) => [alias, `flow-participant-${index}`])
  );
  const history: InsightPromptUtterance[] = [];
  const expertSpeech: Array<{
    alias: string;
    act: InsightPromptUtterance['act'];
    content: string;
  }> = [];
  const hostSpeech: Array<{
    action: string;
    content: string;
  }> = [];
  const allOutputs = [lineupResult.text];
  let seq = 0;
  const transcriptText = () =>
    history
      .map((utterance) => {
        const speaker = roster.find(
          ({ alias }) => alias === utterance.speakerAlias
        );
        return `#${utterance.seq} ${utterance.speakerAlias} ${speaker?.name ?? utterance.speakerAlias}（${speaker?.title ?? '嘉宾'}）：${utterance.content}`;
      })
      .join('\n');
  const card = (alias: string): PromptRoleCard => {
    const entry = roster.find((candidate) => candidate.alias === alias)!;
    return {
      name: entry.name,
      profession: entry.profession,
      title: entry.title,
      stance: entry.stance,
      stanceTag: entry.stanceTag,
      persona: `${entry.profession}视角，重视可核对的具体条件。`
    };
  };
  const discussion = (): DiscussionPromptInput => ({
    topic,
    transcriptWindow: transcriptText(),
    insights: [],
    roster,
    aliasMap
  });
  const record = (
    speakerAlias: string,
    act: InsightPromptUtterance['act'],
    replyToAlias: string | null,
    content: string,
    hostAction?: string
  ) => {
    history.push(
      utteranceEntry(++seq, speakerAlias, act, replyToAlias, content)
    );
    allOutputs.push(content);
    if (speakerAlias === 'H') {
      hostSpeech.push({ action: hostAction ?? 'opening', content });
    } else {
      expertSpeech.push({ alias: speakerAlias, act, content });
    }
  };

  const openingPrompt = buildHostPrompt({
    ...discussion(),
    hostRoleCard: card('H'),
    action: 'opening',
    targetAlias: null
  });
  const opening = await complete('host', openingPrompt.context);
  record('H', 'opening', null, opening.text, 'opening');

  const turns: Array<{
    alias: string;
    act: InsightPromptUtterance['act'];
    replyTo: string | null;
  }> = [
    { alias: 'E1', act: 'statement', replyTo: null },
    { alias: 'E2', act: 'statement', replyTo: null },
    { alias: 'E3', act: 'statement', replyTo: null },
    { alias: 'E4', act: 'statement', replyTo: null },
    { alias: 'E2', act: 'rebut', replyTo: 'E1' },
    { alias: 'E3', act: 'supplement', replyTo: 'E1' },
    { alias: 'E4', act: 'interrupt', replyTo: 'E1' },
    { alias: 'E1', act: 'rebut', replyTo: 'E4' },
    { alias: 'E3', act: 'supplement', replyTo: 'E1' },
    { alias: 'E2', act: 'rebut', replyTo: 'E3' },
    { alias: 'E4', act: 'interrupt', replyTo: 'E2' },
    { alias: 'E1', act: 'supplement', replyTo: 'E3' }
  ];
  for (const [index, turn] of turns.entries()) {
    const prompt = buildUtterancePrompt({
      ...discussion(),
      speakerAlias: turn.alias,
      speaker: card(turn.alias),
      act: turn.act,
      replyToAlias: turn.replyTo
    });
    const response = await complete('utterance', prompt.context);
    record(turn.alias, turn.act, turn.replyTo, response.text);

    const hostAction =
      index === 3 ? 'follow_up' : index === 7 ? 'bridge' : index === 10 ? 'invite' : null;
    if (hostAction) {
      const targetAlias =
        hostAction === 'follow_up'
          ? 'E4'
          : hostAction === 'bridge'
            ? 'E1'
            : 'E2';
      const hostPrompt = buildHostPrompt({
        ...discussion(),
        hostRoleCard: card('H'),
        action: hostAction,
        targetAlias,
        ...(hostAction === 'bridge'
          ? {
              divergence: {
                ref: 'D1',
                content: '任务边界',
                stances: [
                  { speakerAlias: 'E1', position: '先限定适用范围' },
                  { speakerAlias: 'E4', position: '反对只看单一指标' }
                ]
              }
            }
          : {})
      });
      const host = await complete('host', hostPrompt.context);
      record('H', hostAction, targetAlias, host.text, hostAction);
    }
  }

  const insightPrompt = buildInsightsPrompt({
    topic,
    aliasMap,
    roster,
    existingInsights: [],
    transcriptWindow: history.slice(-10),
    newUtterances: history.filter(({ speakerAlias }) => speakerAlias !== 'H')
  });
  const insightResponse = await complete('insights', insightPrompt.context);
  allOutputs.push(insightResponse.text);
  let nextInsightId = 0;
  const merged = mergeInsights([], parseJsonLoose(insightResponse.text), {
    discussionId,
    aliasToParticipantId: Object.fromEntries(
      Object.entries(aliasMap).filter(([alias]) => alias !== 'H')
    ),
    refToInsightId: {},
    validSeqs: new Set(history.map(({ seq: utteranceSeq }) => utteranceSeq)),
    currentSeq: seq,
    now: '2026-06-03T00:00:00.000Z',
    newId: () => `flow-insight-${++nextInsightId}`,
    maxPerKind: 6,
    similarityThreshold: 0.6
  });
  const summaryPrompt = buildSummaryPrompt({
    ...discussion(),
    insights: merged.insights
  });
  const summaryResponse = await complete('summary', summaryPrompt.context);
  allOutputs.push(summaryResponse.text);

  return {
    roster,
    history,
    expertSpeech,
    hostSpeech,
    allOutputs,
    insights: merged.insights,
    summary: summaryResponse.text
  };
}

describe('createMockProvider', () => {
  it('全部话题阵容的每个 profile 都有四条不同论据且通用论据不带行业词', async () => {
    const genericIndustryTerms =
      /程序|编程|开发|代码|软件|客服|服务|用户|消费者|网约车|车辆|交通|行业|产业/u;
    for (const [category, profiles] of Object.entries(MOCK_PROFILE_GROUPS)) {
      expect(profiles).toHaveLength(6);
      const sharedIssues = profiles[0]?.arguments.map(({ issue }) => issue);
      for (const profile of profiles) {
        expect(profile.arguments).toHaveLength(4);
        expect(
          new Set(profile.arguments.map(({ issue }) => issue)).size
        ).toBe(4);
        expect(profile.arguments.map(({ issue }) => issue)).toEqual(
          sharedIssues
        );
        for (const argument of profile.arguments) {
          expect(argument.issue.trim()).not.toBe('');
          expect(Array.from(argument.issue).length).toBeGreaterThanOrEqual(4);
          expect(Array.from(argument.issue).length).toBeLessThanOrEqual(14);
          expect(argument.text.trim()).not.toBe('');
          expect(argument.position.trim()).not.toBe('');
          expect(Array.from(argument.position).length).toBeLessThanOrEqual(20);
          expect(argument.text).not.toMatch(/…/u);
        }
      }
      if (category === 'general') {
        expect(
          profiles
            .flatMap(
              ({ name, profession, title, stance, persona, arguments: points }) => [
              name,
              profession,
              title,
              stance,
              persona,
              ...points.flatMap(({ issue, text, position }) => [
                issue,
                text,
                position
              ])
              ]
            )
            .join('\n')
        ).not.toMatch(genericIndustryTerms);
      }
    }

    const provider = createMockProvider({
      latencyMs: 0,
      streamDelayMs: 0
    });
    const topics = [
      'AI 编程工具会如何改变初级软件工程师的培养？',
      '客服中心应该全面使用 AI 自动回复吗？',
      '城市应该限制网约车数量吗？'
    ];
    for (const [index, topic] of topics.entries()) {
      const response = await provider.complete(
        request(
          'lineup',
          { topic, expertCount: 4 },
          `same-direction-lineup-${index}`
        )
      );
      const lineup = normalizeLineup(parseJsonLoose(response.text), 4);
      const sameDirectionPair = lineup.experts.some((first, firstIndex) =>
        lineup.experts
          .slice(firstIndex + 1)
          .some(
            (second) =>
              mockStanceRelation(first.stanceTag, second.stanceTag) ===
              '方向相同'
          )
      );
      expect(sameDirectionPair).toBe(true);
    }
  });

  it('mock 立场关系与出价 Prompt 对同一批标签给出相同结果', () => {
    const labels = [
      '支持',
      '有条件支持',
      '反对',
      '不支持',
      '中立',
      '观望',
      '谨慎',
      '方向未明'
    ];
    for (const previousTag of labels) {
      for (const currentTag of labels) {
        const roster = fuelRoster.map((entry) =>
          entry.alias === 'E1'
            ? { ...entry, stanceTag: currentTag, stance: `${currentTag}一项安排。` }
            : entry.alias === 'E2'
              ? { ...entry, stanceTag: previousTag, stance: `${previousTag}另一项安排。` }
              : entry
        );
        const previous = roster.find(({ alias }) => alias === 'E2')!;
        const current = roster.find(({ alias }) => alias === 'E1')!;
        const prompt = buildBidPrompt({
          ...fuelDiscussion(),
          roster,
          speakerAlias: 'E1',
          speaker: {
            name: current.name,
            profession: current.profession,
            title: current.title,
            stance: current.stance,
            stanceTag: current.stanceTag,
            persona: ''
          },
          previousUtterance: { seq: 1, speakerAlias: 'E2' }
        });
        const context = prompt.context as {
          previousUtterance?: { relation?: string };
        };
        expect(context.previousUtterance?.relation).toBe(
          mockStanceRelation(previous.stanceTag, current.stanceTag)
        );
      }
    }

  });

  it('相同讨论任务和调用序号生成相同结果', async () => {
    const firstProvider = createMockProvider({
      latencyMs: 0,
      streamDelayMs: 0
    });
    const secondProvider = createMockProvider({
      latencyMs: 0,
      streamDelayMs: 0
    });
    const req = request('utterance', { turnIndex: 3 });

    const firstCall = await firstProvider.complete(req);
    const secondCall = await firstProvider.complete(req);
    const firstCallAgain = await secondProvider.complete(req);
    const secondCallAgain = await secondProvider.complete(req);

    expect(firstCallAgain).toEqual(firstCall);
    expect(secondCallAgain).toEqual(secondCall);
  });

  it('生成二至六名专家且阵容输出可解析并通过规范化', async () => {
    const provider = createMockProvider({
      latencyMs: 0,
      streamDelayMs: 0
    });

    for (let expertCount = 2; expertCount <= 6; expertCount += 1) {
      const result = await provider.complete(
        request('lineup', {
          topic: '企业客服中的 AI 助手',
          expertCount
        })
      );
      const raw = parseJsonLoose(result.text);
      const lineup = normalizeLineup(raw, expertCount);

      expect(lineup.experts).toHaveLength(expertCount);
    }
  });

  it('出价任务输出可被规范化为合法出价', async () => {
    const provider = createMockProvider({
      latencyMs: 0,
      streamDelayMs: 0
    });
    const ctx = {
      selfId: 'participant-e1',
      aliasToParticipantId: {
        H: 'participant-host',
        E1: 'participant-e1',
        E2: 'participant-e2'
      }
    };
    const result = await provider.complete(
      request('bid', {
        speakerAlias: 'E1',
        aliasMap: { H: '主持人', E1: '周明', E2: '陈澄' },
        recentTranscript: [
          '#4 E2 陈澄（用户研究负责人）：复杂问题需要人工升级。'
        ]
      })
    );
    const normalized = normalizeBid(parseJsonLoose(result.text), ctx);

    expect(normalized.participantId).toBe(ctx.selfId);
    expect(normalized.urgency).toBeGreaterThanOrEqual(0);
    expect(normalized.urgency).toBeLessThanOrEqual(1);
  });

  it('“换一批”会更换专家姓名并保持多样立场', async () => {
    const provider = createMockProvider({
      latencyMs: 0,
      streamDelayMs: 0
    });
    const first = normalizeLineup(
      parseJsonLoose(
        (
          await provider.complete(
            request(
              'lineup',
              { topic: fuelTopic, expertCount: 4 },
              'lineup-refresh'
            )
          )
        ).text
      ),
      4
    );
    const second = normalizeLineup(
      parseJsonLoose(
        (
          await provider.complete(
            request(
              'lineup',
              { topic: fuelTopic, expertCount: 4 },
              'lineup-refresh'
            )
          )
        ).text
      ),
      4
    );
    const firstNames = new Set(first.experts.map(({ name }) => name));
    const secondNames = new Set(second.experts.map(({ name }) => name));

    expect([...firstNames].some((name) => secondNames.has(name))).toBe(false);
    expect(new Set(second.experts.map(({ stanceTag }) => stanceTag)).size).toBeGreaterThanOrEqual(3);
    expect(second.experts.some(({ stanceTag }) => /支持/u.test(stanceTag))).toBe(true);
    expect(second.experts.some(({ stanceTag }) => /反对/u.test(stanceTag))).toBe(true);
  });

  it('不同讨论首批阵容大多不同且六人阵容的姓名组成不重复', async () => {
    const provider = createMockProvider({
      latencyMs: 0,
      streamDelayMs: 0
    });
    const getLineup = async (discussionId: string, expertCount: number) =>
      normalizeLineup(
        parseJsonLoose(
          (
            await provider.complete(
              request(
                'lineup',
                { topic: fuelTopic, expertCount },
                discussionId
              )
            )
          ).text
        ),
        expertCount
      );
    const first = await getLineup('seed-discussion-one', 4);
    const second = await getLineup('seed-discussion-two', 4);
    const firstNames = new Set([
      first.host.name,
      ...first.experts.map(({ name }) => name)
    ]);
    const secondNames = new Set([
      second.host.name,
      ...second.experts.map(({ name }) => name)
    ]);
    const largeLineup = await getLineup('six-expert-lineup', 6);
    const surnames = largeLineup.experts.map(({ name }) => Array.from(name)[0]);
    const givenNames = largeLineup.experts.map(({ name }) =>
      Array.from(name).slice(1).join('')
    );
    const hostSurname = Array.from(largeLineup.host.name)[0];

    expect([...firstNames].filter((name) => secondNames.has(name)).length).toBeLessThanOrEqual(1);
    expect(new Set(surnames).size).toBe(6);
    expect(new Set(givenNames).size).toBe(6);
    expect(surnames).not.toContain(hostSurname);
  });

  it('所有发言与主持模板均以自然语序组合五种立场且不截断', async () => {
    const badGrammar =
      /(?:看重|提醒|强调|认为|主张|关注|指出|觉得)(?:反对|支持|担心|担忧|警惕|质疑|主张|认为|有条件)|看看似|吗[。，；]|[。！？!?][，；：]/u;
    const stanceVariants = [
      '支持小范围试点。',
      '有条件支持，前提是明确责任边界。',
      '担心通勤成本增加。',
      '认为效果取决于配套安排。',
      '反对仓促全面推进。'
    ];
    const acts = ['statement', 'rebut', 'supplement', 'interrupt'] as const;
    const hostActions = [
      'opening',
      'follow_up',
      'bridge',
      'invite',
      'closing'
    ] as const;
    const interruptTargetProfile = fuelMockProfile('E2')!;
    const outputs: string[] = [];
    const rebutOutputs: string[] = [];
    const interruptOutputs: string[] = [];

    for (const [stanceIndex, stance] of stanceVariants.entries()) {
      const roster = fuelRoster.map((entry) => {
        if (entry.alias === 'E1') {
          return { ...entry, stance };
        }
        if (entry.alias === 'E2') {
          return {
            ...entry,
            name: interruptTargetProfile.name,
            profession: interruptTargetProfile.profession,
            title: interruptTargetProfile.title,
            stanceTag: interruptTargetProfile.stanceTag,
            stance: interruptTargetProfile.stance
          };
        }
        return entry;
      });
      for (const act of acts) {
        const provider = createMockProvider({
          latencyMs: 0,
          streamDelayMs: 0
        });
        for (let index = 0; index < 6; index += 1) {
          const result = await provider.complete(
            request(
              'utterance',
              {
                topic: fuelTopic,
                roster,
                speakerAlias: 'E1',
                speaker: { ...roleCardFor('E1'), stance },
                act,
                replyToAlias: 'E2',
                transcriptWindow: [
                  utteranceEntry(
                    1,
                    'E2',
                    'statement',
                    null,
                    interruptTargetProfile.stance
                  )
                ]
              },
              `grammar-act-${stanceIndex}-${act}`
            )
          );
          outputs.push(result.text);
          if (act === 'rebut') {
            rebutOutputs.push(result.text);
          }
          if (act === 'interrupt') {
            interruptOutputs.push(result.text);
          }
        }
      }
      for (const action of hostActions) {
        const provider = createMockProvider({
          latencyMs: 0,
          streamDelayMs: 0
        });
        for (let index = 0; index < 4; index += 1) {
          const result = await provider.complete(
            request(
              'host',
              {
                topic: fuelTopic,
                roster,
                action,
                targetAlias: 'E2',
                divergence: {
                  ref: 'D1',
                  content: '替代交通供给',
                  stances: [
                    { speakerAlias: 'E1', position: stance },
                    {
                      speakerAlias: 'E2',
                      position: interruptTargetProfile.stance
                    }
                  ]
                },
                transcriptWindow: [
                  utteranceEntry(
                    1,
                    'E2',
                    'statement',
                    null,
                    interruptTargetProfile.stance
                  )
                ]
              },
              `grammar-host-${stanceIndex}-${action}`
            )
          );
          outputs.push(result.text);
        }
      }
    }

    for (const text of outputs) {
      expect(text).not.toMatch(badGrammar);
      expect(text).not.toContain('…');
      for (const profile of Object.values(MOCK_PROFILE_GROUPS).flat()) {
        for (const argument of profile.arguments) {
          const offset = text.indexOf(argument.text);
          if (offset < 0) {
            continue;
          }
          const prefix = text.slice(0, offset);
          expect(
            offset === 0 ||
              /[：，。；]$/u.test(prefix) ||
              /(?:但|可是|不过|而且|因为|所以|其实|毕竟|另外|同时)$/u.test(
                prefix
              )
          ).toBe(true);
        }
      }
    }
    for (const text of rebutOutputs) {
      expect(text).toMatch(
        /不同意|不赞同|不赞成|不认同|我反对|反对|不能认同|不充分|有异议/u
      );
    }
    expect(interruptOutputs).toHaveLength(stanceVariants.length * 6);
    for (const text of interruptOutputs) {
      expect(text).toContain(interruptTargetProfile.name);
      expect(text).toContain(`“${interruptTargetProfile.stanceClaim}”`);
      expect(text).toMatch(/不同意|不赞同|不赞成|不认同|我反对|反对|不能认同|不充分|有异议/u);
    }
    for (const stance of stanceVariants) {
      for (const text of outputs.filter((output) => output.includes(stance))) {
        expect(text.slice(0, text.indexOf(stance)).endsWith('我')).toBe(true);
      }
    }

    const longTopic =
      '城市是否应该全面禁止燃油车，这项政策需要怎样评估公共交通替代方案？';
    const shortTopic = '在调整公交线路时，怎样评估通勤需求？';
    const getOpening = async (topic: string, discussionId: string) => {
      const prompt = buildHostPrompt({
        ...fuelDiscussion(),
        topic,
        hostRoleCard: roleCardFor('H'),
        action: 'opening',
        targetAlias: null
      });
      return (
        await createMockProvider({
          latencyMs: 0,
          streamDelayMs: 0
        }).complete(request('host', prompt.context, discussionId))
      ).text;
    };
    const longOpening = await getOpening(longTopic, 'long-topic-clause');
    const shortOpening = await getOpening(shortTopic, 'short-topic-whole');
    expect(longOpening).toContain(`“${longTopic}”`);
    expect(shortOpening).toContain(`“${shortTopic}”`);
  });

  it('引用只使用此前说过的安全主张且避免双重否定', async () => {
    const topic = 'AI 编程工具会如何改变初级软件工程师的培养？';
    const targetProfile = MOCK_PROFILE_GROUPS.programming.find(
      ({ name }) => name === '唐宁'
    )!;
    const speakerProfile = MOCK_PROFILE_GROUPS.programming.find(
      ({ name }) => name === '陈澄'
    )!;
    const roster: PromptRosterEntry[] = [
      fuelRoster[0]!,
      { alias: 'E1', ...targetProfile },
      { alias: 'E2', ...speakerProfile }
    ];
    const prompt = buildUtterancePrompt({
      topic,
      transcriptWindow: [
        utteranceEntry(
          1,
          'E1',
          'statement',
          null,
          `我${targetProfile.stanceClaim}。`
        )
      ]
        .map((entry) =>
          `#${entry.seq} E1 ${targetProfile.name}（${targetProfile.title}）：${entry.content}`
        )
        .join('\n'),
      insights: [],
      roster,
      aliasMap: fuelAliasMap,
      speakerAlias: 'E2',
      speaker: {
        name: speakerProfile.name,
        profession: speakerProfile.profession,
        title: speakerProfile.title,
        stance: speakerProfile.stance,
        stanceTag: speakerProfile.stanceTag,
        persona: speakerProfile.persona
      },
      act: 'rebut',
      replyToAlias: 'E1'
    });
    const result = await createMockProvider({
      latencyMs: 0,
      streamDelayMs: 0
    }).complete(request('utterance', prompt.context, 'safe-claim-reference'));
    const doubleNegative =
      /(?:不同意|不认同|不赞成|不能认同)[^。；：]{0,32}(?:反对|担心|担忧|不支持|不赞成|不认同)/u;
    const quote = result.text.match(/“([^”]*)”/u)?.[1];

    expect(result.text).toContain(
      `唐宁刚才说“${targetProfile.stanceClaim}”`
    );
    expect(quote).toBe(targetProfile.stanceClaim);
    expect(Array.from(quote ?? '').length).toBeGreaterThanOrEqual(4);
    expect(Array.from(quote ?? '').length).toBeLessThanOrEqual(20);
    expect(result.text).not.toMatch(doubleNegative);
    expect(result.text).not.toContain('提到“');
  });

  it('不能识别为既有主张的内容不加引号', async () => {
    const profile = MOCK_PROFILE_GROUPS.general[0]!;
    const roster: PromptRosterEntry[] = [
      fuelRoster[0]!,
      { alias: 'E1', ...profile },
      { alias: 'E2', ...MOCK_PROFILE_GROUPS.general[1]! }
    ];
    const prompt = buildUtterancePrompt({
      topic: fuelTopic,
      transcriptWindow:
        `#1 E1 ${profile.name}（${profile.title}）：我有一个新判断，需要先看现场变化。`,
      insights: [],
      roster,
      aliasMap: fuelAliasMap,
      speakerAlias: 'E2',
      speaker: {
        name: MOCK_PROFILE_GROUPS.general[1]!.name,
        profession: MOCK_PROFILE_GROUPS.general[1]!.profession,
        title: MOCK_PROFILE_GROUPS.general[1]!.title,
        stance: MOCK_PROFILE_GROUPS.general[1]!.stance,
        stanceTag: MOCK_PROFILE_GROUPS.general[1]!.stanceTag,
        persona: MOCK_PROFILE_GROUPS.general[1]!.persona
      },
      act: 'rebut',
      replyToAlias: 'E1'
    });
    const result = await createMockProvider({
      latencyMs: 0,
      streamDelayMs: 0
    }).complete(request('utterance', prompt.context, 'unclaimed-reference'));

    expect(result.text).not.toMatch(/“[^”]+”/u);
    expect(result.text).toContain(`${profile.name}刚才的判断`);
  });

  it('不同 act 的六个发言模板在同一讨论内轮完前不重复', async () => {
    const provider = createMockProvider({
      latencyMs: 0,
      streamDelayMs: 0
    });
    const acts = ['statement', 'rebut', 'supplement', 'interrupt'] as const;
    const outputs = new Map<(typeof acts)[number], string[]>();
    let transcript = transcriptLine(
      utteranceEntry(
        1,
        'E2',
        'statement',
        null,
        '应先核算公共交通能否承接现有出行。'
      )
    );

    for (const act of acts) {
      outputs.set(act, []);
    }
    for (let index = 0; index < 24; index += 1) {
      const act = acts[index % acts.length]!;
      const speakerAlias = index % 2 === 0 ? 'E1' : 'E4';
      const prompt = buildUtterancePrompt({
        ...fuelDiscussion(transcript),
        speakerAlias,
        speaker: roleCardFor(speakerAlias),
        act,
        replyToAlias: 'E2'
      });
      const result = await provider.complete(
        request('utterance', prompt.context, 'utterance-templates')
      );
      outputs.get(act)?.push(result.text);
      transcript += `\n${transcriptLine(
        utteranceEntry(index + 2, speakerAlias, act, 'E2', result.text)
      )}`;
    }

    for (const act of acts) {
      const actOutputs = outputs.get(act) ?? [];
      expect(actOutputs).toHaveLength(6);
      expect(new Set(actOutputs).size).toBe(6);
    }
  });

  it('同一讨论连续十二次发言无重复且燃油车话题不引入编程领域词汇', async () => {
    const provider = createMockProvider({
      latencyMs: 0,
      streamDelayMs: 0
    });
    const acts = ['statement', 'rebut', 'supplement', 'interrupt'] as const;
    const outputs: string[] = [];
    let transcript = transcriptLine(
      utteranceEntry(
        1,
        'E2',
        'statement',
        null,
        '应先核算公交替代线路。'
      )
    );

    for (let index = 0; index < 12; index += 1) {
      const speakerAlias = `E${(index % 4) + 1}`;
      const prompt = buildUtterancePrompt({
        ...fuelDiscussion(transcript),
        speakerAlias,
        speaker: roleCardFor(speakerAlias),
        act: acts[index % acts.length]!,
        replyToAlias: 'E2'
      });
      const result = await provider.complete(
        request('utterance', prompt.context, 'utterance-twelve')
      );
      outputs.push(result.text);
      transcript += `\n${transcriptLine(
        utteranceEntry(
          index + 2,
          speakerAlias,
          acts[index % acts.length]!,
          'E2',
          result.text
        )
      )}`;
    }

    expect(new Set(outputs).size).toBe(12);
    expect(outputs.join('\n')).not.toMatch(/新人|岗位|编程|代码/u);
  });

  it('出价读取立场关系、控制发言密度并遵守点名与刚发言规则', async () => {
    const provider = createMockProvider({
      latencyMs: 0,
      streamDelayMs: 0
    });
    const makeBid = async (
      speakerAlias: string,
      previousAlias: string,
      discussionId: string,
      addressed = false,
      priorRebut = false
    ) => {
      if (priorRebut) {
        const priorPrompt = buildUtterancePrompt({
          ...fuelDiscussion(),
          speakerAlias: 'E2',
          speaker: roleCardFor('E2'),
          act: 'rebut',
          replyToAlias: 'E1'
        });
        await provider.complete(
          request('utterance', priorPrompt.context, discussionId)
        );
      }
      const previous = fuelRoster.find(
        ({ alias }) => alias === previousAlias
      );
      const previousArgument = fuelMockProfile(previousAlias)?.arguments[0];
      const transcript = previous
        ? `#7 ${previousAlias} ${previous.name}（${previous.title}）：${previousArgument?.claim ?? '先核算具体条件'}。`
        : '';
      const prompt = buildBidPrompt({
        ...fuelDiscussion(transcript),
        speakerAlias,
        speaker: roleCardFor(speakerAlias),
        previousUtterance: { seq: 7, speakerAlias: previousAlias },
        addressed
      });
      const result = await provider.complete(
        request('bid', prompt.context, discussionId)
      );
      return parseJsonLoose(result.text) as {
        wantToSpeak: boolean;
        intent: string;
        urgency: number;
        replyTo: string | null;
        focus: string | null;
      };
    };

    const differentStance = await makeBid('E1', 'E2', 'bid-different');
    const sameStance = await makeBid('E1', 'E4', 'bid-same');
    const cautiousAgainstSupport = await makeBid('E1', 'E3', 'bid-cautious');
    const hostRelation = await makeBid('E1', 'H', 'bid-host');
    const justSpoke = await makeBid('E1', 'E1', 'bid-just-spoke');
    const addressed = await makeBid('E1', 'E1', 'bid-addressed', true);

    expect(['rebut', 'interrupt']).toContain(differentStance.intent);
    expect(sameStance.intent).toBe('supplement');
    expect(['supplement', 'rebut']).toContain(cautiousAgainstSupport.intent);
    expect(hostRelation.intent).toBe('raise_hand');
    expect(justSpoke.wantToSpeak).toBe(false);
    expect(justSpoke.urgency).toBeLessThanOrEqual(0.5);
    expect(justSpoke.intent).not.toBe('interrupt');
    expect(addressed.wantToSpeak).toBe(true);
    expect(addressed.urgency).toBeGreaterThanOrEqual(0.85);

    const perRoundCounts: number[] = [];
    const intentsBySeat = new Map(
      Array.from({ length: 4 }, (_, index) => [`E${index + 1}`, [] as string[]])
    );
    for (let turn = 0; turn < 8; turn += 1) {
      let wants = 0;
      for (let seat = 1; seat <= 4; seat += 1) {
        const speakerAlias = `E${seat}`;
        const previousAlias =
          turn % 3 === 0
            ? 'H'
            : turn % 3 === 1
              ? speakerAlias === 'E1'
                ? 'E4'
                : speakerAlias === 'E4'
                  ? 'E1'
                  : speakerAlias
              : speakerAlias === 'E2'
                ? 'E1'
                : 'E2';
        const bid = await makeBid(
          speakerAlias,
          previousAlias,
          'bid-density'
        );
        expect(bid.focus).not.toContain('…');
        expect(Array.from(bid.focus ?? '').length).toBeLessThanOrEqual(20);
        if (!bid.wantToSpeak) {
          expect(bid.urgency).toBeLessThanOrEqual(0.5);
          expect(bid.intent).not.toBe('interrupt');
        }
        if (bid.replyTo && bid.replyTo !== 'H') {
          expect(bid.focus).toContain(
            fuelRoster.find(({ alias }) => alias === bid.replyTo)?.name
          );
        }
        intentsBySeat.get(speakerAlias)?.push(bid.intent);
        if (bid.wantToSpeak) {
          wants += 1;
        }
      }
      perRoundCounts.push(wants);
    }
    expect(perRoundCounts.some((count) => count <= 2)).toBe(true);
    expect(new Set(perRoundCounts).size).toBeGreaterThan(1);
    expect(
      perRoundCounts.reduce((total, count) => total + count, 0) / 8
    ).toBeGreaterThanOrEqual(1);
    expect(
      perRoundCounts.reduce((total, count) => total + count, 0) / 8
    ).toBeLessThanOrEqual(3);
    expect(
      [...intentsBySeat.values()].every(
        (intents) => new Set(intents).size > 1
      )
    ).toBe(true);

    const interruptResults = await Promise.all(
      Array.from({ length: 24 }, (_, index) =>
        makeBid('E1', 'E2', `bid-interrupt-${index}`, false, true)
      )
    );
    const interruptBids = interruptResults.filter(
      ({ intent }) => intent === 'interrupt'
    );
    expect(interruptBids.length).toBeGreaterThanOrEqual(4);
    expect(interruptBids.every(({ urgency }) => urgency >= 0.85)).toBe(true);
  });

  it('主持开场点全 roster，follow_up 与 invite 指向 targetAlias', async () => {
    const provider = createMockProvider({
      latencyMs: 0,
      streamDelayMs: 0
    });
    const openingPrompt = buildHostPrompt({
      ...fuelDiscussion(),
      hostRoleCard: roleCardFor('H'),
      action: 'opening',
      targetAlias: null
    });
    const openings: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      openings.push(
        (
          await provider.complete(
            request('host', openingPrompt.context, 'host-roster')
          )
        ).text
      );
    }
    for (const opening of openings) {
      expect(opening).toContain(`“${fuelTopic}”`);
      for (const guest of fuelRoster.filter(({ alias }) => alias !== 'H')) {
        expect(opening).toContain(guest.name);
        expect(opening).toContain(guest.profession);
        const escapedName = guest.name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
        expect(opening).not.toMatch(
          new RegExp(
            `(?:先请|先由|先让)${escapedName}|${escapedName}(?:先从|先说|先谈|先发言)`,
            'u'
          )
        );
      }
      expect(opening).toMatch(/请各位/u);
      expect(opening).not.toMatch(/先从第一位嘉宾/u);
      expect(opening).not.toContain('今天的讨论先到这里');
    }

    const targetProfile = MOCK_PROFILE_GROUPS.general.find(
      ({ name }) => name === '顾南乔'
    )!;
    const hostRoster = fuelRoster.map((entry) =>
      entry.alias === 'E2'
        ? { alias: 'E2', ...targetProfile }
        : entry
    );
    const transcript =
      `#1 E2 ${targetProfile.name}（${targetProfile.title}）：我${targetProfile.stanceClaim}。`;
    const followPrompt = buildHostPrompt({
      ...fuelDiscussion(transcript),
      roster: hostRoster,
      hostRoleCard: roleCardFor('H'),
      action: 'follow_up',
      targetAlias: 'E2'
    });
    const followUp = await provider.complete(
      request('host', followPrompt.context, 'host-target')
    );
    expect(followUp.text).toContain('顾南乔');
    expect(followUp.text).toMatch(/例子|证据|条件|记录/u);
    expect(followUp.text).toContain('刚才');
    expect(followUp.text).not.toMatch(/^沈清和/u);

    const invitePrompt = buildHostPrompt({
      ...fuelDiscussion(transcript),
      roster: hostRoster,
      hostRoleCard: roleCardFor('H'),
      action: 'invite',
      targetAlias: 'E3'
    });
    const invite = await provider.complete(
      request('host', invitePrompt.context, 'host-target')
    );
    expect(invite.text).toContain('周景行');
    expect(invite.text).toContain('公共政策研究员');

    const issue = MOCK_ISSUE_GROUPS.general[0]!;
    const bridgePrompt = buildHostPrompt({
      ...fuelDiscussion(transcript),
      roster: hostRoster,
      hostRoleCard: roleCardFor('H'),
      action: 'bridge',
      targetAlias: 'E2',
      divergence: {
        ref: 'D1',
        content: issue.issue,
        stances: [
          { speakerAlias: 'E1', position: issue.sides[0] },
          { speakerAlias: 'E2', position: issue.sides[1] }
        ]
      }
    });
    const bridge = await provider.complete(
      request('host', bridgePrompt.context, 'host-bridge')
    );
    expect(bridge.text).toContain('沈清和');
    expect(bridge.text).toContain(issue.sides[0]);
    expect(bridge.text).toContain('顾南乔');
    expect(bridge.text).toContain(issue.sides[1]);
  });

  it('主持追问引用主张而非“我的判断不同”等元话语', async () => {
    const provider = createMockProvider({
      latencyMs: 0,
      streamDelayMs: 0
    });
    const generalProfile = MOCK_PROFILE_GROUPS.general[0]!;
    const generalRoster: PromptRosterEntry[] = [
      {
        alias: 'H',
        name: '林知远',
        profession: '圆桌主持人',
        title: '公共议题主持人',
        stanceTag: '中立',
        stance: '帮助嘉宾把具体条件说清楚。'
      },
      {
        alias: 'E1',
        name: generalProfile.name,
        profession: generalProfile.profession,
        title: generalProfile.title,
        stanceTag: generalProfile.stanceTag,
        stance: generalProfile.stance
      }
    ];
    const source = `我先说明判断：${generalProfile.stanceClaim}。`;
    const hostPrompt = buildHostPrompt({
      topic: '城市应该限制网约车数量吗？',
      transcriptWindow: `#1 E1 ${generalProfile.name}（${generalProfile.title}）：${source}`,
      insights: [],
      roster: generalRoster,
      aliasMap: { H: 'host-id', E1: 'expert-1-id' },
      hostRoleCard: {
        name: '林知远',
        profession: '圆桌主持人',
        title: '公共议题主持人',
        stanceTag: '中立',
        stance: '帮助嘉宾把具体条件说清楚。',
        persona: '把专家观点转成可核对的问题。'
      },
      action: 'follow_up',
      targetAlias: 'E1'
    });
    const followUp = await provider.complete(
      request('host', hostPrompt.context, 'host-specific-claim')
    );

    expect(followUp.text).toContain(
      `沈清和刚才说“${generalProfile.stanceClaim}”`
    );
    expect(followUp.text).not.toContain('我的判断不同');
    expect(followUp.text).toMatch(/条件/u);
  });

  it('主持人的每种动作在同一讨论内各有四个不重复模板', async () => {
    const provider = createMockProvider({
      latencyMs: 0,
      streamDelayMs: 0
    });
    const actions = [
      'opening',
      'follow_up',
      'bridge',
      'invite',
      'closing'
    ] as const;
    const transcript = transcriptLine(
      utteranceEntry(
        1,
        'E1',
        'statement',
        null,
        '先核算公交替代线路的覆盖范围。'
      )
    );

    for (const action of actions) {
      const outputs: string[] = [];
      for (let index = 0; index < 4; index += 1) {
        const prompt = buildHostPrompt({
          ...fuelDiscussion(transcript),
          hostRoleCard: roleCardFor('H'),
          action,
          targetAlias: 'E2',
          ...(action === 'bridge'
            ? {
                divergence: {
                  ref: 'D1',
                  content: '禁行范围与公交替代条件',
                  stances: [
                    { speakerAlias: 'E1', position: '支持分区推进' },
                    { speakerAlias: 'E2', position: '反对一刀切' }
                  ]
                }
              }
            : {})
        });
        const result = await provider.complete(
          request('host', prompt.context, 'host-template-pools')
        );
        outputs.push(result.text);
      }
      expect(new Set(outputs).size).toBe(4);
    }
  });

  it('洞察按论据 side 提炼双侧分歧与同侧共识并引用真实序号', async () => {
    const provider = createMockProvider({
      latencyMs: 0,
      streamDelayMs: 0
    });
    const profile = (name: string) =>
      MOCK_PROFILE_GROUPS.general.find((entry) => entry.name === name)!;
    const firstProfile = profile('沈清和');
    const opposingProfile = profile('顾南乔');
    const agreeingProfile = profile('周景行');
    const issue = MOCK_ISSUE_GROUPS.general[0]!;
    const roster: PromptRosterEntry[] = [
      { alias: 'E1', ...firstProfile },
      { alias: 'E2', ...opposingProfile },
      { alias: 'E3', ...agreeingProfile }
    ];
    const firstClaim = firstProfile.arguments[0]!.claim;
    const opposingClaim = opposingProfile.arguments[0]!.claim;
    const agreeingClaim = agreeingProfile.arguments[0]!.claim;
    const context = {
      topic: fuelTopic,
      roster,
      existingInsightsText:
        `D1 分歧：${issue.issue}：${issue.sides.join('；')}`,
      transcriptWindow: [
        utteranceEntry(1, 'E1', 'statement', null, `${firstClaim}。`),
        utteranceEntry(2, 'E2', 'statement', null, `${opposingClaim}。`)
      ],
      newUtterances: [
        utteranceEntry(3, 'E2', 'rebut', 'E1', `${opposingClaim}。`),
        utteranceEntry(4, 'E3', 'supplement', 'E1', `${agreeingClaim}。`)
      ]
    };
    const result = await provider.complete(request('insights', context));
    const patch = parseJsonLoose(result.text) as {
      consensus?: Array<{
        content: string;
        participants: string[];
        evidence: number[];
      }>;
      divergences?: Array<{
        ref: string | null;
        content: string;
        stances: Array<{ who: string; position: string }>;
        evidence: number[];
      }>;
    };
    const divergence = patch.divergences?.[0];
    const consensus = patch.consensus?.[0];

    expect(patch.divergences).toHaveLength(1);
    expect(divergence).toEqual({
      ref: 'D1',
      content: `${issue.issue}：${issue.sides.join('；')}`,
      stances: [
        { who: 'E1', position: firstProfile.arguments[0]!.position },
        { who: 'E2', position: opposingProfile.arguments[0]!.position }
      ],
      evidence: [1, 3],
      resolved: false
    });
    expect(consensus).toEqual({
      ref: null,
      content: `沈清和与周景行都${firstProfile.arguments[0]!.position}`,
      participants: ['E1', 'E3'],
      evidence: [1, 4]
    });
  });

  it('同一议题反向交锋沿用同一 divergence ref 并更新而不新建', async () => {
    const provider = createMockProvider({
      latencyMs: 0,
      streamDelayMs: 0
    });
    const firstProfile = MOCK_PROFILE_GROUPS.general.find(
      ({ name }) => name === '沈清和'
    )!;
    const secondProfile = MOCK_PROFILE_GROUPS.general.find(
      ({ name }) => name === '顾南乔'
    )!;
    const issue = MOCK_ISSUE_GROUPS.general[0]!;
    const firstClaim = firstProfile.arguments[0]!.claim;
    const secondClaim = secondProfile.arguments[0]!.claim;
    const context = {
      topic: fuelTopic,
      roster: [
        { alias: 'E1', ...firstProfile },
        { alias: 'E2', ...secondProfile }
      ],
      existingInsightsText:
        `D1 分歧：${issue.issue}：${issue.sides.join('；')}`,
      transcriptWindow: [
        utteranceEntry(1, 'E1', 'statement', null, `${firstClaim}。`),
        utteranceEntry(2, 'E2', 'statement', null, `${secondClaim}。`)
      ],
      newUtterances: [
        utteranceEntry(3, 'E1', 'rebut', 'E2', `${firstClaim}。`),
        utteranceEntry(4, 'E2', 'rebut', 'E1', `${secondClaim}。`)
      ]
    };
    const response = await provider.complete(
      request('insights', context, 'same-pair-reversed')
    );
    const result = parseJsonLoose(response.text) as {
      divergences: Array<{
        ref: string;
        content: string;
        stances: Array<{ who: string }>;
        evidence: number[];
      }>;
    };

    expect(result.divergences).toHaveLength(1);
    expect(result.divergences[0]?.ref).toBe('D1');
    expect(result.divergences[0]?.content).toBe(
      `${issue.issue}：${issue.sides.join('；')}`
    );
    expect(result.divergences[0]?.evidence).toEqual([3, 4]);
    expect(
      new Set(result.divergences[0]?.stances.map(({ who }) => who))
    ).toEqual(new Set(['E1', 'E2']));
  });

  it('不把跨议题的反驳误报为该来源议题的分歧', async () => {
    const provider = createMockProvider({
      latencyMs: 0,
      streamDelayMs: 0
    });
    const [firstProfile, secondProfile] = MOCK_PROFILE_GROUPS.programming;
    const roster = [
      { alias: 'E1', ...firstProfile! },
      { alias: 'E2', ...secondProfile! }
    ];
    const prompt = buildInsightsPrompt({
      topic: 'AI 编程工具会如何改变初级软件工程师的培养？',
      aliasMap: { H: 'host-id', E1: 'expert-1-id', E2: 'expert-2-id' },
      roster,
      existingInsights: [],
      transcriptWindow: [
        utteranceEntry(
          1,
          'E1',
          'statement',
          null,
          `${firstProfile!.arguments[0]!.claim}。`
        )
      ],
      newUtterances: [
        utteranceEntry(
          2,
          'E2',
          'rebut',
          'E1',
          `${secondProfile!.arguments[1]!.claim}。`
        )
      ]
    });
    const response = await provider.complete(
      request('insights', prompt.context, 'cross-issue-rebuttal')
    );
    const result = parseJsonLoose(response.text) as {
      divergences: Array<{ content: string }>;
    };

    expect(result.divergences).toEqual([]);
  });

  it('洞察内容严格使用双侧议题定义与已声明立场', async () => {
    const provider = createMockProvider({
      latencyMs: 0,
      streamDelayMs: 0
    });
    const profile = (name: string) =>
      MOCK_PROFILE_GROUPS.general.find((entry) => entry.name === name)!;
    const firstProfile = profile('沈清和');
    const opposingProfile = profile('顾南乔');
    const agreeingProfile = profile('周景行');
    const issue = MOCK_ISSUE_GROUPS.general[0]!;
    const window = [
      utteranceEntry(2, 'E1', 'statement', null, `${firstProfile.arguments[0]!.claim}。`),
      utteranceEntry(3, 'E2', 'statement', null, `${opposingProfile.arguments[0]!.claim}。`),
      utteranceEntry(4, 'E2', 'rebut', 'E1', `${opposingProfile.arguments[0]!.claim}。`),
      utteranceEntry(5, 'E3', 'supplement', 'E1', `${agreeingProfile.arguments[0]!.claim}。`)
    ];
    const existing = makeTestInsight({
      id: 'existing-divergence',
      discussionId: 'insight-context',
      kind: 'divergence',
      content: `${issue.issue}：${issue.sides.join('；')}`,
      stances: [
        { participantId: fuelAliasMap.E1, position: firstProfile.arguments[0]!.position },
        { participantId: fuelAliasMap.E2, position: opposingProfile.arguments[0]!.position }
      ],
      evidenceSeqs: [2, 3],
      updatedAtSeq: 3
    });
    const prompt = buildInsightsPrompt({
      topic: fuelTopic,
      aliasMap: fuelAliasMap,
      roster: [
        { alias: 'E1', ...firstProfile },
        { alias: 'E2', ...opposingProfile },
        { alias: 'E3', ...agreeingProfile }
      ],
      existingInsights: [existing],
      transcriptWindow: window,
      newUtterances: window.slice(2)
    });
    const result = await provider.complete(
      request('insights', prompt.context, 'insight-context')
    );
    const patch = parseJsonLoose(result.text) as {
      consensus: Array<{
        content: string;
        participants: string[];
        evidence: number[];
      }>;
      divergences: Array<{
        ref: string | null;
        content: string;
        stances: Array<{ who: string; position: string }>;
        evidence: number[];
      }>;
    };
    const divergence = patch.divergences[0];
    const consensus = patch.consensus[0];

    expect(divergence?.ref).toBe('D1');
    expect(divergence?.content).toBe(
      `${issue.issue}：${issue.sides.join('；')}`
    );
    expect(divergence?.evidence).toEqual([2, 4]);
    expect(divergence?.content).not.toMatch(/[“”…]|[CD]\d|有限共识/u);
    expect(divergence?.stances).toEqual([
      { who: 'E1', position: firstProfile.arguments[0]!.position },
      { who: 'E2', position: opposingProfile.arguments[0]!.position }
    ]);
    expect(consensus?.content).toBe(
      `沈清和与周景行都${firstProfile.arguments[0]!.position}`
    );
    expect(consensus?.participants).toEqual(['E1', 'E3']);
    expect(consensus?.evidence).toEqual([2, 5]);
    expect(consensus?.content).not.toMatch(/…|[CD]\d/u);
    expect(result.text).not.toMatch(/新人|岗位|编程|代码|效率收益/u);
  });

  it('总结第二段按每个议题呈现两侧真实主张且不归属未发言嘉宾', async () => {
    const provider = createMockProvider({
      latencyMs: 0,
      streamDelayMs: 0
    });
    const firstProfile = MOCK_PROFILE_GROUPS.general.find(
      ({ name }) => name === '沈清和'
    )!;
    const secondProfile = MOCK_PROFILE_GROUPS.general.find(
      ({ name }) => name === '林予川'
    )!;
    const unusedProfile = MOCK_PROFILE_GROUPS.general.find(
      ({ name }) => name === '周景行'
    )!;
    const summaryRoster: PromptRosterEntry[] = [
      fuelRoster[0]!,
      { alias: 'E1', ...firstProfile },
      { alias: 'E2', ...secondProfile },
      { alias: 'E3', ...unusedProfile }
    ];
    const actualUtterances = [
      utteranceEntry(1, 'H', 'opening', null, `今天讨论“${fuelTopic}”。`),
      utteranceEntry(2, 'E1', 'statement', null, firstProfile.arguments[0]!.claim),
      utteranceEntry(3, 'E2', 'rebut', 'E1', secondProfile.arguments[0]!.claim)
    ];
    const transcript = actualUtterances
      .map((entry) => {
        const speaker = summaryRoster.find(
          ({ alias }) => alias === entry.speakerAlias
        )!;
        return `#${entry.seq} ${entry.speakerAlias} ${speaker.name}（${speaker.title}）：${entry.content}`;
      })
      .join('\n');
    const prompt = buildSummaryPrompt({
      ...fuelDiscussion(transcript, []),
      roster: summaryRoster
    });
    const result = await provider.complete(
      request('summary', prompt.context, 'summary-context')
    );
    const paragraphs = result.text
      .split(/\r?\n\s*\r?\n/u)
      .filter((paragraph) => paragraph.trim());

    expect(result.text).toContain('城市是否应该全面禁止燃油车');
    expect(result.text).toContain(`“${fuelTopic}”`);
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[1]).toContain(
      `沈清和认为“${firstProfile.arguments[0]!.claim}”`
    );
    expect(paragraphs[1]).toContain(
      `林予川认为“${secondProfile.arguments[0]!.claim}”`
    );
    expect(paragraphs[1]).not.toContain('周景行');
    expect(paragraphs[1]).not.toContain(paragraphs[0]!);
    expect(paragraphs[1]).not.toMatch(/[^。！？]*：[^。！？]*：/u);
    expect(result.text).not.toMatch(/…|[CD]\d/u);
  });

  it('没有共识洞察时总结仍是两段实际主张且不声称形成共识', async () => {
    const provider = createMockProvider({
      latencyMs: 0,
      streamDelayMs: 0
    });
    const firstProfile = MOCK_PROFILE_GROUPS.general.find(
      ({ name }) => name === '沈清和'
    )!;
    const secondProfile = MOCK_PROFILE_GROUPS.general.find(
      ({ name }) => name === '林予川'
    )!;
    const summaryRoster: PromptRosterEntry[] = [
      fuelRoster[0]!,
      { alias: 'E1', ...firstProfile },
      { alias: 'E2', ...secondProfile }
    ];
    const transcript = [
      `#1 E1 ${firstProfile.name}（${firstProfile.title}）：${firstProfile.arguments[0]!.claim}`,
      `#2 E2 ${secondProfile.name}（${secondProfile.title}）：${secondProfile.arguments[0]!.claim}`
    ].join('\n');
    const prompt = buildSummaryPrompt({
      ...fuelDiscussion(transcript, []),
      roster: summaryRoster
    });
    const result = await provider.complete(
      request('summary', prompt.context, 'summary-without-consensus')
    );
    const paragraphs = result.text
      .split(/\r?\n\s*\r?\n/u)
      .filter((paragraph) => paragraph.trim());

    expect(paragraphs).toHaveLength(2);
    expect(result.text).not.toContain('共识');
    expect(result.text).toContain(`“${fuelTopic}”`);
    expect(paragraphs[1]).toContain(firstProfile.arguments[0]!.claim);
    expect(paragraphs[1]).toContain(secondProfile.arguments[0]!.claim);
    expect(paragraphs[1]).not.toContain(paragraphs[0]!);
    expect(result.text).not.toMatch(/…|[CD]\d/u);
    expect(result.text.trimStart()).not.toMatch(/^(?:\{|\[)/u);
  });

  it('编程与燃油车十二条发言流程中的引用均来自真实观点且不截断', async () => {
    const topics = [
      'AI 编程工具会如何改变初级软件工程师的培养？',
      fuelTopic
    ];
    const acts = [
      'statement',
      'rebut',
      'supplement',
      'interrupt',
      'statement',
      'rebut',
      'supplement',
      'interrupt',
      'statement',
      'rebut',
      'supplement',
      'statement'
    ] as const;
    const boilerplate = [
      '等一下',
      '先停一下',
      '我想立即回应',
      '我的初步判断是',
      '我先亮明立场',
      '我先说明',
      '我先表明',
      '我想先说明',
      '关键在于',
      '我支持把立场说清',
      '围绕',
      '你提到',
      '刚才说'
    ];

    for (const [topicIndex, topic] of topics.entries()) {
      const provider = createMockProvider({
        latencyMs: 0,
        streamDelayMs: 0
      });
      const isProgramming = topicIndex === 0;
      const roster = fuelRoster.map((entry) => {
        if (!isProgramming || entry.alias === 'H') {
          return entry;
        }
        const stanceByAlias: Record<string, string> = {
          E1: '支持助手承担重复编码。',
          E2: '担心基础任务减少会挤压新人练习。',
          E3: '认为岗位变化取决于需求增长。',
          E4: '反对用自动生成替代工程训练。'
        };
        return {
          ...entry,
          profession:
            entry.alias === 'E1'
              ? '软件工程师'
              : entry.alias === 'E2'
                ? '工程教育顾问'
                : entry.alias === 'E3'
                  ? '劳动经济研究员'
                  : '职业教育教师',
          title: '相关领域研究员',
          stance: stanceByAlias[entry.alias] ?? entry.stance
        };
      });
      const aliasMap = fuelAliasMap;
      const transcript: string[] = [];
      const history: InsightPromptUtterance[] = [];
      const outputs: string[] = [];
      const expertOutputs: string[] = [];
      let seq = 0;
      let nextInsightId = 0;
      const card = (alias: string): PromptRoleCard => {
        const entry = roster.find((candidate) => candidate.alias === alias)!;
        return {
          name: entry.name,
          profession: entry.profession,
          title: entry.title,
          stance: entry.stance,
          stanceTag: entry.stanceTag,
          persona: `${entry.profession}视角，关注话题中的实际条件。`
        };
      };
      const discussion = (): DiscussionPromptInput => ({
        topic,
        transcriptWindow: transcript.join('\n'),
        insights: [],
        roster,
        aliasMap
      });
      const record = (
        speakerAlias: string,
        act: InsightPromptUtterance['act'],
        replyToAlias: string | null,
        content: string
      ) => {
        const speaker = roster.find(
          (entry) => entry.alias === speakerAlias
        )!;
        const utterance = utteranceEntry(
          ++seq,
          speakerAlias,
          act,
          replyToAlias,
          content
        );
        history.push(utterance);
        transcript.push(
          `#${seq} ${speakerAlias} ${speaker.name}（${speaker.title}）：${content}`
        );
        outputs.push(content);
        if (speakerAlias !== 'H') {
          expertOutputs.push(content);
        }
      };

      const openingPrompt = buildHostPrompt({
        ...discussion(),
        hostRoleCard: card('H'),
        action: 'opening',
        targetAlias: null
      });
      const opening = await provider.complete(
        request('host', openingPrompt.context, `quote-flow-${topicIndex}`)
      );
      record('H', 'opening', null, opening.text);

      for (let index = 0; index < acts.length; index += 1) {
        const speakerAlias = `E${(index % 4) + 1}`;
        const previousAlias = history.at(-1)?.speakerAlias ?? 'H';
        const replyToAlias =
          previousAlias === speakerAlias
            ? `E${((index + 1) % 4) + 1}`
            : previousAlias;
        const prompt = buildUtterancePrompt({
          ...discussion(),
          speakerAlias,
          speaker: card(speakerAlias),
          act: acts[index]!,
          replyToAlias
        });
        const result = await provider.complete(
          request(
            'utterance',
            prompt.context,
            `quote-flow-${topicIndex}`
          )
        );
        record(speakerAlias, acts[index]!, replyToAlias, result.text);

        if (index === 3 || index === 7) {
          const action = index === 3 ? 'follow_up' : 'bridge';
          const targetAlias = index === 3 ? speakerAlias : 'E1';
          const hostPrompt = buildHostPrompt({
            ...discussion(),
            hostRoleCard: card('H'),
            action,
            targetAlias,
            ...(action === 'bridge'
              ? {
                  divergence: {
                    ref: 'D1',
                    content: '替代交通供给',
                    stances: [
                      {
                        speakerAlias: 'E1',
                        position: roster.find(({ alias }) => alias === 'E1')!
                          .stance
                      },
                      {
                        speakerAlias: 'E2',
                        position: roster.find(({ alias }) => alias === 'E2')!
                          .stance
                      }
                    ]
                  }
                }
              : {})
          });
          const host = await provider.complete(
            request('host', hostPrompt.context, `quote-flow-${topicIndex}`)
          );
          record('H', action, targetAlias, host.text);
        }
      }

      const insightPrompt = buildInsightsPrompt({
        topic,
        aliasMap,
        roster,
        existingInsights: [],
        transcriptWindow: history.slice(-10),
        newUtterances: history.filter(
          ({ speakerAlias }) => speakerAlias !== 'H'
        )
      });
      const insightResult = await provider.complete(
        request(
          'insights',
          insightPrompt.context,
          `quote-flow-${topicIndex}`
        )
      );
      outputs.push(insightResult.text);
      const merged = mergeInsights(
        [],
        parseJsonLoose(insightResult.text),
        {
          discussionId: `quote-flow-${topicIndex}`,
          aliasToParticipantId: Object.fromEntries(
            Object.entries(aliasMap).filter(([alias]) => alias !== 'H')
          ),
          refToInsightId: {},
          validSeqs: new Set(history.map(({ seq: utteranceSeq }) => utteranceSeq)),
          currentSeq: seq,
          now: '2026-06-03T00:00:00.000Z',
          newId: () => `quote-insight-${++nextInsightId}`,
          maxPerKind: 6,
          similarityThreshold: 0.6
        }
      );
      const summaryPrompt = buildSummaryPrompt({
        ...discussion(),
        insights: merged.insights,
        transcriptWindow: transcript.join('\n')
      });
      const summary = await provider.complete(
        request(
          'summary',
          summaryPrompt.context,
          `quote-flow-${topicIndex}`
        )
      );
      outputs.push(summary.text);

      const sourceUtterances = history.map(({ content }) => content);
      for (const text of outputs) {
        expect(text).not.toContain('…');
        for (const match of text.matchAll(/“([^”]*)”/gu)) {
          const quote = match[1] ?? '';
          if (quote === topic) {
            continue;
          }
          expect(quote).not.toMatch(/[“”]/u);
          expect(Array.from(quote).length).toBeGreaterThanOrEqual(4);
          expect(Array.from(quote).length).toBeLessThanOrEqual(20);
          expect(quote).not.toMatch(/[，。；：！？]/u);
          expect(quote).not.toMatch(
            /^(?:因为|所以|但|可是|不过|而且|然而|并且|同时|另外|其实|毕竟|即使|尽管|虽然|如果|若|假如|只要|除非|当|前提是|并补充|并说明|具体来说|关键(?:在于|是)|重点在于|核心在于|问题在于|原因在于|理由(?:是|在于)|依据(?:是|在于))/u
          );
          expect(quote).not.toContain(topic.replace(/[?？]/gu, ''));
          expect(boilerplate.some((phrase) => quote.includes(phrase))).toBe(
            false
          );
          const matchesSourceBoundary = sourceUtterances.some((source) => {
            let offset = source.indexOf(quote);
            while (offset >= 0) {
              const before = Array.from(source.slice(0, offset)).at(-1);
              const after = Array.from(source.slice(offset + quote.length))[0];
              if (
                (before === undefined ||
                  before === '我' ||
                  /[，。；：！？]/u.test(before)) &&
                (after === undefined || /[，。；：！？]/u.test(after))
              ) {
                return true;
              }
              offset = source.indexOf(quote, offset + 1);
            }
            return false;
          });
          expect(matchesSourceBoundary).toBe(true);
        }
      }
      expect(expertOutputs).toHaveLength(12);
      expect(
        expertOutputs.filter((text) =>
          text.includes(topic.replace(/[?？]/gu, ''))
        ).length
      ).toBeLessThanOrEqual(4);
      expect(outputs.join('\n')).not.toMatch(/[CD]\d/u);
    }
  });

  it('燃油车话题贯穿阵容、出价、主持、洞察与总结且不混入编程词汇', async () => {
    const provider = createMockProvider({
      latencyMs: 0,
      streamDelayMs: 0
    });
    const discussionId = 'fuel-topic-flow';
    const lineupResult = await provider.complete(
      request(
        'lineup',
        { topic: fuelTopic, expertCount: 4 },
        discussionId
      )
    );
    const lineup = normalizeLineup(
      parseJsonLoose(lineupResult.text),
      4
    );
    const aliasMap: Record<string, string> = {
      H: 'fuel-host',
      E1: 'fuel-expert-1',
      E2: 'fuel-expert-2',
      E3: 'fuel-expert-3',
      E4: 'fuel-expert-4'
    };
    const drafts = [
      { alias: 'H', draft: lineup.host },
      ...lineup.experts.map((draft, index) => ({
        alias: `E${index + 1}`,
        draft
      }))
    ];
    const roster: PromptRosterEntry[] = drafts.map(({ alias, draft }) => ({
      alias,
      name: draft.name,
      profession: draft.profession,
      title: draft.title,
      stanceTag: draft.stanceTag,
      stance: draft.stance
    }));
    const cards = new Map<string, PromptRoleCard>(
      drafts.map(({ alias, draft }) => [
        alias,
        {
          name: draft.name,
          profession: draft.profession,
          title: draft.title,
          stance: draft.stance,
          stanceTag: draft.stanceTag,
          persona: draft.persona
        }
      ])
    );
    const history: InsightPromptUtterance[] = [];
    const transcript: string[] = [];
    const printed: string[] = [lineupResult.text];
    let seq = 0;
    const discussion = (): DiscussionPromptInput => ({
      topic: fuelTopic,
      transcriptWindow: transcript.join('\n'),
      insights: [],
      roster,
      aliasMap
    });
    const record = (
      speakerAlias: string,
      act: InsightPromptUtterance['act'],
      replyToAlias: string | null,
      content: string
    ) => {
      const speaker = roster.find(({ alias }) => alias === speakerAlias);
      const utterance = utteranceEntry(
        ++seq,
        speakerAlias,
        act,
        replyToAlias,
        content
      );
      history.push(utterance);
      transcript.push(
        `#${seq} ${speakerAlias} ${speaker?.name ?? speakerAlias}（${speaker?.title ?? '嘉宾'}）：${content}`
      );
      printed.push(`${speakerAlias} ${speaker?.name ?? speakerAlias}：${content}`);
      return utterance;
    };

    const openingPrompt = buildHostPrompt({
      ...discussion(),
      hostRoleCard: cards.get('H')!,
      action: 'opening',
      targetAlias: null
    });
    const opening = await provider.complete(
      request('host', openingPrompt.context, discussionId)
    );
    record('H', 'opening', null, opening.text);
    for (const expert of roster.filter(({ alias }) => alias !== 'H')) {
      expect(opening.text).toContain(expert.name);
      expect(opening.text).toContain(expert.profession);
    }

    let lastSpeakerAlias = 'H';
    for (let turn = 1; turn <= 5; turn += 1) {
      const bidResults: Array<{
        alias: string;
        bid: {
          wantToSpeak: boolean;
          intent: 'raise_hand' | 'interrupt' | 'supplement' | 'rebut';
          replyTo: string | null;
        };
      }> = [];
      for (let seat = 1; seat <= 4; seat += 1) {
        const alias = `E${seat}`;
        const prompt = buildBidPrompt({
          ...discussion(),
          speakerAlias: alias,
          speaker: cards.get(alias)!,
          previousUtterance: {
            seq,
            speakerAlias: lastSpeakerAlias
          }
        });
        const response = await provider.complete(
          request('bid', prompt.context, discussionId)
        );
        const bid = parseJsonLoose(response.text) as {
          wantToSpeak: boolean;
          intent: 'raise_hand' | 'interrupt' | 'supplement' | 'rebut';
          replyTo: string | null;
        };
        bidResults.push({ alias, bid });
        printed.push(
          `第${turn}轮出价 ${alias}：${bid.wantToSpeak ? '发言' : '暂不发言'} / ${bid.intent} / replyTo=${bid.replyTo ?? '无'}`
        );
      }
      const selected =
        bidResults.find(
          ({ alias, bid }) =>
            bid.wantToSpeak && alias !== lastSpeakerAlias
        ) ??
        bidResults.find(({ alias }) => alias !== lastSpeakerAlias) ??
        bidResults[0]!;
      const act =
        selected.bid.intent === 'raise_hand'
          ? 'statement'
          : selected.bid.intent;
      const replyToAlias =
        selected.bid.replyTo && selected.bid.replyTo !== selected.alias
          ? selected.bid.replyTo
          : lastSpeakerAlias === selected.alias
            ? null
            : lastSpeakerAlias;
      const utterancePrompt = buildUtterancePrompt({
        ...discussion(),
        speakerAlias: selected.alias,
        speaker: cards.get(selected.alias)!,
        act,
        replyToAlias
      });
      const utterance = await provider.complete(
        request('utterance', utterancePrompt.context, discussionId)
      );
      record(selected.alias, act, replyToAlias, utterance.text);
      lastSpeakerAlias = selected.alias;

      if (turn === 3) {
        const hostPrompt = buildHostPrompt({
          ...discussion(),
          hostRoleCard: cards.get('H')!,
          action: 'follow_up',
          targetAlias: selected.alias
        });
        const followUp = await provider.complete(
          request('host', hostPrompt.context, discussionId)
        );
        record('H', 'follow_up', selected.alias, followUp.text);
        lastSpeakerAlias = 'H';
      }
    }

    const insightPrompt = buildInsightsPrompt({
      topic: fuelTopic,
      aliasMap,
      roster,
      existingInsights: [],
      transcriptWindow: history.slice(-10),
      newUtterances: history.filter(({ speakerAlias }) => speakerAlias !== 'H')
    });
    const insightResponse = await provider.complete(
      request('insights', insightPrompt.context, discussionId)
    );
    const validSeqs = new Set(history.map(({ seq: utteranceSeq }) => utteranceSeq));
    const merged = mergeInsights([], parseJsonLoose(insightResponse.text), {
      discussionId,
      aliasToParticipantId: Object.fromEntries(
        Object.entries(aliasMap).filter(([alias]) => alias !== 'H')
      ),
      refToInsightId: {},
      validSeqs,
      currentSeq: seq,
      now: '2026-06-03T00:00:00.000Z',
      newId: (() => {
        let nextId = 0;
        return () => `fuel-insight-${++nextId}`;
      })(),
      maxPerKind: 6,
      similarityThreshold: 0.6
    });
    printed.push(`洞察 ${insightResponse.text}`);
    const summaryPrompt = buildSummaryPrompt({
      ...discussion(),
      insights: merged.insights
    });
    const summary = await provider.complete(
      request('summary', summaryPrompt.context, discussionId)
    );
    printed.push(`总结 ${summary.text}`);

    expect(merged.insights.length).toBeGreaterThan(0);
    expect(printed.join('\n')).not.toMatch(/新人|岗位|编程|代码/u);
    expect(summary.text).toContain('城市是否应该全面禁止燃油车');
    const unheardGuestNames = roster
      .filter(
        ({ alias }) =>
          alias !== 'H' &&
          !history.some((utterance) => utterance.speakerAlias === alias)
      )
      .map(({ name }) => name);
    for (const name of unheardGuestNames) {
      expect(summary.text).not.toMatch(
        new RegExp(`${name}(?:提到|认为|指出|主张)`, 'u')
      );
    }
    expect(summary.text.trimStart()).not.toMatch(/^(?:\{|\[)/u);
  });

  it('流式分片拼接等于完成文本且自然语言任务不输出 JSON', async () => {
    const tasks = ['utterance', 'host', 'summary'] as const;

    for (const task of tasks) {
      const completeProvider = createMockProvider({
        latencyMs: 0,
        streamDelayMs: 0
      });
      const streamProvider = createMockProvider({
        latencyMs: 0,
        streamDelayMs: 0
      });
      const req = request(task, { turnIndex: 2 });
      const complete = await completeProvider.complete(req);
      const chunks: string[] = [];

      for await (const chunk of streamProvider.stream(req)) {
        chunks.push(chunk);
      }

      expect(chunks.join('')).toBe(complete.text);
      expect(complete.text.trimStart()).not.toMatch(/^(?:\{|\[)/);
      expect(complete.text).toMatch(/[\u3400-\u9fff]/);
    }
  });

  it('failOn 命中时提供商拒绝该任务', async () => {
    const provider = createMockProvider({
      latencyMs: 0,
      streamDelayMs: 0,
      failOn: (req) => req.task === 'bid'
    });

    await expect(provider.complete(request('bid'))).rejects.toThrow();
  });

  it('三类话题十二轮均覆盖观点、侧向洞察与两段式总结', async () => {
    const topics = [
      'AI 编程工具会如何改变初级软件工程师的培养？',
      '客服中心应该全面使用 AI 自动回复吗？',
      '城市应该限制网约车数量吗？'
    ];
    const cjkLatinOrDigit = /[\u4e00-\u9fff][A-Za-z0-9]|[A-Za-z0-9][\u4e00-\u9fff]/u;

    for (const [topicIndex, topic] of topics.entries()) {
      const flow = await simulateMockDiscussion(
        topic,
        `mock-discussion-flow-${topicIndex + 1}`
      );
      const topicGroup =
        topicIndex === 0
          ? 'programming'
          : topicIndex === 1
            ? 'service'
            : 'general';
      const issueDefinitions = MOCK_ISSUE_GROUPS[topicGroup];
      const expertUtterances = flow.expertSpeech;
      const acts = new Set(expertUtterances.map(({ act }) => act));
      const topicSentence = topic.replace(/[。！？!?]+$/u, '');
      const questions = flow.hostSpeech
        .filter(({ action }) => action !== 'opening')
        .flatMap(({ content }) => content.match(/[^。！？!?]*[？?]/gu) ?? [])
        .map((question) => question.trim());
      const summaryParagraphs = flow.summary
        .split(/\r?\n\s*\r?\n/u)
        .filter((paragraph) => paragraph.trim());

      expect(expertUtterances).toHaveLength(12);
      expect(acts).toEqual(
        new Set(['statement', 'rebut', 'supplement', 'interrupt'])
      );
      expect(new Set(expertUtterances.map(({ content }) => content)).size).toBe(12);
      expect(new Set(questions).size).toBe(questions.length);
      expect(questions.length).toBeGreaterThanOrEqual(2);
      expect(flow.allOutputs.join('\n')).not.toMatch(cjkLatinOrDigit);
      expect(flow.allOutputs.join('\n')).not.toMatch(/围绕围绕|在围绕/u);
      expect(
        expertUtterances.every(({ content }) => !content.includes(topicSentence))
      ).toBe(true);
      for (const output of flow.allOutputs) {
        expect(output).not.toContain('…');
        for (const match of output.matchAll(/“([^”]*)”/gu)) {
          const quote = match[1] ?? '';
          if (quote === topic) {
            continue;
          }
          expect(Array.from(quote).length).toBeGreaterThanOrEqual(4);
          expect(Array.from(quote).length).toBeLessThanOrEqual(20);
          expect(quote).not.toMatch(/[，。；：！？]/u);
          const declaredClaim = Object.values(MOCK_PROFILE_GROUPS)
            .flat()
            .some(
              (profile) =>
                profile.stanceClaim === quote ||
                profile.arguments.some(({ claim }) => claim === quote)
            );
          expect(declaredClaim, `quote ${quote} in ${output}`).toBe(true);
          expect(
            flow.history.some((source) => source.content.includes(quote)),
            `quote ${quote} must occur in a spoken source`
          ).toBe(true);
        }
      }

      for (const expert of flow.roster.filter(({ alias }) => alias !== 'H')) {
        const utterances = expertUtterances.filter(
          ({ alias }) => alias === expert.alias
        );
        const profile = Object.values(MOCK_PROFILE_GROUPS)
          .flat()
          .find(({ stance }) => stance === expert.stance);
        expect(profile).toBeDefined();
        expect(utterances[0]?.content).toContain(profile!.stanceClaim);
        const stanceOccurrences = utterances.reduce(
          (count, { content }) =>
            count + (content.split(expert.stance).length - 1),
          0
        );
        expect(stanceOccurrences).toBeLessThanOrEqual(1);
        expect(
          utterances.reduce(
            (count, { content }) =>
              count + (content.split(profile!.stanceClaim).length - 1),
            0
          )
        ).toBeLessThanOrEqual(1);
        for (const argument of profile!.arguments) {
          const claimOccurrences = utterances.reduce(
            (count, { content }) =>
              count + (content.split(argument.claim).length - 1),
            0
          );
          expect(
            claimOccurrences,
            `${expert.alias} repeated claim ${argument.claim}: ${utterances
              .filter(({ content }) => content.includes(argument.claim))
              .map(({ content }) => content)
              .join(' | ')}`
          ).toBeLessThanOrEqual(1);
        }
        for (let first = 0; first < utterances.length; first += 1) {
          for (let second = first + 1; second < utterances.length; second += 1) {
            const commonLength = longestCommonSubstringLength(
              utterances[first]!.content,
              utterances[second]!.content
            );
            expect(commonLength).toBeLessThanOrEqual(8);
          }
        }
      }

      const divergences = flow.insights.filter(
        ({ kind }) => kind === 'divergence'
      );
      const divergenceIssues = divergences.map(
        ({ content }) => content.split(/[：:]/u)[0]?.trim() ?? ''
      );
      expect(new Set(divergenceIssues).size).toBe(divergenceIssues.length);
      for (const insight of flow.insights) {
        expect(insight.content).not.toMatch(/…|[CD]\d/u);
        for (const stance of insight.stances) {
          expect(Array.from(stance.position).length).toBeLessThanOrEqual(20);
          expect(stance.position).not.toMatch(
            /^(?:的立场是|我的立场是|我先把判断说清)/u
          );
        }
        if (insight.kind === 'divergence') {
          const issue = issueDefinitions.find(({ issue }) =>
            insight.content.startsWith(`${issue}：`)
          );
          expect(issue).toBeDefined();
          expect(insight.content).toBe(
            `${issue!.issue}：${issue!.sides.join('；')}`
          );
          expect(insight.stances).toHaveLength(2);
        } else {
          expect(insight.content).toMatch(/^.+与.+都/u);
        }
        expect(
          flow.roster.some(
            ({ alias }) =>
              alias !== 'H' &&
              flow.expertSpeech
                .filter((utterance) => utterance.alias === alias)
                .some(({ content }) => content === insight.content)
          )
        ).toBe(false);
      }

      expect(summaryParagraphs).toHaveLength(2);
      expect(summaryParagraphs[0]).toContain(topicSentence);
      expect(summaryParagraphs[1]).not.toContain(topicSentence);
      expect(summaryParagraphs[1]).not.toBe(summaryParagraphs[0]);
      for (const paragraph of summaryParagraphs) {
        const paragraphClauses = paragraph
          .split(/[，。；：！？!?;\r\n]+/u)
          .map((clause) => clause.trim())
          .filter(Boolean);
        expect(new Set(paragraphClauses).size, paragraph).toBe(
          paragraphClauses.length
        );
      }
      for (const clause of (summaryParagraphs[1] ?? '').split(/[。！？!?]/u)) {
        const speakersInClause = flow.roster.filter(
          ({ alias, name }) =>
            alias !== 'H' &&
            flow.expertSpeech.some((utterance) => utterance.alias === alias) &&
            clause.includes(name)
        );
        expect(speakersInClause.length).toBeLessThanOrEqual(2);
      }
    }
  });

  it('用完四条论据后仍针对回应对象最近一条具体内容作答', async () => {
    const topic = 'AI 编程工具会如何改变初级软件工程师的培养？';
    const discussionId = 'arguments-exhausted-response';
    const provider = createMockProvider({
      latencyMs: 0,
      streamDelayMs: 0
    });
    const lineupResponse = await provider.complete(
      request('lineup', { topic, expertCount: 4 }, discussionId)
    );
    const lineup = normalizeLineup(
      parseJsonLoose(lineupResponse.text),
      4
    );
    const roster: PromptRosterEntry[] = [
      { alias: 'H', ...lineup.host },
      ...lineup.experts.map((expert, index) => ({
        alias: `E${index + 1}`,
        ...expert
      }))
    ];
    const aliasMap = {
      H: 'host-id',
      E1: 'expert-1-id',
      E2: 'expert-2-id',
      E3: 'expert-3-id',
      E4: 'expert-4-id'
    };
    const speaker = roster.find(({ alias }) => alias === 'E1')!;
    const target = roster.find(({ alias }) => alias === 'E2')!;
    const speakerProfile = Object.values(MOCK_PROFILE_GROUPS)
      .flat()
      .find(({ stance }) => stance === speaker.stance)!;
    const targetProfile = Object.values(MOCK_PROFILE_GROUPS)
      .flat()
      .find(({ stance }) => stance === target.stance)!;
    const card = (entry: PromptRosterEntry): PromptRoleCard => ({
      name: entry.name,
      profession: entry.profession,
      title: entry.title,
      stance: entry.stance,
      stanceTag: entry.stanceTag,
      persona: ''
    });
    const history = [
      `#1 E2 ${target.name}（${target.title}）：${targetProfile.stanceClaim}`
    ];
    for (let index = 0; index < 5; index += 1) {
      const prompt = buildUtterancePrompt({
        topic,
        transcriptWindow: history.join('\n'),
        insights: [],
        roster,
        aliasMap,
        speakerAlias: 'E1',
        speaker: card(speaker),
        act: 'statement',
        replyToAlias: 'E2'
      });
      const result = await provider.complete(
        request('utterance', prompt.context, discussionId)
      );
      history.push(
        `#${index + 2} E1 ${speaker.name}（${speaker.title}）：${result.text}`
      );
    }
    history.push(
      `#7 E2 ${target.name}（${target.title}）：${targetProfile.arguments[1]!.claim}`
    );
    const prompt = buildUtterancePrompt({
      topic,
      transcriptWindow: history.join('\n'),
      insights: [],
      roster,
      aliasMap,
      speakerAlias: 'E1',
      speaker: card(speaker),
      act: 'rebut',
      replyToAlias: 'E2'
    });
    const response = await provider.complete(
      request('utterance', prompt.context, discussionId)
    );
    const speakerHistory = history.filter((line) => /^#\d+ E1 /u.test(line));

    for (const argument of speakerProfile.arguments) {
      expect(
        speakerHistory.reduce(
          (count, line) => count + (line.split(argument.claim).length - 1),
          0
        )
      ).toBe(1);
    }
    expect(response.text).toContain(target.name);
    expect(response.text).toContain(
      `“${targetProfile.arguments[1]!.claim}”`
    );
    expect(response.text).toContain(targetProfile.arguments[1]!.detail.text);
    expect(
      speakerProfile.arguments.every(
        ({ claim, text, position, detail }) =>
          !response.text.includes(claim) &&
          !response.text.includes(text) &&
          !response.text.includes(position) &&
          !response.text.includes(detail.text)
      )
    ).toBe(true);
  });

  it('rebut 与 supplement 只引用先前发言里的完整 claim', async () => {
    const cases = [
      {
        act: 'rebut' as const,
        target: '唐宁',
        speaker: '陈澄',
        source: (profile: (name: string) => (typeof MOCK_PROFILE_GROUPS.programming)[number]) =>
          profile('唐宁').stanceClaim
      },
      {
        act: 'supplement' as const,
        target: '周明',
        speaker: '唐宁',
        source: (profile: (name: string) => (typeof MOCK_PROFILE_GROUPS.programming)[number]) =>
          profile('周明').arguments[0]!.claim
      }
    ];
    const profile = (name: string) =>
      MOCK_PROFILE_GROUPS.programming.find((entry) => entry.name === name)!;
    for (const [index, testCase] of cases.entries()) {
      const targetProfile = profile(testCase.target);
      const speakerProfile = profile(testCase.speaker);
      const claim = testCase.source(profile);
      const roster: PromptRosterEntry[] = [
        fuelRoster[0]!,
        { alias: 'E1', ...targetProfile },
        { alias: 'E2', ...speakerProfile }
      ];
      const prompt = buildUtterancePrompt({
        topic: 'AI 编程工具会如何改变初级软件工程师的培养？',
        transcriptWindow:
          `#1 E1 ${targetProfile.name}（${targetProfile.title}）：我${claim}。`,
        insights: [],
        roster,
        aliasMap: fuelAliasMap,
        speakerAlias: 'E2',
        speaker: {
          name: speakerProfile.name,
          profession: speakerProfile.profession,
          title: speakerProfile.title,
          stance: speakerProfile.stance,
          stanceTag: speakerProfile.stanceTag,
          persona: speakerProfile.persona
        },
        act: testCase.act,
        replyToAlias: 'E1'
      });
      const result = await createMockProvider({
        latencyMs: 0,
        streamDelayMs: 0
      }).complete(
        request('utterance', prompt.context, `metadata-claim-${index}`)
      );
      const quote = result.text.match(/“([^”]*)”/u)?.[1];

      expect(result.text).toContain(
        `${targetProfile.name}刚才说“${claim}”`
      );
      expect(quote).toBe(claim);
      expect(Array.from(quote ?? '').length).toBeGreaterThanOrEqual(4);
      expect(Array.from(quote ?? '').length).toBeLessThanOrEqual(20);
      expect(result.text).not.toContain('提到“');
      expect(result.text).not.toMatch(/…/u);
      if (testCase.act === 'rebut' && /反对|不支持|担心/u.test(claim)) {
        expect(result.text).not.toMatch(
          /(?:不同意|不认同|不赞成|不能认同)[^。；：]{0,32}(?:反对|担心|担忧|不支持|不赞成|不认同)/u
        );
      }
    }
  });

  it('主持 bridge、follow_up 与 invite 各有四种确定且先不重复的问法', async () => {
    const actions = ['bridge', 'follow_up', 'invite'] as const;
    const transcript = [
      utteranceEntry(
        1,
        'E1',
        'statement',
        null,
        '格式固定的重复任务可以先交给助手处理。'
      ),
      utteranceEntry(
        2,
        'E4',
        'rebut',
        'E1',
        '反对把效率提升当成唯一的评估结果。'
      )
    ];
    const firstProvider = createMockProvider({
      latencyMs: 0,
      streamDelayMs: 0
    });
    const secondProvider = createMockProvider({
      latencyMs: 0,
      streamDelayMs: 0
    });

    for (const action of actions) {
      const outputs: string[] = [];
      const repeatedProviderOutputs: string[] = [];
      for (let index = 0; index < 4; index += 1) {
        const prompt = buildHostPrompt({
          ...fuelDiscussion(transcript.map(transcriptLine).join('\n')),
          hostRoleCard: roleCardFor('H'),
          action,
          targetAlias: 'E2',
          ...(action === 'bridge'
            ? {
                divergence: {
                  ref: 'D1',
                  content: '任务边界',
                  stances: [
                    { speakerAlias: 'E1', position: '先限定使用范围' },
                    { speakerAlias: 'E2', position: '不能只看效率指标' }
                  ]
                }
              }
            : {})
        });
        outputs.push(
          (
            await firstProvider.complete(
              request('host', prompt.context, 'host-question-pool')
            )
          ).text
        );
        repeatedProviderOutputs.push(
          (
            await secondProvider.complete(
              request('host', prompt.context, 'host-question-pool')
            )
          ).text
        );
      }
      const questions = outputs.flatMap(
        (text) => text.match(/[^。！？!?]*[？?]/gu) ?? []
      );
      expect(new Set(outputs).size).toBe(4);
      expect(new Set(questions).size).toBe(4);
      expect(repeatedProviderOutputs).toEqual(outputs);
      if (action === 'bridge') {
        expect(outputs.every((text) => text.includes('沈清和'))).toBe(true);
        expect(outputs.every((text) => text.includes('顾南乔'))).toBe(true);
        expect(outputs.every((text) => !text.includes('请回应双方'))).toBe(true);
      } else {
        expect(outputs.every((text) => !text.includes(fuelTopic))).toBe(true);
      }
    }

    const nonSideTargetProvider = createMockProvider({
      latencyMs: 0,
      streamDelayMs: 0
    });
    const nonSidePrompt = buildHostPrompt({
      ...fuelDiscussion(transcript.map(transcriptLine).join('\n')),
      hostRoleCard: roleCardFor('H'),
      action: 'bridge',
      targetAlias: 'E4',
      divergence: {
        ref: 'D1',
        content: '任务边界',
        stances: [
          { speakerAlias: 'E1', position: '先限定使用范围' },
          { speakerAlias: 'E2', position: '不能只看效率指标' }
        ]
      }
    });
    const nonSideBridge = await nonSideTargetProvider.complete(
      request('host', nonSidePrompt.context, 'bridge-non-side-target')
    );
    expect(nonSideBridge.text).toContain('唐知意');
    expect(nonSideBridge.text).not.toContain('沈清和');
    expect(nonSideBridge.text).not.toContain('顾南乔');
    expect(nonSideBridge.text).not.toContain('请回应双方');
    expect(nonSideBridge.text).toMatch(/[？?]$/u);
  });

  it('interruptAvailability 控制 interrupt 且所有 JSON 任务始终合法', async () => {
    const provider = createMockProvider({
      latencyMs: 0,
      streamDelayMs: 0
    });
    const opposingClaim = fuelMockProfile('E2')!.arguments[0]!.claim;
    const blockedBids = [];
    for (let index = 0; index < 40; index += 1) {
      const prompt = buildBidPrompt({
        ...fuelDiscussion(
          `#7 E2 顾南乔（用户研究负责人）：${opposingClaim}。`
        ),
        speakerAlias: 'E1',
        speaker: roleCardFor('E1'),
        previousUtterance: { seq: 7, speakerAlias: 'E2' },
        interruptAvailability: {
          usedCount: 1,
          limit: 1,
          allowed: false,
          blockReason: 'quota_exhausted'
        }
      });
      const response = await provider.complete(
        request('bid', prompt.context, `interrupt-blocked-${index}`)
      );
      const bid = JSON.parse(response.text) as { intent: string };
      blockedBids.push(bid);
    }
    expect(blockedBids).toHaveLength(40);
    expect(blockedBids.every(({ intent }) => intent !== 'interrupt')).toBe(true);

    const allowedBids = [];
    for (let index = 0; index < 64; index += 1) {
      const previousPrompt = buildUtterancePrompt({
        ...fuelDiscussion(),
        speakerAlias: 'E2',
        speaker: roleCardFor('E2'),
        act: 'rebut',
        replyToAlias: 'E1'
      });
      await provider.complete(
        request(
          'utterance',
          previousPrompt.context,
          `interrupt-allowed-${index}`
        )
      );
      const prompt = buildBidPrompt({
        ...fuelDiscussion(
          `#7 E2 顾南乔（用户研究负责人）：${opposingClaim}。`
        ),
        speakerAlias: 'E1',
        speaker: roleCardFor('E1'),
        previousUtterance: { seq: 7, speakerAlias: 'E2' },
        interruptAvailability: {
          usedCount: 0,
          limit: 2,
          allowed: true,
          blockReason: null
        }
      });
      const response = await provider.complete(
        request('bid', prompt.context, `interrupt-allowed-${index}`)
      );
      allowedBids.push(JSON.parse(response.text) as { intent: string });
    }
    expect(
      allowedBids.some(({ intent }) => intent === 'interrupt')
    ).toBe(true);

    const jsonTasks: Array<{
      task: 'lineup' | 'bid' | 'insights';
      context: unknown;
    }> = [
      {
        task: 'lineup',
        context: { topic: fuelTopic, expertCount: 4 }
      },
      {
        task: 'bid',
        context: buildBidPrompt({
          ...fuelDiscussion(),
          speakerAlias: 'E1',
          speaker: roleCardFor('E1'),
          previousUtterance: { seq: 1, speakerAlias: 'E2' },
          interruptAvailability: {
            usedCount: 1,
            limit: 1,
            allowed: false,
            blockReason: 'quota_exhausted'
          }
        }).context
      },
      {
        task: 'insights',
        context: {
          roster: fuelRoster,
          newUtterances: [
            utteranceEntry(
              2,
              'E1',
              'supplement',
              'E4',
              '出行安排应同时考虑不同区域的实际需求。'
            )
          ]
        }
      }
    ];
    for (const [index, jsonTask] of jsonTasks.entries()) {
      const response = await provider.complete(
        request(jsonTask.task, jsonTask.context, `legal-json-${index}`)
      );
      expect(() => JSON.parse(response.text)).not.toThrow();
    }
  });
});
