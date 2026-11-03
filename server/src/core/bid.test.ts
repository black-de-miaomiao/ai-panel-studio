import { describe, expect, it } from 'vitest';
import { normalizeBid, type NormalizeBidContext } from './bid';

const ctx: NormalizeBidContext = {
  selfId: 'participant-e1',
  aliasToParticipantId: {
    H: 'participant-host',
    E1: 'participant-e1',
    E2: 'participant-e2'
  }
};

describe('normalizeBid', () => {
  it('将合法出价中的回应别名转换为参与者 ID', () => {
    expect(
      normalizeBid(
        {
          wantToSpeak: true,
          intent: 'rebut',
          urgency: 0.8,
          replyTo: 'E2',
          focus: '质疑 E2 的成本估算'
        },
        ctx
      )
    ).toEqual({
      participantId: 'participant-e1',
      wantToSpeak: true,
      intent: 'rebut',
      urgency: 0.8,
      replyToParticipantId: 'participant-e2',
      focus: '质疑 E2 的成本估算'
    });
  });

  it('非法意图回退为举手且非布尔发言意愿回退为否', () => {
    expect(
      normalizeBid(
        { wantToSpeak: '是', intent: 'withdraw', urgency: 0.4 },
        ctx
      )
    ).toMatchObject({
      wantToSpeak: false,
      intent: 'raise_hand'
    });
  });

  it('把紧急度转换为数字并钳制到零至一', () => {
    expect(normalizeBid({ urgency: '0.7' }, ctx).urgency).toBe(0.7);
    expect(normalizeBid({ urgency: 1.5 }, ctx).urgency).toBe(1);
    expect(normalizeBid({ urgency: -1 }, ctx).urgency).toBe(0);
    expect(normalizeBid({ urgency: 'abc' }, ctx).urgency).toBe(0.5);
  });

  it('未知回应别名或指向本人时清空回应对象', () => {
    expect(
      normalizeBid({ wantToSpeak: true, replyTo: 'E9' }, ctx)
        .replyToParticipantId
    ).toBeNull();
    expect(
      normalizeBid({ wantToSpeak: true, replyTo: 'E1' }, ctx)
        .replyToParticipantId
    ).toBeNull();
  });

  it('关注点修剪并限制为四十字且空白变为空值', () => {
    const focus = '  ' + '关注'.repeat(25) + '  ';
    const normalized = normalizeBid({ focus }, ctx).focus;

    expect(normalized).not.toBeNull();
    expect(normalized?.length).toBeLessThanOrEqual(40);
    expect(normalized?.endsWith('…')).toBe(true);
    expect(normalizeBid({ focus: '   ' }, ctx).focus).toBeNull();
  });

  it('非对象输入返回精确的默认不发言出价', () => {
    expect(normalizeBid(null, ctx)).toEqual({
      wantToSpeak: false,
      intent: 'raise_hand',
      urgency: 0,
      replyToParticipantId: null,
      focus: null
    });
  });
});
