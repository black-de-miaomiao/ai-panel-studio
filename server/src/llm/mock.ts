import type { LLMProvider, LLMRequest } from './types';

interface SpeakerProfile {
  name: string;
  profession: string;
  title: string;
  stance: string;
  stanceTag: string;
  persona: string;
}

interface MockContext extends Record<string, unknown> {
  topic?: string;
  expertCount?: number;
  speakerAlias?: string;
  replyToAlias?: string | null;
  action?: string;
  act?: string;
  transcriptWindow?: string;
  recentTranscript?: unknown;
  newUtterances?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readContext(value: unknown): MockContext {
  return isRecord(value) ? value : {};
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function readTranscript(context: MockContext): string[] {
  if (typeof context.transcriptWindow === 'string') {
    return context.transcriptWindow.split(/\r?\n/u).filter(Boolean);
  }
  const candidate = context.recentTranscript;
  if (Array.isArray(candidate)) {
    return candidate.filter((line): line is string => typeof line === 'string');
  }
  return [];
}

function readLastSpeakerAlias(line: string | undefined): string | null {
  if (!line) {
    return null;
  }
  return line.match(/^#\d+\s+([^\s]+)/u)?.[1] ?? null;
}

function readLastSpeakerName(line: string | undefined): string | null {
  if (!line) {
    return null;
  }
  return line.match(/^#\d+\s+\S+\s+([^（:：]+)/u)?.[1]?.trim() ?? null;
}

function readLastContent(line: string | undefined): string {
  if (!line) {
    return '';
  }
  const separator = line.indexOf('：');
  return separator >= 0 ? line.slice(separator + 1).trim() : line;
}

function isExpertAlias(value: unknown): value is string {
  return typeof value === 'string' && /^E\d+$/u.test(value);
}

function topicProfiles(topic: string): SpeakerProfile[] {
  if (/程序|编程|开发|代码|软件/u.test(topic)) {
    return [
      {
        name: '陈澄',
        profession: '软件工程师',
        title: '应用开发负责人',
        stance: '支持把助手用于重复编码，但新人仍需参与调试和评审。',
        stanceTag: '有条件支持',
        persona: '长期带领产品研发团队，表达直接，习惯用交付流程解释问题。'
      },
      {
        name: '周明',
        profession: '初级程序员导师',
        title: '工程教育顾问',
        stance: '担心基础任务减少会压缩新人练习和成长的入口。',
        stanceTag: '谨慎',
        persona: '关注新人培养与代码阅读，先讲学习机制，再给具体练习例子。'
      },
      {
        name: '顾言',
        profession: '劳动经济研究员',
        title: '数字就业研究员',
        stance: '认为岗位会重组，但是否减少取决于需求增长和团队分工。',
        stanceTag: '审慎乐观',
        persona: '研究技术变迁与就业结构，表达克制，会区分短期替代和长期变化。'
      },
      {
        name: '唐宁',
        profession: '职业教育教师',
        title: '软件人才培养负责人',
        stance: '反对把代码生成能力直接当作初级岗位的替代品。',
        stanceTag: '反对',
        persona: '负责项目式教学，语气平实，常用课堂训练和实习安排举例。'
      },
      {
        name: '许闻溪',
        profession: 'AI 产品经理',
        title: '开发工具产品负责人',
        stance: '支持逐步采用，但要求明确人工复核和责任边界。',
        stanceTag: '支持',
        persona: '熟悉开发工具落地，表达清楚，强调可验证的产品机制。'
      },
      {
        name: '林舟',
        profession: '研发效能顾问',
        title: '企业工程效能顾问',
        stance: '对岗位总量保持中立，重点观察团队是否增加有效需求。',
        stanceTag: '中立',
        persona: '服务多家研发团队，喜欢拆解指标，避免用单一效率数字下结论。'
      }
    ];
  }

  if (/客服|服务|用户|消费者/u.test(topic)) {
    return [
      {
        name: '林知夏',
        profession: '服务设计师',
        title: '客户体验顾问',
        stance: '支持从规则清晰、低风险的服务环节试点。',
        stanceTag: '支持',
        persona: '关注服务流程和体验落差，表达具体，善于追问边界条件。'
      },
      {
        name: '沈予安',
        profession: '消费者研究员',
        title: '用户研究负责人',
        stance: '担心复杂问题中的信任和人工升级路径被削弱。',
        stanceTag: '审慎',
        persona: '长期研究消费者权益，说话温和但会紧扣真实使用情境。'
      },
      {
        name: '许行之',
        profession: '客户运营专家',
        title: '服务运营负责人',
        stance: '有条件支持，前提是人工可以及时接手疑难问题。',
        stanceTag: '有条件支持',
        persona: '负责一线服务运营，习惯从交接流程和异常处理谈问题。'
      },
      {
        name: '程望舒',
        profession: '劳动关系研究员',
        title: '数字化转型研究员',
        stance: '反对用自动化速度代替服务质量和员工保障评估。',
        stanceTag: '反对',
        persona: '研究组织转型与工作质量，表达谨慎，重视可观察的长期影响。'
      },
      {
        name: '周以宁',
        profession: '信息安全顾问',
        title: '数据治理顾问',
        stance: '支持有限试点，同时要求数据访问和责任边界清楚。',
        stanceTag: '支持',
        persona: '熟悉服务数据治理，讲话简洁，常用权限和审计机制说明风险。'
      },
      {
        name: '顾行舟',
        profession: '产品研究员',
        title: '智能服务产品研究员',
        stance: '保持中立，主张先比较不同问题类型的实际效果。',
        stanceTag: '中立',
        persona: '重视实验设计，表达条理清晰，不轻易把局部结果推广到所有场景。'
      }
    ];
  }

  return [
    {
      name: '沈清和',
      profession: '行业分析师',
      title: '产业发展研究员',
      stance: '支持在可控范围内先验证实际收益。',
      stanceTag: '支持',
      persona: '长期研究产业变化，表达简洁，习惯提出可以验证的条件。'
    },
    {
      name: '顾南乔',
      profession: '社会学研究者',
      title: '社会影响研究员',
      stance: '担心效率提升掩盖不同群体承担的成本。',
      stanceTag: '审慎',
      persona: '关注社会影响和利益分配，语气平和，会追问谁受益、谁承担风险。'
    },
    {
      name: '周景行',
      profession: '政策顾问',
      title: '公共政策研究员',
      stance: '有条件支持，前提是建立清楚的评估与纠偏机制。',
      stanceTag: '有条件支持',
      persona: '熟悉政策实施与评估，表达严谨，会拆解执行条件。'
    },
    {
      name: '林予川',
      profession: '一线从业者',
      title: '实践项目负责人',
      stance: '反对仓促推广，认为现场经验不能被抽象指标取代。',
      stanceTag: '反对',
      persona: '长期参与具体项目，表达直白，常用一线流程和真实约束举例。'
    },
    {
      name: '唐知意',
      profession: '数据分析师',
      title: '应用评估负责人',
      stance: '支持小范围试点，但要求把结果和不确定性同时公开。',
      stanceTag: '谨慎乐观',
      persona: '擅长评估方法，讲话克制，强调样本范围和结论边界。'
    },
    {
      name: '许闻溪',
      profession: '风险治理专家',
      title: '风险管理顾问',
      stance: '保持中立，建议先明确失败时的责任和补救方式。',
      stanceTag: '中立',
      persona: '关注风险预案，表达清楚，喜欢把讨论落到应急机制。'
    }
  ];
}

function buildLineup(
  context: MockContext,
  request: LLMRequest,
  callIndex: number
): unknown {
  const topic = readString(context.topic, request.user);
  const profiles = topicProfiles(topic);
  const requestedCount = context.expertCount;
  const expertCount =
    typeof requestedCount === 'number' &&
    Number.isInteger(requestedCount) &&
    requestedCount >= 2 &&
    requestedCount <= 6
      ? requestedCount
      : 4;
  const experts = Array.from({ length: expertCount }, (_, index) => {
    const profile = profiles[index];
    return profile ? { ...profile } : profiles[0];
  }).filter((profile): profile is SpeakerProfile => profile !== undefined);
  const hostNames = ['林知远', '周予安', '顾清和'] as const;

  return {
    host: {
      name: hostNames[callIndex % hostNames.length] ?? hostNames[0],
      profession: '圆桌主持人',
      title: '公共议题主持人',
      stance: '保持中立，帮助嘉宾把分歧与条件说清楚。',
      stanceTag: '引导',
      persona: '善于倾听和串联观点，追问具体机制，不替嘉宾表达立场。'
    },
    experts
  };
}

function buildBid(context: MockContext, callIndex: number): unknown {
  const transcript = readTranscript(context);
  const lastLine = transcript.at(-1);
  const speakerAlias = readString(context.speakerAlias, 'E1');
  const lastSpeakerAlias = readLastSpeakerAlias(lastLine);
  const addressed =
    context.addressed === true ||
    context.wasAddressed === true ||
    context.isAddressed === true;
  const wantsToSpeak = addressed || lastSpeakerAlias !== speakerAlias;
  const replyTo =
    lastSpeakerAlias && lastSpeakerAlias !== speakerAlias
      ? lastSpeakerAlias
      : isExpertAlias(context.replyToAlias)
        ? context.replyToAlias
        : null;
  const intents = ['rebut', 'supplement', 'raise_hand', 'interrupt'] as const;
  const intent = intents[callIndex % intents.length] ?? 'raise_hand';
  const lastContent = readLastContent(lastLine);
  const focus =
    /成本|预算/u.test(lastContent)
      ? '回应成本承担边界'
      : /人工|升级/u.test(lastContent)
        ? '补充人工接手机制'
        : /新人|岗位/u.test(lastContent)
          ? '回应新人训练入口'
          : '说明试点适用条件';

  return {
    wantToSpeak: wantsToSpeak,
    intent,
    urgency: intent === 'interrupt' ? 0.84 : intent === 'rebut' ? 0.72 : 0.58,
    replyTo,
    focus
  };
}

function buildUtterance(context: MockContext, callIndex: number): string {
  const transcript = readTranscript(context);
  const lastLine = transcript.at(-1);
  const targetAlias = readString(context.replyToAlias, '');
  const targetName =
    targetAlias && readLastSpeakerAlias(lastLine) === targetAlias
      ? readLastSpeakerName(lastLine)
      : null;
  const greeting = targetName ? `${targetName}，` : '';
  const act = readString(context.act, 'statement');
  const topic = readString(context.topic);
  const topicFragment = topic ? `围绕“${topic}”，` : '';
  const variations = [
    '还要看新人能否独立定位错误，而不只是生成速度。',
    '关键是把复核责任和练习机会一起设计进去。',
    '这需要用真实任务验证，不能只比较完成时间。'
  ];
  const variation = variations[callIndex % variations.length] ?? variations[0];

  if (act === 'rebut') {
    return `${greeting}基础任务变少不等于培养入口消失；团队仍要安排可复盘的真实练习。`;
  }
  if (act === 'supplement') {
    return `${greeting}还需要补上明确的人工复核和责任边界，否则效率提升未必能变成可靠交付。`;
  }
  if (act === 'interrupt') {
    return `等一下，${topicFragment}不能把生成速度直接等同于岗位消失；${variation}`;
  }
  return `${topicFragment}更实际的衡量点是新人能否独立定位错误。${variation}`;
}

function buildHost(context: MockContext, callIndex: number): string {
  const action = readString(context.action, 'opening');
  const targetAlias = readString(context.targetAlias, '');
  const transcript = readTranscript(context);
  const lastLine = transcript.at(-1);
  const targetName = readLastSpeakerName(lastLine);
  const topic = readString(context.topic, '今天的讨论议题');
  const name = targetAlias && targetName ? targetName : '这位嘉宾';

  if (action === 'opening') {
    return `欢迎来到圆桌现场，今天讨论“${topic}”。嘉宾将从工程实践、学习路径和用工变化等角度展开。`;
  }
  if (action === 'bridge') {
    return `目前的分歧集中在效率收益与新人训练能否兼得，${name}，你怎么看对方提出的条件？`;
  }
  if (action === 'invite') {
    return `${name}，结合你的专业背景，哪类任务最适合作为新人练习的起点？`;
  }
  if (action === 'closing') {
    return `今天先把争议留在桌面上，后续还需要用真实项目检验这些条件。`;
  }
  const questions = [
    '你能举一个最适合先验证的具体任务吗？',
    '如果新人要保留练习机会，团队需要先改变哪一步？',
    '你认为怎样的评估结果才足以支持扩大试点？'
  ];
  const question = questions[callIndex % questions.length] ?? questions[0];
  return `${name}，你刚才的观点里，哪项条件最可能改变实际结果？${question}`;
}

function buildInsights(context: MockContext): unknown {
  const utterances = Array.isArray(context.newUtterances)
    ? context.newUtterances.filter(isRecord)
    : [];
  const consensus: Array<Record<string, unknown>> = [];
  const divergences: Array<Record<string, unknown>> = [];

  for (const utterance of utterances) {
    const speakerAlias = utterance.speakerAlias;
    const replyToAlias = utterance.replyToAlias;
    const seq = utterance.seq;
    const act = utterance.act;
    if (
      !isExpertAlias(speakerAlias) ||
      !isExpertAlias(replyToAlias) ||
      speakerAlias === replyToAlias ||
      typeof seq !== 'number' ||
      !Number.isInteger(seq) ||
      seq <= 0
    ) {
      continue;
    }
    const evidence =
      utterances
        .filter(
          (candidate) =>
            candidate.speakerAlias === speakerAlias ||
            candidate.speakerAlias === replyToAlias
        )
        .map((candidate) => candidate.seq)
        .filter(
          (candidateSeq): candidateSeq is number =>
            typeof candidateSeq === 'number' && Number.isInteger(candidateSeq)
        )
        .sort((left, right) => left - right) || [seq];

    if (act === 'rebut' || act === 'interrupt') {
      divergences.push({
        ref: null,
        content: '效率收益与训练机会应如何兼顾',
        stances: [
          { who: speakerAlias, position: '先验证效率收益' },
          { who: replyToAlias, position: '优先保留训练机会' }
        ],
        evidence,
        resolved: false
      });
    } else if (act === 'supplement') {
      consensus.push({
        ref: null,
        content: '试点需要设置清楚的人工复核条件',
        participants: [speakerAlias, replyToAlias],
        evidence
      });
    }
  }

  return { consensus, divergences };
}

function buildSummary(context: MockContext): string {
  const topic = readString(context.topic, '本场讨论的话题');
  const insightText = readString(
    context.insightsText,
    readString(context.existingInsightsText)
  );
  const transcript = readTranscript(context);
  const lastContent = readLastContent(transcript.at(-1));
  const discussionLine = lastContent
    ? `讨论也落到具体执行上，最新发言提醒大家关注“${lastContent.slice(0, 45)}”。`
    : '嘉宾从实践条件、长期影响和风险边界展开了讨论。';
  const insightsLine = insightText
    ? '实时洞察记录了部分共识与分歧，仍需结合后续实践继续检验。'
    : '主要共识是先明确试点范围，关键分歧仍在于效率收益与训练机会如何平衡。';

  return `围绕“${topic}”，嘉宾讨论了技术变化会怎样影响初级岗位，以及哪些工作仍需要人的判断。\n\n${discussionLine}\n\n${insightsLine}\n\n后续仍要观察真实项目中的质量、培养效果和岗位需求变化。感谢各位嘉宾，也感谢观众收看。`;
}

function generateText(
  request: LLMRequest,
  context: MockContext,
  callIndex: number
): string {
  switch (request.task) {
    case 'lineup':
      return JSON.stringify(buildLineup(context, request, callIndex));
    case 'bid':
      return JSON.stringify(buildBid(context, callIndex));
    case 'utterance':
      return buildUtterance(context, callIndex);
    case 'host':
      return buildHost(context, callIndex);
    case 'insights':
      return JSON.stringify(buildInsights(context));
    case 'summary':
      return buildSummary(context);
  }
}

function sleep(ms: number): Promise<void> {
  return ms > 0
    ? new Promise((resolve) => setTimeout(resolve, ms))
    : Promise.resolve();
}

export function createMockProvider(opts: {
  latencyMs?: number;
  streamDelayMs?: number;
  failOn?: (request: LLMRequest) => boolean;
} = {}): LLMProvider {
  const latencyMs = Math.max(0, opts.latencyMs ?? 400);
  const streamDelayMs = Math.max(0, opts.streamDelayMs ?? 30);
  const callCounts = new Map<string, number>();

  const createResponse = (
    request: LLMRequest & { model: string }
  ): { text: string; promptTokens: number; completionTokens: number } => {
    if (opts.failOn?.(request)) {
      throw new Error('模拟大模型调用失败');
    }
    const key = `${request.discussionId ?? 'default'}:${request.task}`;
    const callIndex = callCounts.get(key) ?? 0;
    callCounts.set(key, callIndex + 1);
    const context = readContext(request.context);
    const text = generateText(request, context, callIndex);
    return {
      text,
      promptTokens: Math.ceil((request.system.length + request.user.length) / 4),
      completionTokens: Math.ceil(text.length / 4)
    };
  };

  return {
    name: 'mock',
    async complete(request) {
      await sleep(latencyMs);
      const response = createResponse(request);
      return {
        text: response.text,
        usage: {
          promptTokens: response.promptTokens,
          completionTokens: response.completionTokens
        }
      };
    },
    async *stream(request) {
      await sleep(latencyMs);
      const response = createResponse(request);
      const characters = Array.from(response.text);
      let offset = 0;
      let chunkIndex = 0;
      while (offset < characters.length) {
        const chunkSize = 2 + (chunkIndex % 3);
        yield characters.slice(offset, offset + chunkSize).join('');
        offset += chunkSize;
        chunkIndex += 1;
        await sleep(streamDelayMs);
      }
      try {
        request.onUsage?.({
          promptTokens: response.promptTokens,
          completionTokens: response.completionTokens
        });
      } catch {
        // Usage reporting does not alter mock output.
      }
    }
  };
}
