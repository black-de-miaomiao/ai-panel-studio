import { describe, expect, it } from 'vitest';
import { makeTestInsight, makeTestParticipant, makeTestUtterance } from '../test/helpers';
import {
  buildAliasMap,
  buildTranscriptWindow,
  formatInsightsForPrompt
} from './context';

const host = makeTestParticipant({
  id: 'host-id',
  role: 'host',
  seat: 0,
  name: '林知远',
  title: '圆桌主持人'
});
const expert1 = makeTestParticipant({
  id: 'expert-1-id',
  role: 'expert',
  seat: 1,
  name: '周明',
  title: '服务设计顾问'
});
const expert2 = makeTestParticipant({
  id: 'expert-2-id',
  role: 'expert',
  seat: 2,
  name: '陈澄',
  title: '用户研究负责人'
});
const expert3 = makeTestParticipant({
  id: 'expert-3-id',
  role: 'expert',
  seat: 3,
  name: '顾言',
  title: '服务运营专家'
});

describe('buildAliasMap', () => {
  it('主持人固定映射为 H 且专家按座位升序映射为 E1 至 En', () => {
    expect(buildAliasMap([expert3, expert2, host, expert1])).toEqual({
      H: host.id,
      E1: expert1.id,
      E2: expert2.id,
      E3: expert3.id
    });
  });
});

describe('buildTranscriptWindow', () => {
  it('只取最近 k 条并按时间正序格式化发言人别名与角色信息', () => {
    const transcript = buildTranscriptWindow(
      [
        makeTestUtterance({
          id: 'utterance-3',
          participantId: expert2.id,
          seq: 3,
          content: '复杂问题需要人工升级。',
          createdAt: '2026-01-01T00:00:03.000Z'
        }),
        makeTestUtterance({
          id: 'utterance-1',
          participantId: host.id,
          seq: 1,
          act: 'opening',
          content: '欢迎来到讨论现场。',
          createdAt: '2026-01-01T00:00:01.000Z'
        }),
        makeTestUtterance({
          id: 'utterance-2',
          participantId: expert1.id,
          seq: 2,
          content: '可以从低风险场景试点。',
          createdAt: '2026-01-01T00:00:02.000Z'
        })
      ],
      [host, expert1, expert2],
      2
    );

    expect(transcript).toBe(
      '#2 E1 周明（服务设计顾问）：可以从低风险场景试点。\n' +
        '#3 E2 陈澄（用户研究负责人）：复杂问题需要人工升级。'
    );
  });
});

describe('formatInsightsForPrompt', () => {
  it('分别按创建顺序编号共识与分歧并列出立场和已化解标记', () => {
    const text = formatInsightsForPrompt(
      [
        makeTestInsight({
          id: 'consensus-new',
          kind: 'consensus',
          content: '先建立人工升级路径。',
          createdAt: '2026-01-01T00:00:03.000Z'
        }),
        makeTestInsight({
          id: 'divergence-old',
          kind: 'divergence',
          content: '自动化效率与服务信任的取舍。',
          status: 'resolved',
          stances: [
            { participantId: expert1.id, position: '支持低风险试点' },
            { participantId: expert2.id, position: '反对复杂问题全自动化' }
          ],
          createdAt: '2026-01-01T00:00:01.000Z'
        }),
        makeTestInsight({
          id: 'consensus-old',
          kind: 'consensus',
          content: '先限定问题范围。',
          createdAt: '2026-01-01T00:00:02.000Z'
        }),
        makeTestInsight({
          id: 'divergence-new',
          kind: 'divergence',
          content: '部署速度与培训安排。',
          stances: [
            { participantId: expert1.id, position: '尽早部署' },
            { participantId: expert3.id, position: '先完成培训' }
          ],
          createdAt: '2026-01-01T00:00:04.000Z'
        })
      ],
      [host, expert1, expert2, expert3]
    );

    expect(text.indexOf('C1')).toBeLessThan(text.indexOf('C2'));
    expect(text.indexOf('D1')).toBeLessThan(text.indexOf('D2'));
    expect(text).toContain('C1');
    expect(text).toContain('C2');
    expect(text).toContain('D1');
    expect(text).toContain('D2');
    expect(text).toContain('支持低风险试点');
    expect(text).toContain('反对复杂问题全自动化');
    expect(text).toContain('（已化解）');
  });
});
