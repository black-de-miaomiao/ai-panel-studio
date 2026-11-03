import type {
  DiscussionSnapshot,
  Insight,
  Participant,
  StreamEvent,
  Utterance
} from '@aps/shared';
import { initState, reduce } from '../state/discussionReducer';
import { createDemoSnapshot } from './fixtures';

export interface MockFrame {
  event: StreamEvent;
  eventSeq?: number;
  delayMs: number;
}

interface DialogueLine {
  participantId: string;
  act: Utterance['act'];
  text: string;
  replyToParticipantId?: string | null;
}

const insightId = (serial: number) =>
  `70000000-0000-4000-8000-${String(serial).padStart(12, '0')}`;
const utteranceId = (serial: number) =>
  `60000000-0000-4000-8000-${String(serial).padStart(12, '0')}`;

function chunkText(text: string, size = 10): string[] {
  const characters = Array.from(text);
  const chunks: string[] = [];
  for (let index = 0; index < characters.length; index += size) {
    chunks.push(characters.slice(index, index + size).join(''));
  }
  return chunks;
}

function makeInsight(
  discussionId: string,
  serial: number,
  kind: Insight['kind'],
  content: string,
  first: Participant,
  firstPosition: string,
  second: Participant,
  secondPosition: string,
  evidenceSeqs: number[],
  updatedAtSeq: number,
  status: Insight['status'],
  at: string
): Insight {
  return {
    id: insightId(serial),
    discussionId,
    kind,
    content,
    status,
    stances: [
      { participantId: first.id, position: firstPosition },
      { participantId: second.id, position: secondPosition }
    ],
    evidenceSeqs,
    updatedAtSeq,
    createdAt: at,
    updatedAt: at
  };
}

function insightStages(
  discussionId: string,
  experts: Participant[],
  at: string
): {
  initial: Insight[];
  operational: Insight[];
  disclosure: Insight[];
  resolved: Insight[];
} {
  const [first, second, third, fourth] = experts;
  if (!first || !second || !third || !fourth) {
    throw new Error('演示剧本至少需要四位专家。');
  }
  const consensus = makeInsight(
    discussionId,
    1,
    'consensus',
    '试点应限定在可核验的问题，并提前准备人工升级路径。',
    first,
    '先从规则清晰的问题开始',
    second,
    '误答后要能快速转人工',
    [2, 3, 4],
    4,
    'active',
    at
  );
  const activeDivergence = makeInsight(
    discussionId,
    2,
    'divergence',
    '复杂问题的自动化能否兼顾效率与用户信任？',
    first,
    '限定边界后可以逐步验证',
    second,
    '复杂问题应优先保障信任',
    [3, 4],
    4,
    'active',
    at
  );
  const operationalConsensus = makeInsight(
    discussionId,
    3,
    'consensus',
    '人工入口应明显可见，并能承接已有对话上下文。',
    third,
    '固定入口可承接复杂咨询',
    first,
    '转人工时保留上下文',
    [9, 11],
    11,
    'active',
    at
  );
  const disclosureConsensus = makeInsight(
    discussionId,
    4,
    'consensus',
    '面向用户的自动化试点需要清楚说明处理方式。',
    fourth,
    '应明确告知自动助手身份',
    second,
    '权益相关答复应允许复核',
    [14, 15],
    15,
    'active',
    at
  );
  const resolvedDivergence = makeInsight(
    discussionId,
    2,
    'divergence',
    '复杂问题应由人工优先处理，自动化聚焦可核验场景。',
    first,
    '复杂咨询转人工，自动化留在可核验范围',
    second,
    '复杂问题优先保障信任与复核',
    [3, 4, 12, 16],
    16,
    'resolved',
    at
  );

  return {
    initial: [consensus, activeDivergence],
    operational: [consensus, activeDivergence, operationalConsensus],
    disclosure: [
      consensus,
      activeDivergence,
      operationalConsensus,
      disclosureConsensus
    ],
    resolved: [
      consensus,
      operationalConsensus,
      disclosureConsensus,
      resolvedDivergence
    ]
  };
}

