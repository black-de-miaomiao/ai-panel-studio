import {
  EXPERT_PALETTE,
  HOST_COLOR,
  type Discussion,
  type DiscussionSnapshot,
  type Insight,
  type Participant,
  type Utterance
} from '@aps/shared';

const FIXTURE_TIME = new Date(Date.now() - 3 * 60_000).toISOString();
const TOPIC = 'AI 助手进入企业客服，应该先从哪里开始？';

const EXPERTS = [
  {
    name: '周明',
    profession: '服务设计师',
    title: '服务设计顾问',
    stance: '支持从规则清晰、风险较低的客服场景开始试点。',
    stanceTag: '谨慎乐观',
    persona: '重视流程设计、服务效率与用户体验。'
  },
  {
    name: '陈澄',
    profession: '消费者研究员',
    title: '用户研究负责人',
    stance: '担心复杂问题中的误答会削弱用户信任。',
    stanceTag: '审慎',
    persona: '关注消费者体验、申诉机制与服务公平。'
  },
  {
    name: '顾言',
    profession: '服务运营专家',
    title: '客户体验顾问',
    stance: '认为自动化能释放人工处理复杂问题的时间。',
    stanceTag: '支持',
    persona: '关注知识库维护、运营质量与服务指标。'
  },
  {
    name: '沈禾',
    profession: '数字伦理研究员',
    title: '负责任 AI 研究员',
    stance: '主张明确告知用户，并保留随时转人工的路径。',
    stanceTag: '警惕',
    persona: '关注用户知情权、责任边界和人工保障。'
  },
  {
    name: '许闻溪',
    profession: '交互设计师',
    title: '对话体验设计师',
    stance: '支持以清晰的退出入口降低自动化带来的摩擦。',
    stanceTag: '有条件支持',
    persona: '重视信息可见性和复杂流程中的可恢复性。'
  },
  {
    name: '江知礼',
    profession: '数据治理顾问',
    title: '服务数据治理顾问',
    stance: '认为试点前应先建立可追溯的答案维护机制。',
    stanceTag: '中立',
    persona: '关注数据来源、版本治理与责任闭环。'
  }
] as const;

