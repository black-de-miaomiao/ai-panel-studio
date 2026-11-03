import type { LLMProvider, LLMRequest } from './types';
import { createRng } from '../core/rng';

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
  transcriptWindow?: unknown;
  recentTranscript?: unknown;
  newUtterances?: unknown;
  roster?: unknown;
  speaker?: unknown;
  previousUtterance?: unknown;
  targetAlias?: string | null;
  addressed?: boolean;
  insightsText?: string;
  existingInsightsText?: string;
  divergence?: unknown;
}

interface MockRosterEntry {
  alias: string;
  name: string;
  profession: string;
  title: string;
  stanceTag: string;
  stance: string;
}

interface MockTranscriptEntry {
  seq: number;
  speakerAlias: string;
  speakerName: string;
  act: string;
  replyToAlias: string | null;
  content: string;
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

function topicCore(topic: string): string {
  const normalized = topic
    .trim()
    .replace(/[。！!？?；;：:]+$/gu, '');
  if (Array.from(normalized).length <= 24) {
    return normalized || '本场议题';
  }
  const firstClause = normalized.split(/[，,。！？!?；;：:]/u)[0]?.trim();
  return firstClause || normalized || '本场议题';
}

const STANCE_PREFIX = /^(?:有条件支持|支持|担心|认为|反对|主张|倾向)/u;

function sentencePoint(value: string): string {
  const compact = value.replace(/\s+/gu, ' ').trim();
  const point =
    compact.split(/[，,。！？!?；;：:]/u)[0]?.trim() || '结合实际条件判断';
  return STANCE_PREFIX.test(point) ? point : `认为${point}`;
}

function longestCommonSubstring(left: string, right: string): string {
  const leftCharacters = Array.from(left);
  const rightCharacters = Array.from(right);
  let previous = Array<number>(rightCharacters.length + 1).fill(0);
  let bestLength = 0;
  let bestEnd = 0;

  for (let leftIndex = 1; leftIndex <= leftCharacters.length; leftIndex += 1) {
    const current = Array<number>(rightCharacters.length + 1).fill(0);
    for (
      let rightIndex = 1;
      rightIndex <= rightCharacters.length;
      rightIndex += 1
    ) {
      if (leftCharacters[leftIndex - 1] === rightCharacters[rightIndex - 1]) {
        current[rightIndex] = previous[rightIndex - 1]! + 1;
        if (current[rightIndex]! > bestLength) {
          bestLength = current[rightIndex]!;
          bestEnd = leftIndex;
        }
      }
    }
    previous = current;
  }
  return leftCharacters.slice(bestEnd - bestLength, bestEnd).join('');
}

function shortQuote(
  value: string,
  target: MockRosterEntry,
  roster: readonly MockRosterEntry[],
  topic: string
): string {
  const boilerplate = [
    '我的判断是',
    '我更关注',
    '我关注',
    '我担心',
    '我认为',
    '我支持',
    '我反对',
    '我主张',
    '围绕',
    '关于',
    '对',
    '就',
    '你提到',
    '刚才提到',
    '刚才说',
    '刚才的',
    '提到',
    '回应',
    '接着',
    '顺着',
    '等一下',
    '先停一下',
    '我想立即回应',
    '我得立即回应',
    '当场回应',
    '具体条件',
    '下一步'
  ];
  let fragments = value
    .split(/[“”「」『』"'“”]/u)
    .flatMap((part) => [part]);
  const forbidden = [
    topicCore(topic),
    ...roster.map(({ name }) => name),
    ...roster.map(({ alias }) => alias),
    ...boilerplate
  ].filter(Boolean);
  for (const phrase of forbidden) {
    fragments = fragments.flatMap((fragment) => fragment.split(phrase));
  }
  fragments = fragments.flatMap((fragment) =>
    fragment.split(/[，,。！？!?；;：:、]/u)
  );

  const stance = sentencePoint(target.stance);
  const ranked = fragments
    .map((fragment) => fragment.trim())
    .filter((fragment) => Array.from(fragment).length >= 4)
    .map((fragment) => longestCommonSubstring(fragment, stance))
    .filter((fragment) => Array.from(fragment).length >= 4)
    .sort(
      (left, right) =>
        Array.from(right).length - Array.from(left).length
    );
  const best = ranked[0];
  if (!best) {
    return '';
  }
  const characters = Array.from(best);
  return characters.length > 12
    ? `${characters.slice(0, 11).join('')}…`
    : best;
}

function isParticipantAlias(value: unknown): value is string {
  return value === 'H' || isExpertAlias(value);
}

function readRoster(context: MockContext): MockRosterEntry[] {
  if (Array.isArray(context.roster)) {
    const roster = context.roster.flatMap((value) => {
      if (!isRecord(value) || !isParticipantAlias(value.alias)) {
        return [];
      }
      const name = readString(value.name).trim();
      if (!name) {
        return [];
      }
      return [
        {
          alias: value.alias,
          name,
          profession: readString(value.profession, '圆桌嘉宾'),
          title: readString(value.title, '嘉宾'),
          stanceTag: readString(value.stanceTag, '观点'),
          stance: readString(value.stance, '结合实际条件判断。')
        }
      ];
    });
    if (roster.length > 0) {
      return roster;
    }
  }

  const aliases = isRecord(context.aliasMap) ? context.aliasMap : {};
  return Object.entries(aliases).flatMap(([alias, value]) =>
    isParticipantAlias(alias) && typeof value === 'string'
      ? [
          {
            alias,
            name: value,
            profession: alias === 'H' ? '圆桌主持人' : '圆桌嘉宾',
            title: alias === 'H' ? '主持人' : '专家',
            stanceTag: '观点',
            stance: '结合话题与实际条件判断。'
          }
        ]
      : []
  );
}

function rosterEntry(
  roster: readonly MockRosterEntry[],
  alias: string
): MockRosterEntry | undefined {
  return roster.find((entry) => entry.alias === alias);
}

function speakerFromContext(
  context: MockContext,
  alias: string,
  roster: readonly MockRosterEntry[]
): MockRosterEntry {
  const matched = rosterEntry(roster, alias);
  if (matched) {
    return matched;
  }
  const card = isRecord(context.speaker) ? context.speaker : {};
  return {
    alias,
    name: readString(card.name, alias),
    profession: readString(card.profession, '圆桌嘉宾'),
    title: readString(card.title, '专家'),
    stanceTag: readString(card.stanceTag, '观点'),
    stance: readString(card.stance, '结合话题与实际条件判断。')
  };
}

function parseTranscriptLine(line: string): MockTranscriptEntry | null {
  const match = line.match(
    /^#(\d+)\s+(\S+)\s+(.+?)(?:（[^）]*）)?[：:]\s*(.*)$/u
  );
  if (!match || !isParticipantAlias(match[2])) {
    return null;
  }
  return {
    seq: Number(match[1]),
    speakerAlias: match[2],
    speakerName: match[3]?.trim() ?? match[2],
    act: 'statement',
    replyToAlias: null,
    content: match[4]?.trim() ?? ''
  };
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

function readPromptUtterances(value: unknown): MockTranscriptEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((utterance) => {
    if (
      !isRecord(utterance) ||
      !isParticipantAlias(utterance.speakerAlias) ||
      typeof utterance.seq !== 'number' ||
      !Number.isInteger(utterance.seq) ||
      utterance.seq < 1 ||
      typeof utterance.content !== 'string'
    ) {
      return [];
    }
    return [
      {
        seq: utterance.seq,
        speakerAlias: utterance.speakerAlias,
        speakerName: readString(utterance.speakerName, utterance.speakerAlias),
        act: readString(utterance.act, 'statement'),
        replyToAlias: isParticipantAlias(utterance.replyToAlias)
          ? utterance.replyToAlias
          : null,
        content: utterance.content
      }
    ];
  });
}

function transcriptEntries(context: MockContext): MockTranscriptEntry[] {
  if (Array.isArray(context.transcriptWindow)) {
    return readPromptUtterances(context.transcriptWindow);
  }
  return readTranscript(context)
    .map(parseTranscriptLine)
    .filter((entry): entry is MockTranscriptEntry => entry !== null);
}

function mostRecentUtterance(
  entries: readonly MockTranscriptEntry[],
  alias: string
): MockTranscriptEntry | undefined {
  return [...entries].reverse().find((entry) => entry.speakerAlias === alias);
}

function latestReply(
  entries: readonly MockTranscriptEntry[],
  alias: string,
  beforeSeq: number
): MockTranscriptEntry | undefined {
  return [...entries]
    .filter(
      (entry) => entry.speakerAlias === alias && entry.seq < beforeSeq
    )
    .sort((left, right) => right.seq - left.seq)[0];
}

function readPreviousUtterance(
  context: MockContext,
  entries: readonly MockTranscriptEntry[]
): { alias: string | null; relation: string } {
  if (isRecord(context.previousUtterance)) {
    const alias = isParticipantAlias(context.previousUtterance.speakerAlias)
      ? context.previousUtterance.speakerAlias
      : null;
    const relation = readString(context.previousUtterance.relation);
    if (alias || relation) {
      return { alias, relation };
    }
  }
  const previous = entries.at(-1);
  return {
    alias: previous?.speakerAlias ?? null,
    relation: ''
  };
}

function isExpertAlias(value: unknown): value is string {
  return typeof value === 'string' && /^E\d+$/u.test(value);
}

function mockStanceRelation(previousTag: string, currentTag: string): string {
  const direction = (tag: string): 'supportive' | 'opposed' | 'neutral' | 'unknown' => {
    const normalized = tag.trim();
    if (/(?:反对|不支持|不赞成|不认同|否定)/u.test(normalized)) {
      return 'opposed';
    }
    if (/(?:支持|赞成|认同|认可|赞同|看好|乐观)/u.test(normalized)) {
      return 'supportive';
    }
    if (/(?:中立|观望|谨慎|审慎|保留)/u.test(normalized)) {
      return 'neutral';
    }
    return 'unknown';
  };
  const previousDirection = direction(previousTag);
  const currentDirection = direction(currentTag);
  if (previousDirection === 'unknown' || currentDirection === 'unknown') {
    return '方向不明';
  }
  if (previousDirection === currentDirection) {
    return '方向相同';
  }
  if (
    (previousDirection === 'supportive' && currentDirection === 'opposed') ||
    (previousDirection === 'opposed' && currentDirection === 'supportive')
  ) {
    return '方向相反';
  }
  return '一方中立或谨慎';
}

function topicProfiles(topic: string): SpeakerProfile[] {
  if (/程序|编程|开发|代码|软件/u.test(topic)) {
    return [
      {
        name: '陈澄',
        profession: '软件工程师',
        title: '应用开发负责人',
        stance: '支持助手承担重复编码，但新人仍需参与调试和评审。',
        stanceTag: '有条件支持',
        persona: '长期带领产品研发团队，表达直接，习惯用交付流程解释问题。'
      },
      {
        name: '周明',
        profession: '初级程序员导师',
        title: '工程教育顾问',
        stance: '担心基础任务减少会挤压新人练习。',
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
        stance: '反对把代码生成当作新人替代品。',
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
        stance: '认为岗位总量变化取决于需求增长。',
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
        stance: '担心复杂问题难以及时转交人工。',
        stanceTag: '审慎',
        persona: '长期研究消费者权益，说话温和但会紧扣真实使用情境。'
      },
      {
        name: '许行之',
        profession: '客户运营专家',
        title: '服务运营负责人',
        stance: '有条件支持规则清楚的环节试点，前提是人工可以及时接手疑难问题。',
        stanceTag: '有条件支持',
        persona: '负责一线服务运营，习惯从交接流程和异常处理谈问题。'
      },
      {
        name: '程望舒',
        profession: '劳动关系研究员',
        title: '数字化转型研究员',
        stance: '反对用自动化替代服务质量评估。',
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
        stance: '主张先比较不同问题类型的实际效果。',
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
      stance: '有条件支持先开展可评估的试点，前提是建立清楚的评估与纠偏机制。',
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
      stance: '主张先明确失败时的责任与补救。',
      stanceTag: '中立',
      persona: '关注风险预案，表达清楚，喜欢把讨论落到应急机制。'
    }
  ];
}

const MOCK_SURNAMES = [
  '林',
  '陈',
  '周',
  '顾',
  '沈',
  '许',
  '唐',
  '程',
  '叶',
  '苏',
  '陆',
  '方',
  '宋',
  '秦',
  '孟',
  '蒋',
  '魏',
  '郑',
  '罗',
  '高',
  '严',
  '梁',
  '白',
  '董',
  '袁',
  '韩',
  '薛',
  '邵',
  '姚',
  '龚',
  '莫',
  '庄'
] as const;

const MOCK_GIVEN_NAMES = [
  '知夏',
  '予安',
  '景行',
  '清和',
  '望舒',
  '子衿',
  '天宇',
  '思睿',
  '明远',
  '晓峰',
  '雨桐',
  '言川',
  '若溪',
  '星野',
  '嘉禾',
  '云舟',
  '书宁',
  '怀瑾',
  '明月',
  '南乔',
  '景明',
  '安宁',
  '亦辰',
  '清越',
  '文昊',
  '念真',
  '景澄',
  '沐言',
  '向晚',
  '南风',
  '以宁',
  '承泽'
] as const;

function fictionalName(seed: number, index: number): string {
  const surnameIndex =
    ((seed % MOCK_SURNAMES.length) + index * 7) % MOCK_SURNAMES.length;
  const givenNameIndex =
    ((Math.floor(seed / MOCK_SURNAMES.length) % MOCK_GIVEN_NAMES.length) +
      index * 5) %
    MOCK_GIVEN_NAMES.length;
  const surname = MOCK_SURNAMES[surnameIndex] ?? MOCK_SURNAMES[0];
  const givenName = MOCK_GIVEN_NAMES[givenNameIndex] ?? MOCK_GIVEN_NAMES[0];
  return `${surname}${givenName}`;
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
  const profileIndices =
    expertCount === 2
      ? [0, 3]
      : expertCount === 3
        ? [0, 2, 3]
        : Array.from({ length: expertCount }, (_, index) => index);
  const lineupSeed = Math.floor(
    createRng(
      `mock-lineup:${request.discussionId ?? 'default'}:${callIndex}`
    )() *
      0x1_0000_0000
  );
  const experts = profileIndices.flatMap((profileIndex, index) => {
    const profile = profiles[profileIndex];
    return profile
      ? [{ ...profile, name: fictionalName(lineupSeed, index) }]
      : [];
  });

  return {
    host: {
      name: fictionalName(lineupSeed, expertCount),
      profession: '圆桌主持人',
      title: '公共议题主持人',
      stance: '保持中立，帮助嘉宾把分歧与条件说清楚。',
      stanceTag: '引导',
      persona: '善于倾听和串联观点，追问具体机制，不替嘉宾表达立场。'
    },
    experts
  };
}

type TextTemplate<T> = (data: T) => string;

interface UtteranceTemplateData {
  topic: string;
  targetName: string;
  quote: string;
  stance: string;
}

const UTTERANCE_TEMPLATES: Record<
  string,
  readonly TextTemplate<UtteranceTemplateData>[]
> = {
  statement: [
    ({ stance }) => `我${stance}；还要把适用条件说清。`,
    ({ topic, stance }) => `就${topic}而言，我${stance}，还要核实实际影响。`,
    ({ stance }) => `我${stance}，这也决定了后续怎样衡量结果。`,
    ({ stance }) => `我${stance}；不能只凭一个条件下结论。`,
    ({ stance }) => `我${stance}，实施范围需要逐步核对。`,
    ({ stance }) => `我${stance}，具体效果还要结合现场观察。`
  ],
  rebut: [
    ({ targetName, quote, stance }) =>
      quote
        ? `我不同意${targetName}提到的“${quote}”；我${stance}。`
        : `我不同意${targetName}这个判断；我${stance}。`,
    ({ targetName, stance }) =>
      `我不同意${targetName}这一步推断；我${stance}。`,
    ({ stance }) => `这个结论还缺一个条件；我${stance}。`,
    ({ stance }) => `我不接受这一步推断，因为我${stance}。`,
    ({ stance }) => `关键条件还没有说清；我${stance}。`,
    ({ stance }) => `这个判断还需要核实；我${stance}。`
  ],
  supplement: [
    ({ targetName, stance }) => `接着${targetName}的看法，我${stance}。`,
    ({ stance }) => `我认同这个方向，并补上一项条件：我${stance}。`,
    ({ targetName, stance }) => `我也认可${targetName}的判断；我${stance}。`,
    ({ stance }) => `这项补充会影响评估，我${stance}。`,
    ({ stance }) => `另一项需要纳入的因素是：我${stance}。`,
    ({ stance }) => `沿着刚才的讨论，我${stance}，还要核对影响范围。`
  ],
  interrupt: [
    ({ targetName, stance }) =>
      `我不同意${targetName}这个判断，得当场回应：我${stance}。`,
    ({ stance }) => `这一点我不能接受，必须现在说清：我${stance}。`,
    ({ stance }) => `我得立即回应这个推断；我${stance}。`,
    ({ stance }) => `这处冲突不能略过，我当场反对：我${stance}。`,
    ({ stance }) => `我不同意这个结论，关键原因是我${stance}。`,
    ({ stance }) => `先说明我的异议：我${stance}，这个判断还需要核实。`
  ]
};

interface HostTemplateData {
  topic: string;
  guestList: string;
  targetName: string;
  profession: string;
  quote: string;
  divergence: string;
  sides: readonly { name: string; position: string }[];
}

const HOST_TEMPLATES: Record<
  string,
  readonly TextTemplate<HostTemplateData>[]
> = {
  opening: [
    ({ topic, guestList }) =>
      `今天讨论${topic}。嘉宾有：${guestList}。请各位从自己的观察说起。`,
    ({ topic, guestList }) =>
      `今天的话题是${topic}。到场嘉宾依次是：${guestList}。请各位先亮出判断。`,
    ({ topic, guestList }) =>
      `我们围绕${topic}展开讨论。现场嘉宾是：${guestList}。请各位从最关心的问题谈起。`,
    ({ topic, guestList }) =>
      `今天聚焦${topic}。欢迎${guestList}。我们先请各位简要说说判断。`
  ],
  follow_up: [
    ({ targetName, quote, profession }) =>
      quote
        ? `${targetName}提到“${quote}”，请从${profession}的角度说说，最需要核实什么？`
        : `${targetName}的看法值得继续讨论，请从${profession}的角度说说，最需要核实什么？`,
    ({ targetName, profession }) =>
      `${targetName}，从${profession}的角度看，哪项条件最影响你的判断？`,
    ({ targetName, profession }) =>
      `${targetName}的观点还可以从${profession}的实践核实，你会先看哪一项？`,
    ({ targetName, profession }) =>
      `请${targetName}从${profession}的角度回应刚才的分歧，最关键的证据是什么？`
  ],
  invite: [
    ({ targetName, profession, topic }) =>
      `${targetName}，结合${profession}的实践，针对${topic}你会先核实什么？`,
    ({ targetName, profession }) =>
      `也请${targetName}从${profession}的角度谈谈，这项议题的适用边界在哪里？`,
    ({ targetName, profession }) =>
      `${targetName}，你的${profession}视角能补充哪些条件？`,
    ({ targetName, profession }) =>
      `请${targetName}结合${profession}的经验，说明哪些情形需要例外处理。`
  ],
  bridge: [
    ({ targetName, divergence, sides }) =>
      sides.length >= 2
        ? `${sides[0]?.name}${sides[0]?.position}，${sides[1]?.name}则${sides[1]?.position}。${targetName}，请回应双方分歧中的关键条件。`
        : `关于${divergence}，目前还有条件需要说清。${targetName}，你怎么看？`,
    ({ targetName, divergence, sides }) =>
      sides.length >= 2
        ? `${sides[0]?.name}${sides[0]?.position}；${sides[1]?.name}则${sides[1]?.position}。${targetName}，你认为哪项条件最关键？`
        : `${divergence}还需要具体讨论。${targetName}，你会先核对哪项条件？`,
    ({ targetName, divergence, sides }) =>
      sides.length >= 2
        ? `${sides[0]?.name}${sides[0]?.position}，而${sides[1]?.name}${sides[1]?.position}。${targetName}，请回应这处差异。`
        : `${divergence}还有哪些分歧需要辨清？${targetName}，请谈谈你的判断。`,
    ({ targetName, divergence, sides }) =>
      sides.length >= 2
        ? `${sides[0]?.name}的观点是${sides[0]?.position}，${sides[1]?.name}则${sides[1]?.position}。${targetName}，你愿意回应哪一边？`
        : `${divergence}仍有待展开。${targetName}，你认为关键条件是什么？`
  ],
  closing: [
    ({ topic }) =>
      `今天关于${topic}先讨论到这里，后续仍可核对具体条件。`,
    ({ topic }) =>
      `感谢各位讨论${topic}，接下来可以继续追踪实际变化。`,
    ({ topic }) =>
      `关于${topic}，还有问题值得继续展开。感谢各位嘉宾参与。`,
    ({ topic }) =>
      `我们先把${topic}留作开放议题，感谢各位嘉宾和观众。`
  ]
};

function buildBid(
  context: MockContext,
  callIndex: number,
  discussionId: string
): unknown {
  const entries = transcriptEntries(context);
  const speakerAlias = readString(context.speakerAlias, 'E1');
  const roster = readRoster(context);
  const speaker = speakerFromContext(context, speakerAlias, roster);
  const previous = readPreviousUtterance(context, entries);
  const previousAlias =
    previous.alias ?? entries.at(-1)?.speakerAlias ?? null;
  const previousSpeaker = previousAlias
    ? rosterEntry(roster, previousAlias)
    : undefined;
  const relation =
    previous.relation ||
    (previousAlias === 'H'
      ? '主持人发言'
      : previousSpeaker
        ? mockStanceRelation(previousSpeaker.stanceTag, speaker.stanceTag)
        : '暂无上一条发言');
  const addressed =
    context.addressed === true ||
    context.wasAddressed === true ||
    context.isAddressed === true;
  const seed = `${discussionId}:${callIndex}:${speakerAlias}`;
  const wantsToSpeak =
    addressed ||
    (previousAlias !== speakerAlias &&
      createRng(`mock-bid-wants:${seed}`)() < 0.5);
  const interruptOdds = createRng(`mock-bid-interrupt:${seed}`)();
  const proposedIntent =
    relation === '主持人发言'
      ? 'raise_hand'
      : relation === '方向相同' || relation === '相同'
        ? 'supplement'
        : relation === '方向相反' || relation === '不同'
          ? interruptOdds < 0.16
            ? 'interrupt'
            : 'rebut'
          : 'raise_hand';
  const intent =
    wantsToSpeak && proposedIntent === 'interrupt'
      ? proposedIntent
      : proposedIntent === 'interrupt'
        ? 'rebut'
        : proposedIntent;
  const urgencySample = createRng(`mock-bid-urgency:${seed}`)();
  const urgency = !wantsToSpeak
    ? 0.2 + urgencySample * 0.3
    : addressed
      ? 0.88 + urgencySample * 0.12
      : intent === 'interrupt'
        ? 0.85 + urgencySample * 0.15
        : intent === 'rebut'
          ? 0.62 + urgencySample * 0.18
          : intent === 'supplement'
            ? 0.6 + urgencySample * 0.15
            : 0.35 + urgencySample * 0.25;
  const replyTo =
    previousAlias && previousAlias !== speakerAlias
      ? previousAlias
      : isExpertAlias(context.replyToAlias) &&
          context.replyToAlias !== speakerAlias
        ? context.replyToAlias
        : null;
  const replyTarget =
    replyTo && replyTo !== 'H' ? rosterEntry(roster, replyTo) : undefined;
  const focus = replyTarget
    ? `回应${replyTarget.name}的${sentencePoint(replyTarget.stance).startsWith('担心') ? '担忧' : '看法'}`
    : sentencePoint(speaker.stance);

  return {
    wantToSpeak: wantsToSpeak,
    intent,
    urgency: Number(urgency.toFixed(2)),
    replyTo,
    focus
  };
}

function buildUtterance(
  context: MockContext,
  nextTemplateIndex: (scope: string, count: number) => number
): string {
  const act = readString(context.act, 'statement');
  const templates = UTTERANCE_TEMPLATES[act] ?? UTTERANCE_TEMPLATES.statement!;
  const speakerAlias = readString(context.speakerAlias, 'E1');
  const targetAlias = readString(context.replyToAlias, '');
  const roster = readRoster(context);
  const speaker = speakerFromContext(context, speakerAlias, roster);
  const target =
    targetAlias && isParticipantAlias(targetAlias)
      ? rosterEntry(roster, targetAlias)
      : undefined;
  const entries = transcriptEntries(context);
  const targetUtterance = targetAlias
    ? mostRecentUtterance(entries, targetAlias)
    : entries.at(-1);
  const topic = topicCore(readString(context.topic));
  const data: UtteranceTemplateData = {
    topic,
    targetName: target?.name ?? targetUtterance?.speakerName ?? '前一位嘉宾',
    quote:
      target && targetUtterance
        ? shortQuote(targetUtterance.content, target, roster, topic)
        : '',
    stance: sentencePoint(speaker.stance)
  };
  const index = nextTemplateIndex(`utterance:${act}`, templates.length);
  return (templates[index]?.(data) ?? templates[0]!(data)).replace(/…/gu, '');
}

function parseDivergence(
  context: MockContext,
  roster: readonly MockRosterEntry[]
): { content: string; sides: Array<{ name: string; position: string }> } {
  const raw = context.divergence;
  if (isRecord(raw) && typeof raw.content === 'string') {
    const sides = Array.isArray(raw.stances)
      ? raw.stances.flatMap((value) => {
          if (
            !isRecord(value) ||
            !isExpertAlias(value.speakerAlias) ||
            typeof value.position !== 'string'
          ) {
            return [];
          }
          const participant = rosterEntry(roster, value.speakerAlias);
          return participant
            ? [
                {
                  name: participant.name,
                  position: sentencePoint(value.position)
                }
              ]
            : [];
        })
      : [];
    return { content: raw.content, sides };
  }
  if (typeof raw === 'string') {
    const [content = '', ...sideLines] = raw.split(/[；;]/u);
    const sides = sideLines.flatMap((line) => {
      const match = line.trim().match(/^(E\d+)\s+[^：:]+[：:](.*)$/u);
      if (!match || !isExpertAlias(match[1])) {
        return [];
      }
      const participant = rosterEntry(roster, match[1]);
      return participant
        ? [
            {
              name: participant.name,
              position: sentencePoint(match[2] ?? '')
            }
          ]
        : [];
    });
    return { content: content.trim(), sides };
  }
  return { content: '', sides: [] };
}

function buildHost(
  context: MockContext,
  nextTemplateIndex: (scope: string, count: number) => number
): string {
  const action = readString(context.action, 'opening');
  const templates = HOST_TEMPLATES[action] ?? HOST_TEMPLATES.follow_up!;
  const roster = readRoster(context);
  const entries = transcriptEntries(context);
  const targetAlias = readString(context.targetAlias, '');
  const target =
    targetAlias && isParticipantAlias(targetAlias)
      ? rosterEntry(roster, targetAlias)
      : undefined;
  const targetUtterance = targetAlias
    ? mostRecentUtterance(entries, targetAlias)
    : undefined;
  const divergence = parseDivergence(context, roster);
  const topic = topicCore(readString(context.topic));
  const guestList = roster
    .filter(({ alias }) => alias !== 'H')
    .map(({ name, profession, title }) => `${name}（${profession} · ${title}）`)
    .join('、');
  const data: HostTemplateData = {
    topic,
    guestList: guestList || '嘉宾名单待提供',
    targetName: target?.name ?? '这位嘉宾',
    profession: target?.profession ?? '专业领域',
    quote:
      target && targetUtterance
        ? shortQuote(targetUtterance.content, target, roster, topic)
        : '',
    divergence: (divergence.content || topic).replace(/…/gu, ''),
    sides: divergence.sides
  };
  const index = nextTemplateIndex(`host:${action}`, templates.length);
  return (templates[index]?.(data) ?? templates[0]!(data)).replace(/…/gu, '');
}

function insightUtterances(context: MockContext): {
  window: MockTranscriptEntry[];
  added: MockTranscriptEntry[];
} {
  const window = Array.isArray(context.transcriptWindow)
    ? readPromptUtterances(context.transcriptWindow)
    : transcriptEntries(context);
  const added = readPromptUtterances(context.newUtterances);
  const bySeq = new Map<number, MockTranscriptEntry>();
  for (const utterance of [...window, ...added]) {
    bySeq.set(utterance.seq, utterance);
  }
  return {
    window: [...bySeq.values()].sort((left, right) => left.seq - right.seq),
    added
  };
}

function existingDivergenceRef(
  context: MockContext,
  first: MockRosterEntry,
  second: MockRosterEntry
): string | null {
  const text = readString(
    context.existingInsightsText,
    readString(context.insightsText)
  );
  const matches = text.split(/\r?\n/u).find((line) => {
    if (!/^D\d+\b/u.test(line)) {
      return false;
    }
    const hasFirst = line.includes(first.name) || line.includes(first.alias);
    const hasSecond = line.includes(second.name) || line.includes(second.alias);
    return hasFirst && hasSecond;
  });
  return matches?.match(/^(D\d+)\b/u)?.[1] ?? null;
}

function buildInsights(context: MockContext): unknown {
  const roster = readRoster(context);
  const { window, added } = insightUtterances(context);
  const consensus: Array<Record<string, unknown>> = [];
  const divergences: Array<Record<string, unknown>> = [];

  for (const utterance of added) {
    const speakerAlias = utterance.speakerAlias;
    const replyToAlias = utterance.replyToAlias;
    if (
      !isExpertAlias(speakerAlias) ||
      !isExpertAlias(replyToAlias) ||
      speakerAlias === replyToAlias
    ) {
      continue;
    }
    const speaker = rosterEntry(roster, speakerAlias);
    const target = rosterEntry(roster, replyToAlias);
    if (!speaker || !target) {
      continue;
    }
    const related = latestReply(window, replyToAlias, utterance.seq);
    const evidence = related
      ? [related.seq, utterance.seq].sort((left, right) => left - right)
      : [utterance.seq];
    const targetPosition = sentencePoint(target.stance);
    const speakerPosition = sentencePoint(speaker.stance);

    if (utterance.act === 'rebut' || utterance.act === 'interrupt') {
      divergences.push({
        ref: existingDivergenceRef(context, speaker, target),
        content: `${speaker.name}${speakerPosition}，${target.name}则${targetPosition}`,
        stances: [
          {
            who: speakerAlias,
            position: speakerPosition
          },
          {
            who: replyToAlias,
            position: targetPosition
          }
        ],
        evidence,
        resolved: false
      });
    } else if (utterance.act === 'supplement') {
      consensus.push({
        ref: null,
        content: `${speaker.name}提出${speakerPosition}，${target.name}认同并补充${targetPosition}`,
        participants: [replyToAlias, speakerAlias],
        evidence
      });
    }
  }
  return { consensus, divergences };
}

function readInsightEntries(
  context: MockContext
): Array<{ kind: 'consensus' | 'divergence'; content: string }> {
  return readString(
    context.insightsText,
    readString(context.existingInsightsText)
  )
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .flatMap((line) => {
      const match = line.match(/^[CD]\d+\s+(共识|分歧)[：:]\s*(.*)$/u);
      if (!match) {
        return [];
      }
      const content = (match[2] ?? '')
        .split('（')[0]
        ?.replace(/…/gu, '')
        .trim();
      return content
        ? [
            {
              kind: match[1] === '共识' ? 'consensus' : 'divergence',
              content
            } as const
          ]
        : [];
    });
}

function buildSummary(context: MockContext): string {
  const topic = topicCore(readString(context.topic));
  const roster = readRoster(context);
  const transcript = transcriptEntries(context);
  const expertsWhoSpoke = transcript.filter((entry) =>
    isExpertAlias(entry.speakerAlias)
  );
  const spokenByAlias = [
    ...new Map(
      expertsWhoSpoke.map((entry) => [entry.speakerAlias, entry])
    ).values()
  ];
  const spokenViews = spokenByAlias.map((entry) => {
    const participant = rosterEntry(roster, entry.speakerAlias);
    const name = participant?.name ?? entry.speakerName;
    return `${name}${sentencePoint(participant?.stance ?? entry.content)}`;
  });
  const insightEntries = readInsightEntries(context);
  const divergences = insightEntries
    .filter(({ kind }) => kind === 'divergence')
    .map(({ content }) => content);
  const consensus = insightEntries
    .filter(({ kind }) => kind === 'consensus')
    .map(({ content }) => content);
  const openingParagraph =
    spokenViews.length > 0
      ? `关于${topic}，${spokenViews.join('；')}。`
      : `关于${topic}，讨论仍需要真实发言补充具体判断。`;
  const divergenceParagraph =
    divergences.length > 0
      ? `分歧主要在于：${divergences.join('；')}。`
      : `接下来仍需梳理不同判断所依据的条件。`;
  const nextQuestion =
    divergences[0] !== undefined
      ? '这处分歧接下来应核实哪些证据与适用边界'
      : '哪些条件会改变目前的判断';
  const thirdParagraph =
    consensus.length > 0
      ? `共识方面，${consensus.join('；')}。`
      : `仍待回答的问题是：${nextQuestion}？`;
  const spokenAliases = new Set(
    expertsWhoSpoke.map(({ speakerAlias }) => speakerAlias)
  );
  const nextGuest = roster.find(
    ({ alias }) => isExpertAlias(alias) && !spokenAliases.has(alias)
  );
  const closingParagraph = nextGuest
    ? `接下来可以请${nextGuest.name}从${nextGuest.profession}的角度回应：哪些条件会改变判断？感谢各位嘉宾，也感谢观众收看。`
    : `后续还应核实哪些证据会改变判断？感谢各位嘉宾，也感谢观众收看。`;
  return `${openingParagraph}\n\n${divergenceParagraph}\n\n${thirdParagraph}\n\n${closingParagraph}`;
}

function generateText(
  request: LLMRequest,
  context: MockContext,
  callIndex: number,
  discussionId: string,
  nextTemplateIndex: (scope: string, count: number) => number
): string {
  switch (request.task) {
    case 'lineup':
      return JSON.stringify(buildLineup(context, request, callIndex));
    case 'bid':
      return JSON.stringify(buildBid(context, callIndex, discussionId));
    case 'utterance':
      return buildUtterance(context, nextTemplateIndex);
    case 'host':
      return buildHost(context, nextTemplateIndex);
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
  const templateCursors = new Map<string, number>();

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
    const discussionId = request.discussionId ?? 'default';
    const nextTemplateIndex = (scope: string, count: number): number => {
      const templateKey = `${discussionId}:${scope}`;
      const cursor = templateCursors.get(templateKey) ?? 0;
      templateCursors.set(templateKey, cursor + 1);
      return cursor % count;
    };
    const text = generateText(
      request,
      context,
      callIndex,
      discussionId,
      nextTemplateIndex
    );
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
