import { describe, expect, it } from 'vitest';
import {
  ACT_LABELS,
  AGENT_STATE_LABELS,
  AGENT_STATES,
  BID_INTENTS,
  DISCUSSION_SOURCES,
  DISCUSSION_STATUSES,
  EXPERT_COUNT,
  EXPERT_PALETTE,
  FIELD_LIMITS,
  HOST_ACTS,
  HOST_COLOR,
  INSIGHT_KINDS,
  INSIGHT_STATUSES,
  INTENT_LABELS,
  LOBBY_GROUPS,
  MAX_SENTENCES,
  PARTICIPANT_ROLES,
  SPEECH_ACTS,
  STATUS_LABELS,
  STATUS_PRIORITY,
  TOPIC_LENGTH
} from './constants';

describe('shared constants', () => {
  it('exports the ER and API enum values', () => {
    expect(DISCUSSION_STATUSES).toEqual([
      'draft',
      'lineup_ready',
      'live',
      'paused',
      'summarizing',
      'ended',
      'failed'
    ]);
    expect(PARTICIPANT_ROLES).toEqual(['host', 'expert']);
    expect(AGENT_STATES).toEqual(['idle', 'preparing', 'speaking']);
    expect(BID_INTENTS).toEqual([
      'raise_hand',
      'interrupt',
      'supplement',
      'rebut'
    ]);
    expect(SPEECH_ACTS).toHaveLength(9);
    expect(HOST_ACTS).toEqual([
      'opening',
      'follow_up',
      'bridge',
      'invite',
      'closing'
    ]);
    expect(INSIGHT_KINDS).toEqual(['consensus', 'divergence']);
    expect(INSIGHT_STATUSES).toEqual(['active', 'resolved']);
    expect(DISCUSSION_SOURCES).toEqual(['user', 'seed']);
  });

  it('exports limits, colors, labels, lobby groups, and status ordering', () => {
    expect(HOST_COLOR).toBe('#E8C872');
    expect(EXPERT_PALETTE).toEqual([
      '#5B9DFF',
      '#FF6B9A',
      '#3DDC97',
      '#B18CFF',
      '#FF9F43',
      '#2ED3E6'
    ]);
    expect(EXPERT_COUNT).toEqual({ min: 2, max: 6, default: 4 });
    expect(TOPIC_LENGTH).toEqual({ min: 2, max: 200 });
    expect(FIELD_LIMITS).toEqual({
      name: 12,
      profession: 20,
      title: 30,
      stance: 80,
      stanceTag: 6,
      persona: 200,
      focus: 40,
      insightContent: 80,
      position: 40
    });
    expect(MAX_SENTENCES).toEqual({
      expert: 2,
      hostInterjection: 2,
      opening: 3
    });
    expect(STATUS_LABELS.paused).toBe('已暂停');
    expect(AGENT_STATE_LABELS.preparing).toBe('准备发言');
    expect(INTENT_LABELS.raise_hand).toBe('举手');
    expect(ACT_LABELS.follow_up).toBe('追问');
    expect(LOBBY_GROUPS).toEqual([
      { key: 'live', label: '直播中', statuses: ['live', 'summarizing', 'paused'] },
      {
        key: 'upcoming',
        label: '待开播',
        statuses: ['lineup_ready', 'draft', 'failed']
      },
      { key: 'replay', label: '往期回放', statuses: ['ended'] }
    ]);
    expect(
      Object.entries(STATUS_PRIORITY)
        .sort(([, left], [, right]) => right - left)
        .map(([status]) => status)
    ).toEqual([
      'live',
      'summarizing',
      'paused',
      'lineup_ready',
      'draft',
      'failed',
      'ended'
    ]);
  });
});