interface FixtureOptions {
  fixtureNo: number;
  topic?: string;
  expertCount?: number;
  status?: Discussion['status'];
  source?: Discussion['source'];
  viewerCount?: number;
  turnCount?: number;
  summary?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

function id(prefix: string, serial: number): string {
  return `${prefix}-0000-4000-8000-${String(serial).padStart(12, '0')}`;
}

export function createParticipants(
  discussionId: string,
  fixtureNo: number,
  expertCount = 4,
  lineupOffset = 0
): Participant[] {
  const host: Participant = {
    id: id('20000000', fixtureNo * 100 + 1),
    discussionId,
    role: 'host',
    seat: 0,
    name: '林知远',
    profession: '访谈主持',
    title: '圆桌主持人',
    stance: '保持开放，帮助各方把观点说清楚并形成可执行的下一步。',
    stanceTag: '引导',
    persona: '善于倾听、追问和串联不同立场。',
    color: HOST_COLOR,
    avatar: '林',
    agentState: 'idle',
    agentIntent: null,
    focus: null,
    speakCount: 0
  };
  const experts = Array.from({ length: expertCount }, (_, index) => {
    const expert =
      EXPERTS[(index + lineupOffset) % EXPERTS.length] ?? EXPERTS[index];
    if (!expert) throw new Error('未找到演示专家资料。');
    return {
      id: id('20000000', fixtureNo * 100 + index + 2),
      discussionId,
      role: 'expert' as const,
      seat: index + 1,
      ...expert,
      color: EXPERT_PALETTE[index] ?? EXPERT_PALETTE[0],
      avatar: expert.name.slice(0, 1),
      agentState: 'idle' as const,
      agentIntent: null,
      focus: null,
      speakCount: 0
    };
  });
  return [host, ...experts];
}

export function createLineupSnapshot(
  options: FixtureOptions
): DiscussionSnapshot {
  const {
    fixtureNo,
    topic = TOPIC,
    expertCount = 4,
    status = 'lineup_ready',
    source = 'seed',
    viewerCount = 0,
    turnCount = 0,
    summary = null,
    createdAt = FIXTURE_TIME,
    updatedAt = FIXTURE_TIME
  } = options;
  const discussionId = id('10000000', fixtureNo);
  const isStarted = status === 'live' || status === 'paused' || status === 'ended';
  const discussion: Discussion = {
    id: discussionId,
    topic,
    expertCount,
    status,
    maxTurns: 16,
    turnCount,
    summary,
    errorMessage: status === 'failed' ? '暂时无法生成阵容，请稍后重试。' : null,
    source,
    createdAt,
    updatedAt,
    startedAt: isStarted ? createdAt : null,
    endedAt: status === 'ended' ? updatedAt : null
  };

  return {
    discussion,
    participants: createParticipants(discussionId, fixtureNo, expertCount),
    utterances: [],
    insights: [],
    liveUtterance: null,
    lastEventSeq: 0,
    viewerCount
  };
}

function makeUtterance(
  fixtureNo: number,
  discussionId: string,
  participantId: string,
  seq: number,
  act: Utterance['act'],
  content: string
): Utterance {
  return {
    id: id('30000000', fixtureNo * 100 + seq),
    discussionId,
    participantId,
    seq,
    act,
    replyToParticipantId: null,
    content,
    createdAt: new Date(Date.parse(FIXTURE_TIME) + seq * 60_000).toISOString()
  };
}

function makeLobbyInsight(
  fixtureNo: number,
  discussionId: string,
  first: Participant,
  second: Participant,
  status: Insight['status'] = 'active'
): Insight {
  return {
    id: id('40000000', fixtureNo * 10 + 1),
    discussionId,
    kind: 'consensus',
    content: '先从规则清晰、风险较低的问题开始试点。',
    status,
    stances: [
      { participantId: first.id, position: '支持限定问题范围' },
      { participantId: second.id, position: '认可先保障转人工路径' }
    ],
    evidenceSeqs: [2, 3],
    updatedAtSeq: 3,
    createdAt: '2026-04-15T09:03:00.000Z',
    updatedAt: '2026-04-15T09:03:00.000Z'
  };
}

export function createShowcaseSnapshot(
  fixtureNo: number,
  status: 'live' | 'paused' | 'ended',
  topic = TOPIC
): DiscussionSnapshot {
  const summary =
    status === 'ended'
      ? '本场讨论认为，客服自动化可以从规则清晰、风险较低的问题开始验证。\n\n专家认同需要清晰的人工升级路径，并建议保留答案来源和复核机制。\n\n复杂问题中的用户信任仍需持续观察。'
      : null;
  const snapshot = createLineupSnapshot({
    fixtureNo,
    topic,
    status,
    source: 'seed',
    viewerCount: status === 'live' ? 28 : 0,
    turnCount: status === 'ended' ? 3 : 2,
    summary,
    updatedAt:
      status === 'ended'
        ? new Date(Date.now() - 5 * 24 * 60 * 60_000).toISOString()
        : FIXTURE_TIME
  });
  const host = snapshot.participants[0];
  const first = snapshot.participants[1];
  const second = snapshot.participants[2];
  const third = snapshot.participants[3];
  if (!host || !first || !second || !third) return snapshot;

  const utterances = [
    makeUtterance(
      fixtureNo,
      snapshot.discussion.id,
      host.id,
      1,
      'opening',
      '今晚我们从企业客服的真实场景出发，讨论自动化可以先走多远。'
    ),
    makeUtterance(
      fixtureNo,
      snapshot.discussion.id,
      first.id,
      2,
      'statement',
      '我建议从规则明确、答案可核验的重复咨询开始试点。'
    ),
    makeUtterance(
      fixtureNo,
      snapshot.discussion.id,
      second.id,
      3,
      'rebut',
      '复杂问题中的误答风险不能被忽略，转人工路径应当先准备好。'
    )
  ];
  if (status === 'ended') {
    utterances.push(
      makeUtterance(
        fixtureNo,
        snapshot.discussion.id,
        host.id,
        4,
        'closing',
        summary ?? '讨论建议从低风险场景开始，并保留人工保障。'
      )
    );
  }

  const speakCounts = new Map<string, number>();
  for (const utterance of utterances) {
    speakCounts.set(
      utterance.participantId,
      (speakCounts.get(utterance.participantId) ?? 0) + 1
    );
  }
  snapshot.participants = snapshot.participants.map((participant) => ({
    ...participant,
    speakCount: speakCounts.get(participant.id) ?? 0
  }));
  snapshot.utterances = utterances;
  snapshot.insights = [
    makeLobbyInsight(
      fixtureNo,
      snapshot.discussion.id,
      first,
      second,
      status === 'ended' ? 'resolved' : 'active'
    ),
    {
      id: id('40000000', fixtureNo * 10 + 2),
      discussionId: snapshot.discussion.id,
      kind: 'divergence',
      content: '自动化效率是否足以抵消复杂问题中的信任风险？',
      status: 'active',
      stances: [
        { participantId: first.id, position: '限定边界后可逐步验证效率' },
        { participantId: second.id, position: '复杂问题仍应优先保障信任' }
      ],
      evidenceSeqs: [2, 3],
      updatedAtSeq: 3,
      createdAt: '2026-04-15T09:03:00.000Z',
      updatedAt: '2026-04-15T09:03:00.000Z'
    }
  ];
  snapshot.lastEventSeq = status === 'ended' ? 13 : 9;
  if (status === 'live') {
    snapshot.liveUtterance = {
      utteranceId: id('30000000', fixtureNo * 100 + 5),
      participantId: third.id,
      act: 'supplement',
      replyToParticipantId: second.id,
      seq: 5,
      text: '我想把人工升级的触发条件也放进试点设计…'
    };
    snapshot.participants = snapshot.participants.map((participant) =>
      participant.id === third.id
        ? {
            ...participant,
            agentState: 'speaking',
            agentIntent: null
          }
        : participant
    );
  }
  return snapshot;
}

export function createDemoSnapshot(): DiscussionSnapshot {
  return createLineupSnapshot({
    fixtureNo: 90,
    topic: TOPIC,
    expertCount: 4,
    status: 'lineup_ready',
    source: 'seed',
    viewerCount: 28
  });
}

export function createLobbySnapshots(): DiscussionSnapshot[] {
  return [
    createShowcaseSnapshot(11, 'live'),
    createShowcaseSnapshot(12, 'paused', '远程办公会全面取代坐班吗？'),
    createLineupSnapshot({
      fixtureNo: 13,
      topic: '公共服务窗口适合引入智能预约吗？',
      status: 'lineup_ready',
      expertCount: 4,
      source: 'user',
      updatedAt: new Date(Date.now() - 18 * 60_000).toISOString()
    }),
    createLineupSnapshot({
      fixtureNo: 14,
      topic: '生成式 AI 应如何进入大学课堂？',
      status: 'failed',
      expertCount: 3,
      source: 'user',
      updatedAt: new Date(Date.now() - 42 * 60_000).toISOString()
    }),
    createShowcaseSnapshot(15, 'ended', '远程办公会全面取代坐班吗？')
  ];
}
