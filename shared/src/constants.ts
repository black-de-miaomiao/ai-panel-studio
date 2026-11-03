export const DISCUSSION_STATUSES = [
  'draft',
  'lineup_ready',
  'live',
  'paused',
  'summarizing',
  'ended',
  'failed'
] as const;

export const PARTICIPANT_ROLES = ['host', 'expert'] as const;

export const AGENT_STATES = ['idle', 'preparing', 'speaking'] as const;

export const BID_INTENTS = [
  'raise_hand',
  'interrupt',
  'supplement',
  'rebut'
] as const;

export const SPEECH_ACTS = [
  'opening',
  'follow_up',
  'bridge',
  'invite',
  'closing',
  'statement',
  'interrupt',
  'supplement',
  'rebut'
] as const;

export const HOST_ACTS = [
  'opening',
  'follow_up',
  'bridge',
  'invite',
  'closing'
] as const;

export const EXPERT_ACTS = [
  'statement',
  'interrupt',
  'supplement',
  'rebut'
] as const;

export const INSIGHT_KINDS = ['consensus', 'divergence'] as const;

export const INSIGHT_STATUSES = ['active', 'resolved'] as const;

export const DISCUSSION_SOURCES = ['user', 'seed'] as const;

export type DiscussionStatus = (typeof DISCUSSION_STATUSES)[number];
export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];
export type AgentState = (typeof AGENT_STATES)[number];
export type BidIntent = (typeof BID_INTENTS)[number];
export type SpeechAct = (typeof SPEECH_ACTS)[number];
export type HostAct = (typeof HOST_ACTS)[number];
export type ExpertAct = (typeof EXPERT_ACTS)[number];
export type InsightKind = (typeof INSIGHT_KINDS)[number];
export type InsightStatus = (typeof INSIGHT_STATUSES)[number];
export type DiscussionSource = (typeof DISCUSSION_SOURCES)[number];

export const HOST_COLOR = '#E8C872';

export const EXPERT_PALETTE = [
  '#5B9DFF',
  '#FF6B9A',
  '#3DDC97',
  '#B18CFF',
  '#FF9F43',
  '#2ED3E6'
] as const;

export const EXPERT_COUNT = { min: 2, max: 6, default: 4 } as const;

export const TOPIC_LENGTH = { min: 2, max: 200 } as const;

export const FIELD_LIMITS = {
  name: 12,
  profession: 20,
  title: 30,
  stance: 80,
  stanceTag: 6,
  persona: 200,
  focus: 40,
  insightContent: 80,
  position: 40
} as const;

export const MAX_SENTENCES = {
  expert: 2,
  hostInterjection: 2,
  opening: 3
} as const;

export const STATUS_LABELS = {
  draft: '生成中',
  lineup_ready: '待开播',
  live: '直播中',
  paused: '已暂停',
  summarizing: '总结中',
  ended: '已结束',
  failed: '生成失败'
} as const;

export const AGENT_STATE_LABELS = {
  idle: '待机',
  preparing: '准备发言',
  speaking: '发言中'
} as const;

export const INTENT_LABELS = {
  raise_hand: '举手',
  interrupt: '抢答',
  supplement: '补充',
  rebut: '反驳'
} as const;

export const ACT_LABELS = {
  opening: '开场',
  follow_up: '追问',
  bridge: '串联',
  invite: '点名',
  closing: '总结',
  statement: '陈述',
  interrupt: '抢答',
  supplement: '补充',
  rebut: '反驳'
} as const;

export const LOBBY_GROUPS = [
  { key: 'live', label: '直播中', statuses: ['live', 'summarizing', 'paused'] },
  {
    key: 'upcoming',
    label: '待开播',
    statuses: ['lineup_ready', 'draft', 'failed']
  },
  { key: 'replay', label: '往期回放', statuses: ['ended'] }
] as const;
export type LobbyGroupKey = (typeof LOBBY_GROUPS)[number]['key'];

export const STATUS_PRIORITY = {
  live: 7,
  summarizing: 6,
  paused: 5,
  lineup_ready: 4,
  draft: 3,
  failed: 2,
  ended: 1
} as const;