export function createMockScript(snapshot: DiscussionSnapshot): MockFrame[] {
  const { discussion } = snapshot;
  const host = snapshot.participants.find(
    (participant) => participant.role === 'host'
  );
  const experts = snapshot.participants
    .filter((participant) => participant.role === 'expert')
    .sort((left, right) => left.seat - right.seat);
  const [first, second, third, fourth] = experts;
  if (!host || !first || !second || !third || !fourth) {
    throw new Error('演示剧本至少需要主持人与四位专家。');
  }

  const frames: MockFrame[] = [];
  let durableSeq = 0;
  let utteranceSeq = 0;
  let clock = Date.parse('2026-04-15T09:00:00.000Z');
  const now = () => {
    const at = new Date(clock).toISOString();
    clock += 1_000;
    return at;
  };
  const push = (event: StreamEvent, durable = false, delayMs = 240) => {
    frames.push({
      event,
      ...(durable ? { eventSeq: ++durableSeq } : {}),
      delayMs
    });
  };
  const eventBase = () => ({
    discussionId: discussion.id,
    at: now()
  });

  push(
    {
      ...eventBase(),
      type: 'discussion.status',
      status: 'live',
      turnCount: 0,
      maxTurns: discussion.maxTurns
    },
    true
  );
  push(
    {
      ...eventBase(),
      type: 'lineup.updated',
      participants: snapshot.participants
    },
    true
  );
  push(
    {
      ...eventBase(),
      type: 'viewers.updated',
      viewerCount: snapshot.viewerCount
    },
    false,
    160
  );

  const summary = [
    '今晚我们围绕 AI 助手进入企业客服的起点展开讨论，从试点范围一路谈到用户信任和运营责任。',
    `${first.name}、${second.name}和其他嘉宾都认同，试点应优先落在规则清楚、答案可核验的场景，并把人工升级、复核与答案维护一并设计。`,
    `关键分歧在复杂问题的自动化边界。${first.name}更看重限定范围后逐步验证效率，${second.name}则强调误答、申诉和用户信任不能留到上线后再补。`,
    `接下来仍需验证哪些问题可以安全自动处理，以及人工接手能否顺畅承接上下文。感谢各位嘉宾，也感谢观众来到演播厅。`
  ].join('\n\n');

  const dialogues: DialogueLine[] = [
    {
      participantId: host.id,
      act: 'opening',
      text: '今晚我们从企业客服的真实场景出发，讨论 AI 助手可以先走多远。我们会一起看试点边界、用户信任和运营机制。'
    },
    {
      participantId: first.id,
      act: 'statement',
      text: '我建议先把范围放在规则清楚、答案可核验的重复咨询。像物流进度查询这类常见问题，遇到例外就交给人工。'
    },
    {
      participantId: second.id,
      act: 'rebut',
      replyToParticipantId: first.id,
      text: `${first.name}主张从重复咨询切入，我担心只看问题是否重复还不够。误答后的申诉和转人工路径，也应该在试点前准备好。`
    },
    {
      participantId: first.id,
      act: 'rebut',
      replyToParticipantId: second.id,
      text: `${second.name}担心误答责任，我不认为这必须成为暂缓试点的理由。把置信度低的问题直接转人工，就能把自动化边界说清楚。`
    },
    {
      participantId: third.id,
      act: 'statement',
      text: '运营上还要先确定知识库的维护人和更新频率。否则规则变了，系统仍可能给出过期答案。'
    },
    {
      participantId: host.id,
      act: 'follow_up',
      replyToParticipantId: third.id,
      text: `${third.name}提到知识维护。谁来确认答案仍然有效，更新延迟时又如何让用户知道？`
    },
    {
      participantId: third.id,
      act: 'statement',
      text: '可以由业务团队指定内容负责人，针对高频规则做定期复核。每次变更都留下版本记录，发现异常时优先下线答案。'
    },
    {
      participantId: fourth.id,
      act: 'interrupt',
      replyToParticipantId: third.id,
      text: '等一下，人工升级如果藏得太深，用户可能根本找不到。'
    },
    {
      participantId: third.id,
      act: 'rebut',
      replyToParticipantId: fourth.id,
      text: `${fourth.name}提醒得很重要，但显眼的人工入口不等于所有问题都要人工处理。复杂咨询可以主动提示转接，并保留已经说过的内容。`
    },
    {
      participantId: host.id,
      act: 'bridge',
      replyToParticipantId: first.id,
      text: `关于自动化边界，${first.name}和${fourth.name}都在权衡效率与用户控制。${first.name}，怎样避免用户被困在流程里？`
    },
    {
      participantId: first.id,
      act: 'statement',
      text: '关键不是把所有问题自动化，而是让退出路径始终可见。用户遇到连续误解时，应能一步转给人工并带上上下文。'
    },
    {
      participantId: second.id,
      act: 'supplement',
      replyToParticipantId: first.id,
      text: `我补充${first.name}刚才的退出设计，还要让用户知道哪些内容由系统处理。涉及账户或权益的答复，应说明依据并允许复核。`
    },
    {
      participantId: host.id,
      act: 'invite',
      replyToParticipantId: fourth.id,
      text: `${fourth.name}的观点还可以再展开。请从告知方式和责任边界两个方面补充。`
    },
    {
      participantId: fourth.id,
      act: 'statement',
      text: '我支持先限定在低风险问题，但要明确告知用户正在和自动助手交流。涉及个人权益的决定，不应只由自动回复给出。'
    },
    {
      participantId: second.id,
      act: 'statement',
      text: '消费者更在意遇到问题时有没有可靠的下一步，而不是界面写着多智能。试点期间可以观察转人工是否顺畅、投诉如何处理。'
    },
    {
      participantId: first.id,
      act: 'supplement',
      replyToParticipantId: second.id,
      text: `听完${second.name}强调的复核，我同意复杂咨询应优先转人工；自动化先留在可核验的范围里。接手时保留上下文，才看得出服务摩擦有没有减少。`
    }
  ];

  const stages = insightStages(discussion.id, experts, '2026-04-15T09:03:00.000Z');

  const writeUtterance = (line: DialogueLine, isSummary = false) => {
    const participant = snapshot.participants.find(
      (candidate) => candidate.id === line.participantId
    );
    if (!participant) return;

    const at = now();
    if (participant.role === 'expert') {
      const agentIntent =
        line.act === 'interrupt' ||
        line.act === 'supplement' ||
        line.act === 'rebut'
          ? line.act
          : 'raise_hand';
      push(
        {
          ...eventBase(),
          type: 'participant.state',
          participantId: participant.id,
          agentState: 'preparing',
          agentIntent,
          focus: line.text.slice(0, 40)
        },
        false,
        260
      );
    }

    push(
      {
        ...eventBase(),
        type: 'participant.state',
        participantId: participant.id,
        agentState: 'speaking',
        agentIntent: null,
        focus: null
      },
      false,
      220
    );

    const seq = ++utteranceSeq;
    const id = utteranceId(90_000 + seq);
    push(
      {
        ...eventBase(),
        type: 'utterance.started',
        utteranceId: id,
        participantId: participant.id,
        act: line.act,
        replyToParticipantId: line.replyToParticipantId ?? null,
        seq
      },
      false,
      220
    );
    for (const delta of chunkText(line.text)) {
      push(
        {
          ...eventBase(),
          type: 'utterance.delta',
          utteranceId: id,
          delta
        },
        false,
        isSummary ? 200 : 170
      );
    }
    const utterance: Utterance = {
      id,
      discussionId: discussion.id,
      participantId: participant.id,
      seq,
      act: line.act,
      replyToParticipantId: line.replyToParticipantId ?? null,
      content: line.text,
      createdAt: at
    };
    push(
      {
        ...eventBase(),
        type: 'utterance.completed',
        utterance
      },
      true,
      300
    );
    push(
      {
        ...eventBase(),
        type: 'participant.state',
        participantId: participant.id,
        agentState: 'idle',
        agentIntent: null,
        focus: null
      },
      false,
      220
    );
  };

  writeUtterance(dialogues[0] as DialogueLine);
  let bodyTurn = 0;
  for (let index = 1; index < dialogues.length; index += 1) {
    const line = dialogues[index];
    if (!line) continue;
    writeUtterance(line);
    bodyTurn += 1;
    push(
      {
        ...eventBase(),
        type: 'discussion.status',
        status: 'live',
        turnCount: bodyTurn,
        maxTurns: discussion.maxTurns
      },
      true,
      340
    );

    if (bodyTurn === 3) {
      push(
        {
          ...eventBase(),
          type: 'insights.updated',
          insights: stages.initial
        },
        true,
        420
      );
    } else if (bodyTurn === 6) {
      push(
        {
          ...eventBase(),
          type: 'insights.updated',
          insights: stages.initial
        },
        true,
        420
      );
    } else if (bodyTurn === 11) {
      push(
        {
          ...eventBase(),
          type: 'insights.updated',
          insights: stages.operational
        },
        true,
        420
      );
    } else if (bodyTurn === 14) {
      push(
        {
          ...eventBase(),
          type: 'insights.updated',
          insights: stages.disclosure
        },
        true,
        420
      );
    } else if (bodyTurn === 15) {
      push(
        {
          ...eventBase(),
          type: 'insights.updated',
          insights: stages.resolved
        },
        true,
        420
      );
    }
  }

  push(
    {
      ...eventBase(),
      type: 'discussion.status',
      status: 'summarizing',
      turnCount: bodyTurn,
      maxTurns: discussion.maxTurns
    },
    true,
    420
  );
  const summaryLine: DialogueLine = {
    participantId: host.id,
    act: 'closing',
    text: summary
  };
  writeUtterance(summaryLine, true);
  push(
    {
      ...eventBase(),
      type: 'summary.completed',
      summary
    },
    true,
    320
  );
  push(
    {
      ...eventBase(),
      type: 'discussion.status',
      status: 'ended',
      turnCount: bodyTurn,
      maxTurns: discussion.maxTurns
    },
    true,
    320
  );
  return frames;
}

export function snapshotAtFrame(
  snapshot: DiscussionSnapshot,
  frames: MockFrame[],
  frameIndex: number
): DiscussionSnapshot {
  const cutoff = Math.max(0, Math.min(frames.length, Math.floor(frameIndex)));
  const state = frames
    .slice(0, cutoff)
    .reduce(
      (current, frame) => reduce(current, frame.event, frame.eventSeq),
      initState(snapshot)
    );
  return {
    discussion: state.discussion,
    participants: state.participants,
    utterances: state.utterances,
    insights: state.insights,
    liveUtterance: state.liveUtterance,
    lastEventSeq: state.lastEventSeq,
    viewerCount: state.viewerCount
  };
}

export const MOCK_SCRIPT = createMockScript(createDemoSnapshot());
