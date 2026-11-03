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
import { createMockProvider } from './mock';
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

describe('createMockProvider', () => {
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
      /关注(?:支持|担心|认为|反对)|判断是(?:支持|担心|认为|反对)|但(?:支持|有条件支持)|担心担心|补充(?:支持|担心|认为|反对)|考虑(?:支持|担心|认为|反对)|出发看|必须补充/u;
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
    const outputs: string[] = [];

    for (const [stanceIndex, stance] of stanceVariants.entries()) {
      const roster = fuelRoster.map((entry) =>
        entry.alias === 'E1' ? { ...entry, stance } : entry
      );
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
                    fuelRoster[2]!.stance
                  )
                ]
              },
              `grammar-act-${stanceIndex}-${act}`
            )
          );
          outputs.push(result.text);
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
                    { speakerAlias: 'E2', position: fuelRoster[2]!.stance }
                  ]
                },
                transcriptWindow: [
                  utteranceEntry(
                    1,
                    'E2',
                    'statement',
                    null,
                    fuelRoster[2]!.stance
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
      expect(text.replace(/“[^”]*”/gu, '')).not.toContain('…');
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
    const longTopicClause = longTopic.split('，')[0]!;
    const wholeShortTopic = shortTopic.replace(/[？?]$/u, '');

    expect(Array.from(longTopicClause).length).toBeLessThanOrEqual(24);
    expect(longOpening).toContain(longTopicClause);
    expect(longOpening).not.toContain('这项政策需要怎样评估');
    expect(shortOpening).toContain(wholeShortTopic);
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
      addressed = false
    ) => {
      const previous = fuelRoster.find(
        ({ alias }) => alias === previousAlias
      );
      const transcript = previous
        ? `#7 ${previousAlias} ${previous.name}（${previous.title}）：先核算具体条件。`
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
    expect(cautiousAgainstSupport.intent).toBe('raise_hand');
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
        makeBid('E1', 'E2', `bid-interrupt-${index}`)
      )
    );
    const interruptBids = interruptResults.filter(
      ({ intent }) => intent === 'interrupt'
    );
    expect(interruptBids.length).toBeGreaterThan(0);
    expect(interruptBids.every(({ urgency }) => urgency >= 0.85)).toBe(true);
  });

  it('主持开场点全 roster，follow_up 与 invite 指向 targetAlias', async () => {
    const provider = createMockProvider({
      latencyMs: 0,
      streamDelayMs: 0
    });
    const transcript = transcriptLine(
      utteranceEntry(
        1,
        'E1',
        'statement',
        null,
        '先核算公交替代线路的覆盖范围。'
      )
    );
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
      expect(opening.split(/[。！？]/u).filter(Boolean).length).toBeLessThanOrEqual(3);
    }

    const followPrompt = buildHostPrompt({
      ...fuelDiscussion(transcript),
      hostRoleCard: roleCardFor('H'),
      action: 'follow_up',
      targetAlias: 'E2'
    });
    const followUp = await provider.complete(
      request('host', followPrompt.context, 'host-target')
    );
    expect(followUp.text).toContain('顾南乔');
    expect(followUp.text).toContain('从环境政策研究员的角度');
    expect(followUp.text).not.toMatch(/^沈清和/u);

    const invitePrompt = buildHostPrompt({
      ...fuelDiscussion(transcript),
      hostRoleCard: roleCardFor('H'),
      action: 'invite',
      targetAlias: 'E3'
    });
    const invite = await provider.complete(
      request('host', invitePrompt.context, 'host-target')
    );
    expect(invite.text).toContain('周景行');
    expect(invite.text).toContain('公共政策研究员');

    const bridgePrompt = buildHostPrompt({
      ...fuelDiscussion(transcript),
      hostRoleCard: roleCardFor('H'),
      action: 'bridge',
      targetAlias: 'E2',
      divergence: {
        ref: 'D1',
        content: '禁行范围与公交替代条件',
        stances: [
          { speakerAlias: 'E1', position: '支持分区推进' },
          { speakerAlias: 'E2', position: '反对一刀切' }
        ]
      }
    });
    const bridge = await provider.complete(
      request('host', bridgePrompt.context, 'host-bridge')
    );
    expect(bridge.text).toContain('沈清和');
    expect(bridge.text).toContain('支持分区推进');
    expect(bridge.text).toContain('顾南乔');
    expect(bridge.text).toContain('反对一刀切');
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

  it('根据真实反驳和补充关系提炼分歧共识并引用上下文序号', async () => {
    const provider = createMockProvider({
      latencyMs: 0,
      streamDelayMs: 0
    });
    const context = {
      aliasMap: { E1: '周明', E2: '陈澄' },
      newUtterances: [
        {
          seq: 3,
          speakerAlias: 'E1',
          act: 'rebut',
          replyToAlias: 'E2',
          content: '效率收益应在低风险场景逐步验证。'
        },
        {
          seq: 4,
          speakerAlias: 'E2',
          act: 'supplement',
          replyToAlias: 'E1',
          content: '试点也需要明确人工升级路径。'
        }
      ]
    };
    const result = await provider.complete(request('insights', context));
    const patch = parseJsonLoose(result.text) as {
      consensus?: Array<{ evidence?: number[] }>;
      divergences?: Array<{ evidence?: number[] }>;
    };
    const validSeqs = new Set(context.newUtterances.map(({ seq }) => seq));

    expect(patch.divergences?.length).toBeGreaterThan(0);
    expect(patch.consensus?.length).toBeGreaterThan(0);
    for (const item of [...(patch.consensus ?? []), ...(patch.divergences ?? [])]) {
      expect(item.evidence?.length).toBeGreaterThan(0);
      expect(item.evidence?.every((seq) => validSeqs.has(seq))).toBe(true);
    }
  });

  it('洞察用自然语言描述真实立场且 evidence 与已有 ref 有效', async () => {
    const provider = createMockProvider({
      latencyMs: 0,
      streamDelayMs: 0
    });
    const window = [
      utteranceEntry(
        2,
        'E1',
        'statement',
        null,
        '应先完善公交替代线路，再讨论分区限行。'
      ),
      utteranceEntry(
        3,
        'E2',
        'rebut',
        'E1',
        '替代交通不足时，一刀切会影响长距离通勤。'
      ),
      utteranceEntry(
        4,
        'E1',
        'rebut',
        'E2',
        '分区分步推进应考虑通勤差异，再确定适用范围。'
      ),
      utteranceEntry(
        5,
        'E3',
        'supplement',
        'E1',
        '还要把不同时段的公交覆盖纳入评估。'
      )
    ];
    const existing = makeTestInsight({
      id: 'existing-divergence',
      discussionId: 'insight-context',
      kind: 'divergence',
      content: '禁行范围与替代交通供给',
      stances: [
        { participantId: fuelAliasMap.E1, position: '支持先补齐替代线路' },
        { participantId: fuelAliasMap.E2, position: '反对一刀切禁行' }
      ],
      evidenceSeqs: [2, 3],
      updatedAtSeq: 3
    });
    const prompt = buildInsightsPrompt({
      topic: fuelTopic,
      aliasMap: fuelAliasMap,
      roster: fuelRoster,
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
    expect(divergence?.content).toContain('顾南乔');
    expect(divergence?.content).toContain('沈清和');
    expect(divergence?.evidence).toEqual([3, 4]);
    expect(divergence?.content).not.toMatch(/[“”…]|[CD]\d/u);
    expect(divergence?.stances).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          who: 'E1',
          position: '支持分区推进公交优先与慢行改善'
        }),
        expect.objectContaining({
          who: 'E2',
          position: '反对一刀切禁行'
        })
      ])
    );
    expect(consensus?.content).toContain('沈清和');
    expect(consensus?.content).toContain('周景行');
    expect(consensus?.participants).toEqual(['E1', 'E3']);
    expect(consensus?.evidence).toEqual([4, 5]);
    expect(consensus?.content).not.toMatch(/[“”…]|[CD]\d/u);
    expect(result.text).not.toMatch(/新人|岗位|编程|代码|效率收益/u);
  });

  it('总结基于实际发言与洞察，不把未发言嘉宾观点归属给本人', async () => {
    const provider = createMockProvider({
      latencyMs: 0,
      streamDelayMs: 0
    });
    const actualUtterances = [
      utteranceEntry(
        1,
        'H',
        'opening',
        null,
        `今天讨论“${fuelTopic}”。`
      ),
      utteranceEntry(
        2,
        'E1',
        'statement',
        null,
        '应先完善公交替代线路，再按区域讨论限行。'
      ),
      utteranceEntry(
        3,
        'E2',
        'rebut',
        'E1',
        '如果替代交通还没到位，一刀切会加重长距离通勤负担。'
      ),
      utteranceEntry(
        4,
        'E1',
        'rebut',
        'E2',
        '你指出的通勤差异，需要纳入分区评估。'
      )
    ];
    const insight = makeTestInsight({
      id: 'summary-divergence',
      discussionId: 'summary-context',
      kind: 'divergence',
      content: '禁行范围需与替代交通供给一并评估',
      stances: [
        { participantId: fuelAliasMap.E1, position: '支持分区推进' },
        { participantId: fuelAliasMap.E2, position: '反对一刀切' }
      ],
      evidenceSeqs: [2, 3],
      updatedAtSeq: 3
    });
    const prompt = buildSummaryPrompt({
      ...fuelDiscussion(actualUtterances.map(transcriptLine).join('\n'), [
        insight
      ])
    });
    const result = await provider.complete(
      request('summary', prompt.context, 'summary-context')
    );
    const paragraphs = result.text
      .split(/\r?\n\s*\r?\n/u)
      .filter((paragraph) => paragraph.trim());

    expect(result.text).toContain('城市是否应该全面禁止燃油车');
    expect(result.text).toContain('沈清和');
    expect(result.text).toContain('顾南乔');
    expect(result.text).toContain(insight.content);
    expect(result.text).not.toMatch(
      /(?:周景行|唐知意)(?:提到|认为|指出|主张)/u
    );
    expect(result.text).not.toMatch(/新人|岗位|编程|代码/u);
    expect(result.text).not.toMatch(/[“”…]|[CD]\d/u);
    expect(paragraphs).toHaveLength(4);
  });

  it('无共识洞察时总结将第三段写成开放问题且不出现共识字样', async () => {
    const provider = createMockProvider({
      latencyMs: 0,
      streamDelayMs: 0
    });
    const transcript = [
      utteranceEntry(
        1,
        'E1',
        'statement',
        null,
        '支持先完善公交替代线路。'
      ),
      utteranceEntry(
        2,
        'E2',
        'rebut',
        'E1',
        '反对在条件不足时一刀切禁行。'
      )
    ]
      .map(transcriptLine)
      .join('\n');
    const prompt = buildSummaryPrompt(fuelDiscussion(transcript));
    const result = await provider.complete(
      request('summary', prompt.context, 'summary-without-consensus')
    );
    const paragraphs = result.text
      .split(/\r?\n\s*\r?\n/u)
      .filter((paragraph) => paragraph.trim());

    expect(paragraphs).toHaveLength(4);
    expect(paragraphs[2]).toMatch(/还需核实|仍待回答|接下来应确认|下一步应查明/u);
    expect(result.text).not.toContain('共识');
    expect(result.text).not.toMatch(/[“”…]|[CD]\d/u);
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
        const withoutQuotes = text.replace(/“[^”]*”/gu, '');
        expect(withoutQuotes).not.toContain('…');
        for (const match of text.matchAll(/“([^”]*)”/gu)) {
          const rawQuote = match[1] ?? '';
          const quote = rawQuote.endsWith('…')
            ? rawQuote.slice(0, -1)
            : rawQuote;
          expect(quote).not.toMatch(/[“”]/u);
          expect(Array.from(quote).length).toBeGreaterThanOrEqual(4);
          expect(
            roster.some(({ name }) => quote.includes(name))
          ).toBe(false);
          expect(quote).not.toContain(topic.replace(/[?？]/gu, ''));
          expect(boilerplate.some((phrase) => quote.includes(phrase))).toBe(
            false
          );
          expect(sourceUtterances.some((source) => source.includes(quote))).toBe(
            true
          );
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
});
