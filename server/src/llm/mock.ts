import type { LLMProvider, LLMRequest } from './types';
import { createRng } from '../core/rng';
import {
  topicIssues,
  topicProfiles,
  type MockDetailKind,
  type MockArgument,
  type SpeakerProfile
} from './mockProfiles';

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
  targetHasSpoken?: boolean;
  addressed?: boolean;
  interruptAvailability?: unknown;
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

interface MockGeneratedAct {
  speakerAlias: string;
  act: string;
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

function addCjkLatinSpacing(
  value: string,
  preservedValues: readonly string[] = []
): string {
  let protectedValue = value;
  const replacements = preservedValues
    .filter(Boolean)
    .map((original, index) => {
      const marker = `\uE000${index}\uE001`;
      protectedValue = protectedValue.split(original).join(marker);
      return { marker, original };
    });
  const spaced = protectedValue
    .replace(/([\u4e00-\u9fff])(?=[A-Za-z0-9])/gu, '$1 ')
    .replace(/([A-Za-z0-9])(?=[\u4e00-\u9fff])/gu, '$1 ');
  return replacements.reduce(
    (result, { marker, original }) => result.split(marker).join(original),
    spaced
  );
}

function normalizeJsonOutput(value: string): string {
  const normalize = (input: unknown): unknown => {
    if (typeof input === 'string') {
      return addCjkLatinSpacing(input);
    }
    if (Array.isArray(input)) {
      return input.map(normalize);
    }
    if (isRecord(input)) {
      return Object.fromEntries(
        Object.entries(input).map(([key, item]) => [key, normalize(item)])
      );
    }
    return input;
  };
  return JSON.stringify(normalize(JSON.parse(value)));
}

const STANCE_PREFIX =
  /^(?:并不支持|不太支持|不支持|不赞成|不认同|不赞同|不反对|有条件支持|有条件反对|不看好|担心|担忧|警惕|质疑|审慎|谨慎|支持|赞成|认同|反对|主张|倾向|认为)/u;

function sentencePoint(value: string): string {
  const compact = value.replace(/\s+/gu, ' ').trim();
  const point =
    compact.split(/[，,。！？!?；;：:]/u)[0]?.trim() || '结合实际条件判断';
  const subjectlessPoint = point.replace(/^我\s*/u, '');
  const neutralPoint =
    subjectlessPoint.replace(
      /^(?:并不支持|不支持|不赞成|不认同|不赞同|不反对|反对|担心|担忧|警惕|质疑)\s*/u,
      ''
    ) || subjectlessPoint;
  if (neutralPoint !== subjectlessPoint) {
    return neutralPoint;
  }
  return STANCE_PREFIX.test(subjectlessPoint)
    ? subjectlessPoint
    : `认为${subjectlessPoint}`;
}

function profileForSpeaker(
  topic: string,
  speaker: MockRosterEntry
): SpeakerProfile | undefined {
  return topicProfiles(topic).find(
    ({ stance }) => stance.trim() === speaker.stance.trim()
  );
}

function claimForContent(
  topic: string,
  speaker: MockRosterEntry,
  content: string
): string | undefined {
  const profile = profileForSpeaker(topic, speaker);
  if (!profile) {
    return undefined;
  }
  const argument = profile.arguments.find(
    ({ claim }) => content.includes(claim)
  );
  if (argument) {
    return argument.claim;
  }
  return content.includes(profile.stanceClaim) ? profile.stanceClaim : undefined;
}

function spokenClaimForContent(
  topic: string,
  speaker: MockRosterEntry,
  content: string
): string | undefined {
  const profile = profileForSpeaker(topic, speaker);
  if (!profile) {
    return undefined;
  }
  if (content.includes(profile.stanceClaim)) {
    return profile.stanceClaim;
  }
  return profile.arguments.find(({ claim }) => content.includes(claim))?.claim;
}

function referenceForUtterance(
  topic: string,
  target: MockRosterEntry,
  utterance: MockTranscriptEntry
): string {
  const quote = claimForContent(topic, target, utterance.content);
  return quote ? `“${quote}”` : '';
}

function positionReferenceForUtterance(
  topic: string,
  target: MockRosterEntry,
  utterance: MockTranscriptEntry
): string {
  const profile = profileForSpeaker(topic, target);
  const quote =
    profile && utterance.content.includes(profile.stanceClaim)
      ? profile.stanceClaim
      : claimForContent(topic, target, utterance.content);
  return quote ? `“${quote}”` : '';
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

function isExpertAlias(value: unknown): value is string {
  return typeof value === 'string' && /^E\d+$/u.test(value);
}

type StanceDirection = 'supportive' | 'opposed' | 'neutral' | 'unknown';

function stanceDirection(tag: string): StanceDirection {
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
}

export function mockStanceRelation(
  previousTag: string,
  currentTag: string
): string {
  const previousDirection = stanceDirection(previousTag);
  const currentDirection = stanceDirection(currentTag);
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

function argumentsForSpeaker(
  topic: string,
  speaker: MockRosterEntry
): readonly MockArgument[] {
  const exactProfile = profileForSpeaker(topic, speaker);
  if (exactProfile) {
    return exactProfile.arguments;
  }
  const profiles = topicProfiles(topic);
  const direction = stanceDirection(speaker.stanceTag);
  const candidates = profiles.filter(
    ({ stanceTag }) => stanceDirection(stanceTag) === direction
  );
  const seat = Number(speaker.alias.slice(1)) - 1;
  const fallback =
    candidates.length > 0
      ? candidates[((seat % candidates.length) + candidates.length) % candidates.length]
      : profiles[0];
  return fallback?.arguments ?? [];
}

function argumentForContent(
  topic: string,
  speaker: MockRosterEntry,
  content: string
): MockArgument | undefined {
  const profile = profileForSpeaker(topic, speaker);
  const argument = argumentsForSpeaker(topic, speaker).find(
    ({ text, position, claim, detail }) =>
      content.includes(text) ||
      content.includes(position) ||
      content.includes(claim) ||
      content.includes(detail.text)
  );
  if (argument) {
    return argument;
  }
  return profile && content.includes(profile.stanceClaim)
    ? profile.arguments[0]
    : undefined;
}

function positionArgumentForContent(
  topic: string,
  speaker: MockRosterEntry,
  content: string
): MockArgument | undefined {
  const profile = profileForSpeaker(topic, speaker);
  return profile && content.includes(profile.stanceClaim)
    ? profile.arguments[0]
    : argumentForContent(topic, speaker, content);
}

function insightArgumentForContent(
  topic: string,
  speaker: MockRosterEntry,
  content: string
): MockArgument | undefined {
  return positionArgumentForContent(topic, speaker, content);
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
      ? [
          {
            name: fictionalName(lineupSeed, index),
            profession: profile.profession,
            title: profile.title,
            stance: profile.stance,
            stanceTag: profile.stanceTag,
            persona: profile.persona
          }
        ]
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
  firstSpeech: boolean;
  targetIsHost: boolean;
  targetName: string;
  reference: string;
  negative: boolean;
  stance: string;
  argument: MockArgument;
}

function withStance(
  lead: string,
  firstSpeech: boolean,
  stance: string,
  argument: MockArgument
): string {
  return firstSpeech
    ? `${lead}：我${withoutFinalPunctuation(stance)}；${argument.text}`
    : `${lead}：${argument.text}`;
}

function hostObjectionLead(targetName: string, phrase: string): string {
  return `针对${targetName}刚才提出的问题，${phrase}`;
}

function referenceHasNegativeStance(reference: string): boolean {
  const quote = reference.match(/^“([^”]+)”$/u)?.[1] ?? '';
  return /(?:反对|不支持|不赞成|不认同|不赞同|担心|担忧|警惕|质疑)/u.test(
    quote
  );
}

function hostTargetReference(targetName: string, reference: string): string {
  return /^“[^”]+”$/u.test(reference)
    ? `${targetName}刚才说${reference}`
    : `${targetName}刚才的判断`;
}

function withoutFinalPunctuation(value: string): string {
  return value.replace(/[。！？!?]+$/u, '');
}

const UTTERANCE_TEMPLATES: Record<
  string,
  readonly TextTemplate<UtteranceTemplateData>[]
> = {
  statement: [
    ({ firstSpeech, stance, argument }) =>
      firstSpeech
        ? `我${withoutFinalPunctuation(stance)}；${argument.text}`
        : argument.text,
    ({ firstSpeech, stance, argument }) =>
      firstSpeech
        ? `我先说明判断：我${withoutFinalPunctuation(stance)}；${argument.text}`
        : `关于${argument.issue}，我想核对：${argument.text}`,
    ({ firstSpeech, stance, argument }) =>
      firstSpeech
        ? `我的判断是：我${withoutFinalPunctuation(stance)}；${argument.text}`
        : `先看${argument.issue}：${argument.text}`,
    ({ firstSpeech, stance, argument }) =>
      firstSpeech
        ? `我先给出判断：我${withoutFinalPunctuation(stance)}；${argument.text}`
        : `就${argument.issue}而言：${argument.text}`,
    ({ firstSpeech, stance, argument }) =>
      firstSpeech
        ? `我${withoutFinalPunctuation(stance)}；${argument.text}`
        : `${argument.issue}需要看这一点：${argument.text}`,
    ({ firstSpeech, stance, argument }) =>
      firstSpeech
        ? `我的起点是：我${withoutFinalPunctuation(stance)}；${argument.text}`
        : `这项判断可以这样核对：${argument.text}`
  ],
  rebut: [
    ({ firstSpeech, stance, targetName, targetIsHost, reference, negative, argument }) => {
      const lead = targetIsHost
        ? `针对${targetName}刚才的问题，我的看法是`
        : negative
          ? reference
            ? `${targetName}说的${reference}，我倒不这么看`
            : `对${targetName}的判断，我倒不这么看`
          : reference
            ? `${targetName}说${reference}，我不同意`
            : `我不同意${targetName}的判断`;
      return withStance(lead, firstSpeech, stance, argument);
    },
    ({ firstSpeech, stance, targetName, targetIsHost, reference, negative, argument }) => {
      const lead = targetIsHost
        ? `接着${targetName}刚才的提问，我不赞同`
        : negative
          ? reference
            ? `${targetName}刚才说${reference}，我有不同看法`
            : `对${targetName}的说法，我有不同看法`
          : reference
            ? `${targetName}刚才说${reference}，我不赞同`
            : `${targetName}的说法，我不赞同`;
      return withStance(lead, firstSpeech, stance, argument);
    },
    ({ firstSpeech, stance, targetName, targetIsHost, reference, negative, argument }) => {
      const lead = targetIsHost
        ? `对于${targetName}刚提的问题，我不认同`
        : negative
          ? reference
            ? `${targetName}刚才说的${reference}，恐怕要分情况看`
            : `对${targetName}的观点，恐怕要分情况看`
          : reference
            ? `我不认同${targetName}刚才说的${reference}`
            : `${targetName}的观点，我不认同`;
      return withStance(lead, firstSpeech, stance, argument);
    },
    ({ firstSpeech, stance, targetName, targetIsHost, reference, negative, argument }) => {
      const lead = targetIsHost
        ? `听完${targetName}提出的问题，我不敢苟同`
        : negative
          ? reference
            ? `对${targetName}提到的${reference}，我说个反例`
            : `对${targetName}的那套，我说个反例`
          : reference
            ? `对${targetName}提到的${reference}，我不敢苟同`
            : `对${targetName}的那套，我不敢苟同`;
      return withStance(lead, firstSpeech, stance, argument);
    },
    ({ firstSpeech, stance, targetName, targetIsHost, reference, negative, argument }) => {
      const lead = targetIsHost
        ? `对着${targetName}那个问题，我的看法不一样`
        : negative
          ? reference
            ? `听完${targetName}说的${reference}，我不这么看`
            : `听完${targetName}的意见，我不这么看`
          : reference
            ? `听完${targetName}说的${reference}，我的看法不一样`
            : `听完${targetName}的意见，我的看法不一样`;
      return withStance(lead, firstSpeech, stance, argument);
    },
    ({ firstSpeech, stance, targetName, targetIsHost, reference, negative, argument }) => {
      const lead = targetIsHost
        ? `我的看法和${targetName}这个问题相反`
        : negative
          ? reference
            ? `对${targetName}刚才说的${reference}，我有反例`
            : `对${targetName}的思路，我的看法相反`
          : reference
            ? `${targetName}提到的${reference}，我要反对`
            : `我的看法和${targetName}的思路相反`;
      return withStance(lead, firstSpeech, stance, argument);
    }
  ],
  supplement: [
    ({ firstSpeech, stance, targetIsHost, targetName, reference, argument }) => {
      const lead = targetIsHost
        ? `针对${targetName}刚才的提问，我再补一点`
        : reference
          ? `${targetName}刚才说${reference}，我很认同，再补一点`
          : `我很认同${targetName}的判断，再补一点`;
      return withStance(lead, firstSpeech, stance, argument);
    },
    ({ firstSpeech, stance, targetIsHost, targetName, reference, argument }) => {
      const lead = targetIsHost
        ? `接着${targetName}刚提的问题，我补一项`
        : reference
          ? `${targetName}刚才说${reference}，我接着补一项`
          : `接着${targetName}的说法，我补一项`;
      return withStance(lead, firstSpeech, stance, argument);
    },
    ({ firstSpeech, stance, targetIsHost, targetName, reference, argument }) => {
      const lead = targetIsHost
        ? `对于${targetName}提出的问题，还可以看`
        : reference
          ? `沿着${targetName}提到的${reference}，还可以看`
          : `沿着${targetName}的观点，还可以看`;
      return withStance(lead, firstSpeech, stance, argument);
    },
    ({ firstSpeech, stance, targetIsHost, targetName, reference, argument }) => {
      const lead = targetIsHost
        ? `听完${targetName}那个问题，我也有同感`
        : reference
          ? `${targetName}说的${reference}我也有同感`
          : `我对${targetName}的那套也有同感`;
      return withStance(lead, firstSpeech, stance, argument);
    },
    ({ firstSpeech, stance, targetIsHost, targetName, reference, argument }) => {
      const lead = targetIsHost
        ? `对着${targetName}这个问题，还有一个观察点`
        : reference
          ? `沿着${targetName}说的${reference}，还有一个观察点`
          : `沿着${targetName}的意见，还有一个观察点`;
      return withStance(lead, firstSpeech, stance, argument);
    },
    ({ firstSpeech, stance, targetIsHost, targetName, reference, argument }) => {
      const lead = targetIsHost
        ? `我的看法和${targetName}刚才的问题一致，我也想接上一句`
        : reference
          ? `${targetName}提到的${reference}说得没错`
          : `${targetName}的思路说得没错`;
      return withStance(lead, firstSpeech, stance, argument);
    }
  ],
  interrupt: [
    ({ firstSpeech, stance, targetName, targetIsHost, reference, negative, argument }) => {
      const lead = targetIsHost
        ? `对着${targetName}刚才的问题，我不同意`
        : negative
          ? reference
            ? `我先打断一下，${targetName}说的${reference}，我倒不这么看`
            : `我先打断一下，我对${targetName}的说法有不同看法`
          : reference
            ? `我先打断一下，${targetName}说的${reference}，我不同意`
            : `我先打断一下，我不同意${targetName}的说法`;
      return withStance(lead, firstSpeech, stance, argument);
    },
    ({ firstSpeech, stance, targetName, targetIsHost, reference, negative, argument }) => {
      const lead = targetIsHost
        ? `针对${targetName}刚才的提问，我不认同`
        : negative
          ? reference
            ? `我先插一句，${targetName}提到的${reference}，我难以认同`
            : `我先插一句，我难以认同${targetName}的观点`
          : reference
            ? `我先插一句，${targetName}提到的${reference}，我不认同`
            : `我先插一句，我不认同${targetName}的观点`;
      return withStance(lead, firstSpeech, stance, argument);
    },
    ({ firstSpeech, stance, targetName, targetIsHost, reference, negative, argument }) => {
      const lead = targetIsHost
        ? `接着${targetName}刚提的问题，我不赞同`
        : negative
          ? reference
            ? `先停一下，${targetName}说的${reference}，要分情况看`
            : `先停一下，${targetName}的那套要分情况看`
          : reference
            ? `先停一下，${targetName}说的${reference}，我不赞同`
            : `先停一下，我不赞同${targetName}的那套`;
      return withStance(lead, firstSpeech, stance, argument);
    },
    ({ firstSpeech, stance, targetName, targetIsHost, reference, negative, argument }) => {
      const lead = targetIsHost
        ? `对于${targetName}提出的问题，这点我不敢苟同`
        : negative
          ? reference
            ? `我必须马上回应${targetName}刚才说的${reference}，我说个反例`
            : `我必须马上回应${targetName}的意见，我说个反例`
          : reference
            ? `我必须马上回应${targetName}刚才说的${reference}，这点我不敢苟同`
            : `我必须马上回应${targetName}的意见，这点我不敢苟同`;
      return withStance(lead, firstSpeech, stance, argument);
    },
    ({ firstSpeech, stance, targetName, targetIsHost, reference, negative, argument }) => {
      const lead = targetIsHost
        ? `听完${targetName}那个问题，我不敢苟同`
        : negative
          ? reference
            ? `对不起打断一下，${targetName}提到的${reference}，我不这么看`
            : `对不起打断一下，${targetName}的思路，我不这么看`
          : reference
            ? `对不起打断一下，${targetName}提到的${reference}，我不敢苟同`
            : `对不起打断一下，${targetName}的思路，我不敢苟同`;
      return withStance(lead, firstSpeech, stance, argument);
    },
    ({ firstSpeech, stance, targetName, targetIsHost, reference, negative, argument }) => {
      const lead = targetIsHost
        ? `我的看法和${targetName}这个问题相反，这点我反对`
        : negative
          ? reference
            ? `我先回应${targetName}提到的${reference}，我遇到反例`
            : `我先回应${targetName}的判断，我遇到反例`
          : reference
            ? `我先回应${targetName}提到的${reference}，这点我反对`
            : `我先回应${targetName}的判断，这点我反对`;
      return withStance(lead, firstSpeech, stance, argument);
    }
  ]
};

interface HostTemplateData {
  fullTopic: string;
  guestList: string;
  targetName: string;
  targetHasSpoken: boolean;
  profession: string;
  reference: string;
  detailKind: MockDetailKind;
  divergence: string;
  targetIsInDivergence: boolean;
  otherName: string;
  sides: readonly { alias: string; name: string; position: string }[];
}

function namedPosition(name: string, position: string): string {
  const point = position.replace(/[。！？!?]+$/u, '').trim();
  return (
    STANCE_PREFIX.test(point) ||
    /^(?:强调|要求|指出|建议|重视|保留|说明|核算|分组|提前)/u.test(point)
  )
    ? `${name}${point}`
    : `${name}认为${point}`;
}

const HOST_TEMPLATES: Record<
  string,
  readonly TextTemplate<HostTemplateData>[]
> = {
  opening: [
    ({ fullTopic, guestList }) =>
      `今天我们围绕话题“${fullTopic}”展开讨论。到场嘉宾有：${guestList}。请各位先亮出判断。`,
    ({ fullTopic, guestList }) =>
      `本场将讨论“${fullTopic}”。今天参与讨论的嘉宾有：${guestList}。请各位从自己的观察谈起。`,
    ({ fullTopic, guestList }) =>
      `今天的圆桌聚焦“${fullTopic}”。到场嘉宾包括：${guestList}。请各位先说说判断。`,
    ({ fullTopic, guestList }) =>
      `我们从“${fullTopic}”这个问题开始。欢迎${guestList}来到圆桌，请各位按自己的关注点进入讨论。`
  ],
  follow_up: [
    ({ targetName, reference, detailKind }) =>
      detailKind === 'example'
        ? `${hostTargetReference(targetName, reference)}，能举一个具体情形吗？`
        : detailKind === 'condition'
          ? `${hostTargetReference(targetName, reference)}，在什么条件下这个判断才成立？`
          : `${hostTargetReference(targetName, reference)}，哪项记录可以核对这个判断？`,
    ({ targetName, reference, detailKind }) =>
      detailKind === 'example'
        ? `围绕${hostTargetReference(targetName, reference)}，能补充一个实际例子吗？`
        : detailKind === 'condition'
          ? `针对${hostTargetReference(targetName, reference)}，成立前还需要满足什么条件？`
          : `关于${hostTargetReference(targetName, reference)}，有什么证据可以验证？`,
    ({ targetName, reference, detailKind }) =>
      detailKind === 'example'
        ? `能否用一个具体案例说明${hostTargetReference(targetName, reference)}？`
        : detailKind === 'condition'
          ? `${hostTargetReference(targetName, reference)}适用于哪些条件？`
          : `哪项记录可以检验${hostTargetReference(targetName, reference)}？`,
    ({ targetName, reference, detailKind }) =>
      detailKind === 'example'
        ? `围绕${hostTargetReference(targetName, reference)}，能描述一个可核对的情形吗？`
        : detailKind === 'condition'
          ? `要把${hostTargetReference(targetName, reference)}用于现场，需要先满足什么条件？`
          : `核实${hostTargetReference(targetName, reference)}时，哪项证据最关键？`
  ],
  invite: [
    ({ targetName, profession, targetHasSpoken, reference }) =>
      targetHasSpoken
        ? `${hostTargetReference(targetName, reference)}，请补充一个尚未谈到的观察点。`
        : `${targetName}，结合${profession}的工作，你对这个议题的初步判断是什么？`,
    ({ targetName, profession, targetHasSpoken, reference }) =>
      targetHasSpoken
        ? `沿着${hostTargetReference(targetName, reference)}，请从另一个角度补充判断。`
        : `${targetName}，从${profession}角度看，你支持还是反对这项安排？`,
    ({ targetName, profession, targetHasSpoken, reference }) =>
      targetHasSpoken
        ? `也请${hostTargetReference(targetName, reference)}之外的内容补充判断。`
        : `也请${targetName}亮明立场：你认为这项安排值得推进？`,
    ({ targetName, targetHasSpoken, reference }) =>
      targetHasSpoken
        ? `${hostTargetReference(targetName, reference)}还涉及哪些新角度？`
        : `${targetName}，你对这个议题是支持、反对，还是有条件支持？`
  ],
  bridge: [
    ({ targetName, divergence, sides, targetIsInDivergence, otherName }) =>
      sides.length >= 2 && targetIsInDivergence
        ? `${namedPosition(sides[0]?.name ?? '一方', sides[0]?.position ?? '')}；${namedPosition(sides[1]?.name ?? '另一方', sides[1]?.position ?? '')}。${targetName}，你怎么回应${otherName}的判断？`
        : `${divergence}上还有不同判断。${targetName}，你会先核对什么？`,
    ({ targetName, divergence, sides, targetIsInDivergence, otherName }) =>
      sides.length >= 2 && targetIsInDivergence
        ? `分歧在${divergence}：${namedPosition(sides[0]?.name ?? '一方', sides[0]?.position ?? '')}；${namedPosition(sides[1]?.name ?? '另一方', sides[1]?.position ?? '')}。${targetName}，能否回应${otherName}提出的条件？`
        : `关于${divergence}，还需要补上另一种判断。${targetName}，你会先检查哪项条件？`,
    ({ targetName, divergence, sides, targetIsInDivergence, otherName }) =>
      sides.length >= 2 && targetIsInDivergence
        ? `关于${divergence}，${namedPosition(sides[0]?.name ?? '一方', sides[0]?.position ?? '')}；${namedPosition(sides[1]?.name ?? '另一方', sides[1]?.position ?? '')}。${targetName}，你准备怎样回应${otherName}的主张？`
        : `${divergence}仍有关键依据待核对。${targetName}，你认为哪条证据最重要？`,
    ({ targetName, divergence, sides, targetIsInDivergence, otherName }) =>
      sides.length >= 2 && targetIsInDivergence
        ? `${namedPosition(sides[0]?.name ?? '一方', sides[0]?.position ?? '')}；${namedPosition(sides[1]?.name ?? '另一方', sides[1]?.position ?? '')}。${targetName}，你对${otherName}的主张有什么回应？`
        : `${divergence}的边界还没有说清。${targetName}，什么条件会改变你的判断？`
  ],
  closing: [
    () => '今天的讨论先到这里，感谢各位嘉宾分享具体判断。',
    () => '感谢各位把不同依据说清楚，也感谢观众收看。',
    () => '本场先告一段落，后续可以继续核对讨论中的条件。',
    () => '谢谢各位嘉宾参与，也感谢观众陪伴这场讨论。'
  ]
};

function argumentSideCoverage(
  topic: string,
  roster: readonly MockRosterEntry[],
  events: readonly { speakerAlias: string; content: string }[]
): Map<string, Set<string>> {
  const coverage = new Map(
    topicIssues(topic).map(({ issue }) => [issue, new Set<string>()])
  );
  for (const event of events) {
    if (!isExpertAlias(event.speakerAlias)) {
      continue;
    }
    const speaker = rosterEntry(roster, event.speakerAlias);
    const profile = speaker && profileForSpeaker(topic, speaker);
    if (!profile) {
      continue;
    }
    for (const argument of profile.arguments) {
      if (
        event.content.includes(argument.claim) ||
        event.content.includes(argument.text) ||
        event.content.includes(argument.position) ||
        event.content.includes(argument.detail.text)
      ) {
        coverage.get(argument.issue)?.add(argument.side);
      }
    }
    if (event.content.includes(profile.stanceClaim)) {
      const stanceArgument = profile.arguments[0];
      if (stanceArgument) {
        coverage.get(stanceArgument.issue)?.add(stanceArgument.side);
      }
    }
  }
  return coverage;
}

function leastCoveredArgument(
  topic: string,
  speaker: MockRosterEntry,
  candidates: readonly MockArgument[],
  roster: readonly MockRosterEntry[],
  events: readonly { speakerAlias: string; content: string }[]
): MockArgument | undefined {
  const issues = topicIssues(topic);
  const coverage = argumentSideCoverage(topic, roster, events);
  const seat = Math.max(0, Number(speaker.alias.slice(1)) - 1);
  return [...candidates].sort((left, right) => {
    const leftIssueIndex = issues.findIndex(({ issue }) => issue === left.issue);
    const rightIssueIndex = issues.findIndex(({ issue }) => issue === right.issue);
    const leftSides = coverage.get(left.issue) ?? new Set<string>();
    const rightSides = coverage.get(right.issue) ?? new Set<string>();
    const leftScore =
      leftSides.size === 0 ? 1 : leftSides.size === 1 && !leftSides.has(left.side) ? 0 : leftSides.size === 1 ? 2 : 3;
    const rightScore =
      rightSides.size === 0 ? 1 : rightSides.size === 1 && !rightSides.has(right.side) ? 0 : rightSides.size === 1 ? 2 : 3;
    const seatOffset = (issueIndex: number) =>
      (issueIndex - (seat % issues.length) + issues.length) % issues.length;
    return (
      leftScore - rightScore ||
      seatOffset(leftIssueIndex) - seatOffset(rightIssueIndex)
    );
  })[0];
}

function buildBid(
  context: MockContext,
  callIndex: number,
  discussionId: string,
  generatedActs: readonly MockGeneratedAct[]
): unknown {
  const entries = transcriptEntries(context);
  const speakerAlias = readString(context.speakerAlias, 'E1');
  const roster = readRoster(context);
  const speaker = speakerFromContext(context, speakerAlias, roster);
  const topic = readString(context.topic);
  const latestHostUtterance = [...entries]
    .reverse()
    .find(({ speakerAlias: alias }) => alias === 'H');
  const hostContent = latestHostUtterance?.content ?? '';
  const hostNamedExperts = roster.filter(
    ({ alias, name }) =>
      isExpertAlias(alias) && hostContent.includes(name)
  );
  const namedHostTarget =
    latestHostUtterance?.replyToAlias && isExpertAlias(latestHostUtterance.replyToAlias)
      ? latestHostUtterance.replyToAlias
      : latestHostUtterance
        ? roster.find(
            ({ alias, name }) =>
              isExpertAlias(alias) &&
              (latestHostUtterance.content.includes(`${name}，`) ||
                latestHostUtterance.content.includes(`${name}刚才`))
          )?.alias
        : undefined;
  const isNamedHostPrompt =
    Boolean(latestHostUtterance && namedHostTarget);
  const hostPromptAnswered = Boolean(
    latestHostUtterance &&
      namedHostTarget &&
      entries.some(
        ({ seq, speakerAlias: alias }) =>
          seq > latestHostUtterance.seq && alias === namedHostTarget
      )
  );
  const hostPromptPending = isNamedHostPrompt && !hostPromptAnswered;
  const isBridgePrompt =
    hostPromptPending &&
    /回应/u.test(hostContent) &&
    hostNamedExperts.length >= 2;
  const addressedByHost =
    context.addressed === true ||
    ((context.wasAddressed === true || context.isAddressed === true) &&
      !hostPromptAnswered) ||
    (hostPromptPending && namedHostTarget === speakerAlias);
  const anotherExpertAddressed =
    hostPromptPending && namedHostTarget !== speakerAlias;
  const seed = `${discussionId}:${callIndex}:${speakerAlias}`;
  const interruptAvailability = isRecord(context.interruptAvailability)
    ? context.interruptAvailability
    : {};
  const interruptAllowed = interruptAvailability.allowed === true;
  const interruptOdds = createRng(`mock-bid-interrupt:${seed}`)();
  const speakerArguments = argumentsForSpeaker(topic, speaker);
  const speakerHistory = [
    ...entries
      .filter(({ speakerAlias: alias }) => alias === speakerAlias)
      .map(({ content }) => content),
    ...generatedActs
      .filter(({ speakerAlias: alias }) => alias === speakerAlias)
      .map(({ content }) => content)
  ];
  const unusedArguments = speakerArguments.filter(
    ({ claim, text, position, detail }) =>
      speakerHistory.every(
        (content) =>
          !content.includes(claim) &&
          !content.includes(text) &&
          !content.includes(position) &&
          !content.includes(detail.text)
      )
  );
  const bridgeOpponentAlias =
    addressedByHost && isBridgePrompt && latestHostUtterance
      ? roster.find(
          ({ alias, name }) =>
            isExpertAlias(alias) &&
            alias !== speakerAlias &&
            latestHostUtterance.content.includes(name)
        )?.alias
      : undefined;
  const bridgeOpponentEntry =
    bridgeOpponentAlias && latestHostUtterance
      ? [...entries]
          .reverse()
          .find(
            ({ speakerAlias: alias, seq }) =>
              alias === bridgeOpponentAlias && seq < latestHostUtterance.seq
          )
      : undefined;
  const previousExpertEntry =
    [...entries]
      .reverse()
      .find(
        ({ speakerAlias: alias }) =>
          isExpertAlias(alias) && alias !== speakerAlias
      );
  const peerEntry =
    isBridgePrompt && addressedByHost
      ? bridgeOpponentEntry
      : previousExpertEntry;
  const peer = peerEntry
    ? rosterEntry(roster, peerEntry.speakerAlias)
    : undefined;
  const peerArgument =
    peer && peerEntry
      ? positionArgumentForContent(topic, peer, peerEntry.content)
      : undefined;
  const matchingUnusedArgument = peerArgument
    ? unusedArguments.find(
        ({ issue }) => issue === peerArgument.issue
      )
    : undefined;
  const supplementSpoken = generatedActs.some(({ act }) => act === 'supplement');
  const rebutSpoken = generatedActs.some(({ act }) => act === 'rebut');
  const deferObjection =
    entries.some(({ speakerAlias }) => speakerAlias === 'H') &&
    generatedActs.length >= 2 &&
    !supplementSpoken;
  const expertAliases = roster
    .map(({ alias }) => alias)
    .filter(isExpertAlias)
    .sort(
      (left, right) =>
        Number(left.slice(1)) - Number(right.slice(1))
    );
  const previousExpertIndex = expertAliases.indexOf(
    previousExpertEntry?.speakerAlias ?? ''
  );
  const nextExpectedAlias =
    previousExpertIndex < 0
      ? expertAliases[0]
      : expertAliases[(previousExpertIndex + 1) % expertAliases.length];
  const deterministicBid =
    speakerAlias === nextExpectedAlias;
  const lastSpeakerAlias =
    entries.at(-1)?.speakerAlias ?? generatedActs.at(-1)?.speakerAlias;
  const speakerJustSpoke = lastSpeakerAlias === speakerAlias;
  let proposedIntent: 'raise_hand' | 'supplement' | 'rebut' | 'interrupt';
  if (addressedByHost && !isBridgePrompt) {
    proposedIntent = 'raise_hand';
  } else if (matchingUnusedArgument && peerArgument) {
    if (matchingUnusedArgument.side === peerArgument.side) {
      proposedIntent = 'supplement';
    } else if (deferObjection) {
      // 讨论已展开且本场还没有出现补充：调度器的 intent 权重偏向反驳与抢答，
      // 只靠紧急度压不住；先让同向补充上场，再恢复反驳与抢答（F 节补充稳定性）。
      proposedIntent = 'raise_hand';
    } else {
      proposedIntent =
        interruptAllowed && interruptOdds < 0.55 ? 'interrupt' : 'rebut';
    }
  } else {
    proposedIntent = 'raise_hand';
  }
  const firstSupplement = proposedIntent === 'supplement' && !supplementSpoken;
  const firstObjection =
    !rebutSpoken &&
    (proposedIntent === 'rebut' ||
      (proposedIntent === 'interrupt' &&
        Boolean(
          matchingUnusedArgument &&
            peerArgument &&
            matchingUnusedArgument.side !== peerArgument.side
        )));
  const wantsToSpeak =
    addressedByHost ||
    (!speakerJustSpoke &&
      !anotherExpertAddressed &&
      Boolean(
        unusedArguments.length === 0
          ? peerEntry
          : deterministicBid ||
              firstSupplement ||
              firstObjection ||
              createRng(`mock-bid-wants:${seed}`)() < 0.58
      ));
  const intent =
    proposedIntent === 'interrupt' &&
    (!wantsToSpeak || !matchingUnusedArgument || !peerArgument ||
      matchingUnusedArgument.side === peerArgument.side)
      ? 'rebut'
      : proposedIntent;
  const urgencySample = createRng(`mock-bid-urgency:${seed}`)();
  const urgency = !wantsToSpeak
    ? anotherExpertAddressed
      ? 0.05 + urgencySample * 0.1
      : 0.15 + urgencySample * 0.2
    : addressedByHost
      ? 0.99
      : intent === 'interrupt'
        ? 0.86 + urgencySample * 0.1
        : firstSupplement || (intent === 'rebut' && !rebutSpoken)
          ? 0.95 + urgencySample * 0.03
          : matchingUnusedArgument &&
              (intent === 'rebut' || proposedIntent === 'supplement')
            ? 0.82 + urgencySample * 0.12
            : deterministicBid
              ? 0.88 + urgencySample * 0.08
              : 0.58 + urgencySample * 0.2;
  const replyTo = addressedByHost && !isBridgePrompt
    ? 'H'
    : addressedByHost && isBridgePrompt && bridgeOpponentAlias
      ? bridgeOpponentAlias
      : peer?.alias ?? null;
  const replyTarget =
    replyTo && replyTo !== 'H' ? rosterEntry(roster, replyTo) : undefined;
  const defaultFocus =
    matchingUnusedArgument?.position ??
    leastCoveredArgument(topic, speaker, unusedArguments, roster, [
      ...entries,
      ...generatedActs
    ])?.position ??
    sentencePoint(speaker.stance);
  const focus = replyTarget
    ? `回应${replyTarget.name}的观点`
    : addressedByHost
      ? `回应主持人的追问`
      : Array.from(defaultFocus).slice(0, 20).join('');

  return {
    wantToSpeak: wantsToSpeak,
    intent,
    urgency: Number(urgency.toFixed(2)),
    replyTo,
    focus
  };
}

function quotedClaim(content: string): string | undefined {
  return content.match(/[“"]([^”"]+)[”"]/u)?.[1];
}

function asksForDetailKind(
  content: string,
  detailKind: MockDetailKind
): boolean {
  const unquotedContent = content.replace(/[“"][^”"]+[”"]/gu, '');
  const cues: Record<MockDetailKind, RegExp> = {
    example: /例|案例|情形/u,
    condition: /条件|成立|适用/u,
    evidence: /记录|证据|核对|检验/u
  };
  return cues[detailKind].test(unquotedContent);
}

interface ExhaustedResponseData {
  reference: string;
  detail: string;
}

const EXHAUSTED_RESPONSE_TEMPLATES: Record<
  string,
  readonly TextTemplate<ExhaustedResponseData>[]
> = {
  statement: [
    ({ reference, detail }) => `针对${reference}，我会先核对${detail}。`,
    ({ reference, detail }) => `沿着${reference}，我想确认${detail}。`,
    ({ reference, detail }) => `回到${reference}，还需要检查${detail}。`,
    ({ reference, detail }) => `关于${reference}，我会重点看${detail}。`,
    ({ reference, detail }) => `结合${reference}，接下来应核实${detail}。`,
    ({ reference, detail }) => `要回应${reference}，还得把${detail}核清。`
  ],
  rebut: [
    ({ reference, detail }) => `我不同意${reference}，还要核对${detail}。`,
    ({ reference, detail }) => `对${reference}，我不赞同：${detail}也要一起看。`,
    ({ reference, detail }) => `我不认同${reference}，还要核对${detail}。`,
    ({ reference, detail }) => `听完${reference}，我不敢苟同，${detail}还说不清。`,
    ({ reference, detail }) => `我和${reference}相反，${detail}就是关键。`,
    ({ reference, detail }) => `在这点上我和${reference}不一样，${detail}还要看。`
  ],
  interrupt: [
    ({ reference, detail }) => `我先反对${reference}这个判断，还要核对${detail}。`,
    ({ reference, detail }) => `我先插一句，${reference}我不认同，还要看${detail}。`,
    ({ reference, detail }) => `对不起，${reference}我不赞同，${detail}还要确认。`,
    ({ reference, detail }) => `先停一下，${reference}我不敢苟同，${detail}也少不了。`,
    ({ reference, detail }) => `我要反对${reference}，${detail}也要核。`,
    ({ reference, detail }) => `对于${reference}，我难以认同，${detail}马上要核对。`
  ],
  supplement: [
    ({ reference, detail }) => `我认同${reference}，补充一点：${detail}。`,
    ({ reference, detail }) => `沿着${reference}，还可以核对${detail}。`,
    ({ reference, detail }) => `在${reference}基础上，另一个条件是${detail}。`,
    ({ reference, detail }) => `我也有同感，${detail}也值得看。`,
    ({ reference, detail }) => `承接${reference}，可以进一步核验${detail}。`,
    ({ reference, detail }) => `针对${reference}，另一个待核对点是${detail}。`
  ]
};

const NEGATIVE_REFERENCE_TEMPLATES: Record<
  'rebut' | 'interrupt',
  readonly TextTemplate<ExhaustedResponseData>[]
> = {
  rebut: [
    ({ reference, detail }) => `对${reference}，我倒不这么看，还要核对${detail}。`,
    ({ reference, detail }) => `${reference}这一点，我有不同看法：${detail}也要看。`,
    ({ reference, detail }) => `说实话，${reference}恐怕要分情况看，${detail}还要核。`,
    ({ reference, detail }) => `对${reference}，我说个反例：${detail}。`,
    ({ reference, detail }) => `我不这么看：${reference}，${detail}也说明问题。`,
    ({ reference, detail }) => `在这点上我和${reference}相反，${detail}就是我的依据。`
  ],
  interrupt: [
    ({ reference, detail }) => `我先打断一下，对${reference}，我倒不这么看：${detail}。`,
    ({ reference, detail }) => `等一下，${reference}恐怕要分情况看，${detail}还要核。`,
    ({ reference, detail }) => `我先插一句，${reference}我有不同看法：${detail}。`,
    ({ reference, detail }) => `对不起打断一下，${reference}我说个反例：${detail}。`,
    ({ reference, detail }) => `先停一下，我不这么看：${reference}，${detail}也支持我。`,
    ({ reference, detail }) => `我必须马上回应${reference}，这点我说个反例：${detail}。`
  ]
};

function exhaustedResponse(
  act: string,
  speakerAlias: string,
  targetName: string,
  sourceClaim: string | undefined,
  sourceArgument: MockArgument | undefined,
  nextTemplateIndex: (scope: string, count: number) => number
): string {
  const fallbackDetails = ['适用条件', '前提范围', '实际影响', '核对方式'];
  const detail =
    sourceArgument?.detail.text ??
    fallbackDetails[
      nextTemplateIndex(
        `utterance:${act}:exhausted-detail:${speakerAlias}`,
        fallbackDetails.length
      )
    ]!;
  const containsNegativeReference =
    /(?:反对|不支持|不赞成|不认同|不赞同|担心|担忧|警惕|质疑)/u.test(
      sourceClaim ?? detail
    );
  const templates =
    containsNegativeReference &&
    (act === 'rebut' || act === 'interrupt')
      ? NEGATIVE_REFERENCE_TEMPLATES[act]
      :
    EXHAUSTED_RESPONSE_TEMPLATES[act] ??
    EXHAUSTED_RESPONSE_TEMPLATES.statement!;
  const reference = sourceClaim
    ? `${targetName}刚才说的“${sourceClaim}”`
    : `${targetName}刚才的判断`;
  const index = nextTemplateIndex(
    `utterance:${act}:exhausted:${speakerAlias}`,
    templates.length
  );
  return templates[index]?.({ reference, detail }) ?? templates[0]!({
    reference,
    detail
  });
}

function buildUtterance(
  context: MockContext,
  nextTemplateIndex: (scope: string, count: number) => number,
  nextUtteranceIndex: (speakerAlias: string) => number,
  generatedActs: readonly MockGeneratedAct[]
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
  const topic = readString(context.topic);
  const argumentList = argumentsForSpeaker(topic, speaker);
  const utteranceIndex = nextUtteranceIndex(speakerAlias);
  const firstSpeech = utteranceIndex === 0;
  const earlierSpeech = [
    ...entries
      .filter(({ speakerAlias: alias }) => alias === speakerAlias)
      .map(({ content }) => content),
    ...generatedActs
      .filter(({ speakerAlias: alias }) => alias === speakerAlias)
      .map(({ content }) => content)
  ];
  const unusedArguments = argumentList.filter(
    ({ claim, text, position, detail }) =>
      earlierSpeech.every(
        (content) =>
          !content.includes(claim) &&
          !content.includes(text) &&
          !content.includes(position) &&
          !content.includes(detail.text)
      )
  );
  const targetName =
    target?.name ?? targetUtterance?.speakerName ?? '前一位嘉宾';
  const reference =
    target && targetUtterance
      ? positionReferenceForUtterance(topic, target, targetUtterance)
      : '';
  const latestHostPrompt = [...entries]
    .reverse()
    .find(({ speakerAlias: alias }) => alias === 'H');
  const bridgePromptTargetAlias = latestHostPrompt
    ? roster.find(
        ({ alias, name }) =>
          isExpertAlias(alias) &&
          (latestHostPrompt.content.includes(`${name}，`) ||
            latestHostPrompt.content.includes(`${name}刚才`))
      )?.alias
    : undefined;
  const isBridgeReply = Boolean(
    target &&
      target.alias !== 'H' &&
      latestHostPrompt &&
      bridgePromptTargetAlias === speakerAlias &&
      latestHostPrompt.content.includes(target.name) &&
      /回应/u.test(latestHostPrompt.content) &&
      !entries.some(
        ({ seq, speakerAlias: alias }) =>
          seq > latestHostPrompt.seq && alias === bridgePromptTargetAlias
      ) &&
      roster.filter(
        ({ alias, name }) =>
          isExpertAlias(alias) && latestHostPrompt.content.includes(name)
      ).length >= 2
  );
  const targetArgument =
    target && targetUtterance
      ? positionArgumentForContent(topic, target, targetUtterance.content)
      : undefined;
  const followUpQuestion = [...entries].reverse().find((entry) => {
    if (
      entry.speakerAlias !== 'H' ||
      target?.alias !== 'H' ||
      !entry.content.includes(speaker.name) ||
      entries.some(
        ({ seq, speakerAlias: alias }) =>
          seq > entry.seq && alias === speakerAlias
      )
    ) {
      return false;
    }
    const source = latestReply(entries, speakerAlias, entry.seq);
    const sourceArgument =
      source && argumentForContent(topic, speaker, source.content);
    return Boolean(
      sourceArgument &&
        quotedClaim(entry.content) === sourceArgument.claim &&
        asksForDetailKind(entry.content, sourceArgument.detail.kind)
    );
  });
  const followUpSource = followUpQuestion
    ? latestReply(entries, speakerAlias, followUpQuestion.seq)
    : undefined;
  const followUpArgument =
    followUpSource &&
    argumentForContent(topic, speaker, followUpSource.content);
  const followUpDetail = followUpArgument?.detail;
  const isFollowUpAnswer =
    act === 'statement' &&
    Boolean(followUpQuestion && followUpDetail && target?.alias === 'H');
  const targetedIssue =
    targetArgument &&
    ['supplement', 'rebut', 'interrupt'].includes(act)
      ? targetArgument.issue
      : undefined;
  const targetedArgument = targetedIssue
    ? unusedArguments.find(
        ({ issue, side }) =>
          issue === targetedIssue &&
          (!isBridgeReply || side !== targetArgument?.side)
      )
    : undefined;
  const argument =
    (isFollowUpAnswer && followUpDetail
      ? argumentList.find(
          ({ issue }) =>
            issue ===
            argumentForContent(topic, speaker, followUpSource!.content)?.issue
        )
      : undefined) ??
    targetedArgument ??
    (firstSpeech && act === 'statement'
      ? leastCoveredArgument(
          topic,
          speaker,
          unusedArguments.filter(
            ({ issue }) => issue !== argumentList[0]?.issue
          ),
          roster,
          [...entries, ...generatedActs]
        )
      : undefined) ??
    leastCoveredArgument(
      topic,
      speaker,
      unusedArguments,
      roster,
      [...entries, ...generatedActs]
    );
  if (!argument) {
    if (target && target.alias !== 'H' && targetUtterance) {
      return exhaustedResponse(
        act,
        speakerAlias,
        targetName,
        spokenClaimForContent(topic, target, targetUtterance.content),
        targetArgument,
        nextTemplateIndex
      );
    }
    const lastPeer = [...entries]
      .reverse()
      .find(({ speakerAlias: alias }) => isExpertAlias(alias) && alias !== speakerAlias);
    const peer = lastPeer ? rosterEntry(roster, lastPeer.speakerAlias) : undefined;
    const peerArgument =
      peer && lastPeer
        ? argumentForContent(topic, peer, lastPeer.content)
        : undefined;
    const peerClaim =
      peer && lastPeer
        ? spokenClaimForContent(topic, peer, lastPeer.content)
        : undefined;
    if (peer && lastPeer) {
      return exhaustedResponse(
        act,
        speakerAlias,
        peer.name,
        peerClaim,
        peerArgument,
        nextTemplateIndex
      );
    }
    throw new Error(
      `Mock speaker ${speakerAlias} has no unused argument or identifiable prior claim`
    );
  }
  const responseArgument: MockArgument = isFollowUpAnswer
    ? {
        ...argument,
        text: followUpDetail!.text
      }
    : argument;
  const data: UtteranceTemplateData = {
    firstSpeech,
    targetIsHost:
      target?.alias === 'H' || targetUtterance?.speakerAlias === 'H',
    targetName,
    reference,
    negative: referenceHasNegativeStance(reference),
    stance: speaker.stance,
    argument: responseArgument
  };
  if (isFollowUpAnswer) {
    const opener =
      responseArgument.detail.kind === 'example'
        ? '比如，'
        : responseArgument.detail.kind === 'condition'
          ? '前提是，'
          : '可以';
    return `${opener}${responseArgument.text}`;
  }
  if (isBridgeReply && targetArgument) {
    const targetProfile = profileForSpeaker(topic, target!);
    const targetClaim =
      targetProfile &&
      targetUtterance?.content.includes(targetProfile.stanceClaim)
        ? targetProfile.stanceClaim
        : targetArgument.claim;
    const bridgeLead = referenceHasNegativeStance(`“${targetClaim}”`)
      ? `${targetName}刚才说“${targetClaim}”，我倒不这么看`
      : `${targetName}刚才说的“${targetClaim}”，我不同意`;
    const unusedOpposing =
      argument &&
      argument.issue === targetArgument.issue &&
      argument.side !== targetArgument.side
        ? argument
        : undefined;
    if (unusedOpposing) {
      return `${bridgeLead}：${unusedOpposing.text}`;
    }
    const opposing = argumentList.find(
      ({ issue, side }) =>
        issue === targetArgument.issue && side !== targetArgument.side
    );
    if (
      opposing &&
      earlierSpeech.every((content) => !content.includes(opposing.detail.text))
    ) {
      return `${bridgeLead}，具体要看：${opposing.detail.text}。`;
    }
    if (
      opposing &&
      earlierSpeech.every((content) => !content.includes(opposing.position))
    ) {
      return `${bridgeLead}：我仍${opposing.position}。`;
    }
    return exhaustedResponse(
      act,
      speakerAlias,
      targetName,
      targetClaim,
      undefined,
      nextTemplateIndex
    );
  }
  const index = nextTemplateIndex(`utterance:${act}`, templates.length);
  return templates[index]?.(data) ?? templates[0]!(data);
}

function parseDivergence(
  context: MockContext,
  roster: readonly MockRosterEntry[]
): {
  content: string;
  sides: Array<{ alias: string; name: string; position: string }>;
} {
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
                  alias: participant.alias,
                  name: participant.name,
                  position: value.position
                    .replace(/[。！？!?]+$/u, '')
                    .trim()
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
                alias: participant.alias,
              name: participant.name,
                position: (match[2] ?? '').replace(/[。！？!?]+$/u, '').trim()
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
  const topic = readString(context.topic);
  const targetArgument =
    target && targetUtterance
      ? argumentForContent(topic, target, targetUtterance.content)
      : undefined;
  const divergence = parseDivergence(context, roster);
  const divergenceLabel =
    divergence.content
      .replace(/^\s*(?:围绕|关于)/u, '')
      .split(/[：:，,。！？!?；;]/u)[0]
      ?.trim() || '这个议题';
  const targetSide = divergence.sides.find(
    ({ alias }) => alias === targetAlias
  );
  const otherSide = targetSide
    ? divergence.sides.find(({ alias }) => alias !== targetAlias)
    : undefined;
  const guestList = roster
    .filter(({ alias }) => alias !== 'H')
    .map(({ name, profession, title }) => `${name}（${profession} · ${title}）`)
    .join('、');
  const data: HostTemplateData = {
    fullTopic: topic || '本场议题',
    guestList: guestList || '嘉宾名单待提供',
    targetName: target?.name ?? '这位嘉宾',
    targetHasSpoken:
      context.targetHasSpoken === true || Boolean(targetUtterance),
    profession: target?.profession ?? '专业领域',
    reference:
      target && targetUtterance
        ? referenceForUtterance(topic, target, targetUtterance)
        : '这个问题',
    detailKind: targetArgument?.detail.kind ?? 'evidence',
    divergence: divergenceLabel,
    targetIsInDivergence: Boolean(targetSide),
    otherName: otherSide?.name ?? '另一方',
    sides: divergence.sides
  };
  const index = nextTemplateIndex(`host:${action}`, templates.length);
  return templates[index]?.(data) ?? templates[0]!(data);
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
  issue: string
): string | null {
  const text = readString(
    context.existingInsightsText,
    readString(context.insightsText)
  );
  const matches = text.split(/\r?\n/u).find((line) => {
    const content = line.match(/^D\d+\s+分歧[：:]\s*(.*)$/u)?.[1] ?? '';
    const existingIssue = content.split(/[：:；;]/u)[0]?.trim();
    return existingIssue === issue;
  });
  return matches?.match(/^(D\d+)\b/u)?.[1] ?? null;
}

function buildInsights(context: MockContext): unknown {
  const roster = readRoster(context);
  const { window, added } = insightUtterances(context);
  const topic = readString(context.topic);
  const definitions = topicIssues(topic);
  const consensus = new Map<string, Record<string, unknown>>();
  const divergences = new Map<string, Record<string, unknown>>();

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
    if (!related) {
      continue;
    }
    const evidence = [related.seq, utterance.seq].sort(
      (left, right) => left - right
    );
    const relatedArgument = insightArgumentForContent(
      topic,
      target,
      related.content
    );
    const speakerArgument = insightArgumentForContent(
      topic,
      speaker,
      utterance.content
    );
    if (
      !relatedArgument ||
      !speakerArgument ||
      relatedArgument.issue !== speakerArgument.issue
    ) {
      continue;
    }
    const issue = definitions.find(
      (definition) => definition.issue === relatedArgument.issue
    );
    if (!issue) {
      continue;
    }
    const pair = [speaker, target].sort(
      (left, right) =>
        Number(left.alias.slice(1)) - Number(right.alias.slice(1))
    );
    const argumentsByAlias = new Map([
      [speakerAlias, speakerArgument],
      [replyToAlias, relatedArgument]
    ]);
    if (
      utterance.act === 'supplement' &&
      speakerArgument.side === relatedArgument.side
    ) {
      const key = `${issue.issue}:${pair.map(({ alias }) => alias).join(':')}`;
      consensus.set(key, {
        ref: null,
        content: `${pair[0]!.name}与${pair[1]!.name}都${relatedArgument.position}`,
        participants: pair.map(({ alias }) => alias),
        evidence
      });
    } else if (
      (utterance.act === 'rebut' || utterance.act === 'interrupt') &&
      speakerArgument.side !== relatedArgument.side
    ) {
      const stances = pair.flatMap((participant) => {
        const argument = argumentsByAlias.get(participant.alias);
        return argument
          ? [{ who: participant.alias, position: argument.position }]
          : [];
      });
      const sideContent = issue.sides.join('；');
      const divergenceKey = issue.issue;
      divergences.set(divergenceKey, {
        ref: existingDivergenceRef(context, issue.issue),
        content: `${issue.issue}：${sideContent}`,
        stances,
        evidence,
        resolved: false
      });
    }
  }
  return {
    consensus: [...consensus.values()],
    divergences: [...divergences.values()]
  };
}

interface SummaryInsightLine {
  kind: 'consensus' | 'divergence';
  content: string;
  stances: Array<{ name: string; position: string }>;
}

function parseInsightLines(text: string): SummaryInsightLine[] {
  return text.split(/\r?\n/u).flatMap((line) => {
    const match = line.match(/^[CD]\d+\s+(共识|分歧)：(.+)$/u);
    if (!match) {
      return [];
    }
    const kind = match[1] === '共识' ? 'consensus' : 'divergence';
    let body = match[2] ?? '';
    const stances: Array<{ name: string; position: string }> = [];
    const stanceMatch = body.match(/（([^（）]*)）\s*(?:（已化解）)?$/u);
    if (stanceMatch) {
      body = body.slice(0, stanceMatch.index).trim();
      for (const part of (stanceMatch[1] ?? '').split(/[；;]/u)) {
        const stance = part.trim().match(/^(.+?)：(.*)$/u);
        if (stance) {
          stances.push({
            name: (stance[1] ?? '').trim(),
            position: (stance[2] ?? '').trim()
          });
        }
      }
    }
    return [{ kind, content: body.trim(), stances }];
  });
}

const POSITION_STANCE_VERB =
  /^(有条件支持|有条件反对|并不支持|不太支持|不支持|不赞成|不认同|不赞同|不反对|不看好|支持|赞成|认同|认可|赞同|反对|担心|担忧|警惕|质疑|审慎|谨慎|主张|认为|倾向|保留|强调|要求|指出|建议|重视|说明|核算|分组|提前)/u;

function positionStanceVerb(position: string): string {
  return position.match(POSITION_STANCE_VERB)?.[1] ?? '认为';
}

function buildSummary(context: MockContext): string {
  const topic = readString(context.topic) || '本场议题';
  const roster = readRoster(context);
  const transcript = transcriptEntries(context);
  const expertEntries = transcript.filter(({ speakerAlias }) =>
    isExpertAlias(speakerAlias)
  );
  const spokenAliases = [
    ...new Set(expertEntries.map(({ speakerAlias }) => speakerAlias))
  ].sort((left, right) => Number(left.slice(1)) - Number(right.slice(1)));
  const seatOf = (name: string) =>
    roster.find((entry) => entry.name === name && isExpertAlias(entry.alias))
      ?.alias ?? 'E9';
  const spokenArgumentsFor = (alias: string) => {
    const speaker = rosterEntry(roster, alias);
    if (!speaker) {
      return [];
    }
    const argumentList = argumentsForSpeaker(topic, speaker);
    const spoken: Array<{ position: string; claim: string }> = [];
    for (const utterance of expertEntries.filter(
      (entry) => entry.speakerAlias === alias
    )) {
      const argument = argumentList.find(
        ({ claim, text }) =>
          utterance.content.includes(claim) || utterance.content.includes(text)
      );
      if (argument && !spoken.some(({ claim }) => claim === argument.claim)) {
        spoken.push({ position: argument.position, claim: argument.claim });
      }
    }
    return spoken.length > 0
      ? spoken
      : [
          {
            position: argumentList[0]?.position ?? speaker.stance,
            claim: argumentList[0]?.claim ?? ''
          }
        ];
  };
  const utteranceCountFor = (alias: string) =>
    expertEntries.filter((entry) => entry.speakerAlias === alias).length;

  const verbCounts = new Map<string, number>();
  const speakerClauses = spokenAliases.flatMap((alias) => {
    const speaker = rosterEntry(roster, alias);
    if (!speaker) {
      return [];
    }
    const candidates = spokenArgumentsFor(alias);
    const chosen = candidates.find(
      ({ position }) => (verbCounts.get(positionStanceVerb(position)) ?? 0) < 2
    );
    if (chosen) {
      const verb = positionStanceVerb(chosen.position);
      verbCounts.set(verb, (verbCounts.get(verb) ?? 0) + 1);
      return [namedPosition(speaker.name, chosen.position)];
    }
    return [
      `${speaker.name}的具体依据是“${candidates[0]?.claim ?? ''}”`
    ];
  });
  const firstParagraph =
    `今天的话题是“${topic}”。` +
    (speakerClauses.length > 0
      ? speakerClauses.join('；')
      : '本场讨论先亮出判断，再围绕具体依据展开回应。') +
    (speakerClauses.length > 0 ? '。' : '');

  const insightLines = parseInsightLines(
    readString(context.insightsText, readString(context.existingInsightsText))
  );
  const issueDefinitions = topicIssues(topic);
  const divergenceCandidates = new Map<
    string,
    { issue: string; sides: Map<string, { name: string; claim: string; weight: number }> }
  >();
  for (const line of insightLines) {
    if (line.kind !== 'divergence') {
      continue;
    }
    const issueName = line.content.split(/[：:]/u)[0]?.trim() ?? '';
    const issue = issueDefinitions.find(
      (candidate) => candidate.issue === issueName
    );
    if (!issue) {
      continue;
    }
    for (const stance of line.stances) {
      const speaker = roster.find(
        (entry) => entry.name === stance.name && isExpertAlias(entry.alias)
      );
      const argument =
        speaker &&
        argumentsForSpeaker(topic, speaker).find(
          (candidate) =>
            candidate.issue === issue.issue && candidate.position === stance.position
        );
      if (!speaker || !argument) {
        continue;
      }
      const claimWasSpoken = expertEntries.some(
        (entry) =>
          entry.speakerAlias === speaker.alias &&
          entry.content.includes(argument.claim)
      );
      if (!claimWasSpoken) {
        continue;
      }
      const entry =
        divergenceCandidates.get(issue.issue) ??
        ({ issue: issue.issue, sides: new Map() } as {
          issue: string;
          sides: Map<string, { name: string; claim: string; weight: number }>;
        });
      const weight = utteranceCountFor(speaker.alias);
      const current = entry.sides.get(argument.side);
      if (!current || current.weight < weight) {
        entry.sides.set(argument.side, {
          name: speaker.name,
          claim: argument.claim,
          weight
        });
      }
      divergenceCandidates.set(issue.issue, entry);
    }
  }
  const totalWeight = (entry: {
    sides: Map<string, { weight: number }>;
  }) => [...entry.sides.values()].reduce((total, side) => total + side.weight, 0);
  const rankedDivergences = [...divergenceCandidates.values()]
    .filter((entry) => entry.sides.size === 2)
    .sort((left, right) => totalWeight(right) - totalWeight(left))
    .slice(0, 2);
  const divergenceBlocks = rankedDivergences.map((entry, index) => {
    const ordered = [...entry.sides.values()].sort(
      (left, right) => Number(seatOf(left.name).slice(1)) - Number(seatOf(right.name).slice(1))
    );
    const first = ordered[0]!;
    const second = ordered[1]!;
    return `${index === 0 ? '分歧主要在' : '在'}“${entry.issue}”上：${first.name}认为“${first.claim}”，${second.name}则认为“${second.claim}”`;
  });
  const divergenceParagraph =
    divergenceBlocks.length > 0 ? `${divergenceBlocks.join('。')}。` : '';

  const consensusLine = insightLines.find(
    (line) => line.kind === 'consensus' && line.content.length > 0
  );
  const closingParagraph = consensusLine
    ? `共识方面，${consensusLine.content}。`
    : (() => {
        const covered = new Set(rankedDivergences.map((entry) => entry.issue));
        const openIssue =
          issueDefinitions.find((issue) => !covered.has(issue.issue)) ??
          issueDefinitions[0]!;
        return `还有一个开放问题：${openIssue.issue}上，双方还缺少哪类可对照的记录？`;
      })();
  const thanksParagraph = '感谢各位嘉宾把判断依据说具体，也感谢观众收看。';

  return [firstParagraph, divergenceParagraph, closingParagraph, thanksParagraph]
    .filter(Boolean)
    .join('\n\n');
}


function generateText(
  request: LLMRequest,
  context: MockContext,
  callIndex: number,
  discussionId: string,
  nextTemplateIndex: (scope: string, count: number) => number,
  nextUtteranceIndex: (speakerAlias: string) => number,
  generatedActs: readonly MockGeneratedAct[]
): string {
  let output: string;
  let json = false;
  switch (request.task) {
    case 'lineup':
      output = JSON.stringify(buildLineup(context, request, callIndex));
      json = true;
      break;
    case 'bid':
      output = JSON.stringify(
        buildBid(context, callIndex, discussionId, generatedActs)
      );
      json = true;
      break;
    case 'utterance':
      output = buildUtterance(
        context,
        nextTemplateIndex,
        nextUtteranceIndex,
        generatedActs
      );
      break;
    case 'host':
      output = buildHost(context, nextTemplateIndex);
      break;
    case 'insights':
      output = JSON.stringify(buildInsights(context));
      json = true;
      break;
    case 'summary':
      output = buildSummary(context);
      break;
  }
  return json
    ? normalizeJsonOutput(output)
    : addCjkLatinSpacing(output, [readString(context.topic)]);
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
  const templateOrders = new Map<string, number[]>();
  const utteranceCursors = new Map<string, number>();
  const generatedActsByDiscussion = new Map<string, MockGeneratedAct[]>();

  const createResponse = (
    request: LLMRequest & { model: string }
  ): { text: string; promptTokens: number; completionTokens: number } => {
    if (opts.failOn?.(request)) {
      throw new Error('模拟大模型调用失败');
    }
    const key = `${request.discussionId ?? 'default'}:${request.task}`;
    const callIndex = callCounts.get(key) ?? 0;
    callCounts.set(key, callIndex + 1);
    const discussionId = request.discussionId ?? 'default';
    const requestContext = readContext(request.context);
    const targetAlias = readString(requestContext.targetAlias);
    const context: MockContext = {
      ...requestContext,
      targetHasSpoken:
        request.task === 'host' &&
        isExpertAlias(targetAlias) &&
        (utteranceCursors.get(`${discussionId}:${targetAlias}`) ?? 0) > 0
    };
    const generatedActs =
      generatedActsByDiscussion.get(discussionId) ?? [];
    const nextTemplateIndex = (scope: string, count: number): number => {
      const templateKey = `${discussionId}:${scope}`;
      const cursor = templateCursors.get(templateKey) ?? 0;
      const cycle = Math.floor(cursor / count);
      const offset = cursor % count;
      const orderKey = `${templateKey}:${cycle}`;
      let order = templateOrders.get(orderKey);
      if (!order) {
        order = Array.from({ length: count }, (_, index) => index).sort(
          (left, right) => {
            const leftHash = createRng(
              `mock-template-order:${orderKey}:${left}`
            )();
            const rightHash = createRng(
              `mock-template-order:${orderKey}:${right}`
            )();
            return leftHash - rightHash || left - right;
          }
        );
        templateOrders.set(orderKey, order);
      }
      templateCursors.set(templateKey, cursor + 1);
      return order[offset] ?? 0;
    };
    const nextUtteranceIndex = (speakerAlias: string): number => {
      const utteranceKey = `${discussionId}:${speakerAlias}`;
      const cursor = utteranceCursors.get(utteranceKey) ?? 0;
      utteranceCursors.set(utteranceKey, cursor + 1);
      return cursor;
    };
    const text = generateText(
      request,
      context,
      callIndex,
      discussionId,
      nextTemplateIndex,
      nextUtteranceIndex,
      generatedActs
    );
    if (
      request.task === 'utterance' &&
      isExpertAlias(context.speakerAlias)
    ) {
      generatedActsByDiscussion.set(discussionId, [
        ...generatedActs,
        {
          speakerAlias: context.speakerAlias,
          act: readString(context.act, 'statement'),
          content: text
        }
      ]);
    }
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
