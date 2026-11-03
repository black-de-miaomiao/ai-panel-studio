import type { Insight } from '@aps/shared';
import { describe, expect, it } from 'vitest';
import { makeTestInsight } from '../test/helpers';
import {
  mergeInsights,
  similarity,
  type MergeContext
} from './insights';

const participantIds = {
  E1: '00000000-0000-4000-8000-000000000011',
  E2: '00000000-0000-4000-8000-000000000012',
  E3: '00000000-0000-4000-8000-000000000013'
};

const existingConsensusId = '00000000-0000-4000-8000-000000000021';
const existingDivergenceId = '00000000-0000-4000-8000-000000000022';

function context(overrides: Partial<MergeContext> = {}): MergeContext {
  let nextId = 100;
  return {
    discussionId: '00000000-0000-4000-8000-000000000001',
    aliasToParticipantId: { ...participantIds },
    refToInsightId: {
      C1: existingConsensusId,
      D1: existingDivergenceId
    },
    validSeqs: new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]),
    currentSeq: 9,
    now: '2026-01-01T00:00:09.000Z',
    newId: () =>
      `00000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`,
    maxPerKind: 6,
    similarityThreshold: 0.6,
    ...overrides
  };
}

function consensus(
  overrides: Partial<Insight> = {}
): Insight {
  return makeTestInsight({
    id: existingConsensusId,
    kind: 'consensus',
    content: '先从低风险场景逐步试点',
    evidenceSeqs: [1, 2],
    updatedAtSeq: 2,
    stances: [
      { participantId: participantIds.E1, position: '认可先限定范围' },
      { participantId: participantIds.E2, position: '支持小步验证' }
    ],
    ...overrides
  });
}

function divergence(
  overrides: Partial<Insight> = {}
): Insight {
  return makeTestInsight({
    id: existingDivergenceId,
    kind: 'divergence',
    content: '效率与信任风险如何平衡',
    status: 'active',
    stances: [
      { participantId: participantIds.E1, position: '效率收益值得验证' },
      { participantId: participantIds.E2, position: '复杂问题先保障信任' }
    ],
    evidenceSeqs: [3, 4],
    updatedAtSeq: 4,
    ...overrides
  });
}

describe('mergeInsights', () => {
  it('有效的新共识至少含两位专家和证据并成为当前序号的活跃条目', () => {
    const result = mergeInsights(
      [],
      {
        consensus: [
          {
            content: '可以从低风险场景开始试点',
            participants: ['E1', 'E2'],
            evidence: [3, 5]
          }
        ]
      },
      context()
    );

    expect(result.changed).toBe(true);
    expect(result.insights).toHaveLength(1);
    expect(result.insights[0]).toMatchObject({
      discussionId: '00000000-0000-4000-8000-000000000001',
      kind: 'consensus',
      content: '可以从低风险场景开始试点',
      status: 'active',
      updatedAtSeq: 9,
      evidenceSeqs: [3, 5]
    });
    expect(result.insights[0]?.stances).toHaveLength(2);
  });

  it('ref 命中时保留原 ID 并合并去重证据与专家立场', () => {
    const current = [consensus()];
    const result = mergeInsights(
      current,
      {
        consensus: [
          {
            ref: 'C1',
            content: '先从明确范围的低风险场景试点',
            participants: ['E2', 'E3'],
            evidence: [2, 3, 3]
          }
        ]
      },
      context()
    );
    const updated = result.insights[0];

    expect(result.changed).toBe(true);
    expect(updated?.id).toBe(existingConsensusId);
    expect(updated?.content).toBe('先从明确范围的低风险场景试点');
    expect(updated?.evidenceSeqs).toEqual([1, 2, 3]);
    expect(updated?.updatedAtSeq).toBe(9);
    expect(updated?.updatedAt).toBe('2026-01-01T00:00:09.000Z');
    expect(updated?.stances).toEqual([
      { participantId: participantIds.E1, position: '认可先限定范围' },
      { participantId: participantIds.E2, position: '认同' },
      { participantId: participantIds.E3, position: '认同' }
    ]);
  });

  it('没有 ref 但内容相似度达到阈值时更新而不新增', () => {
    const current = [
      consensus({
        content: '低风险场景应先试点',
        stances: [
          { participantId: participantIds.E1, position: '支持逐步验证' },
          { participantId: participantIds.E2, position: '认可先限定范围' }
        ]
      })
    ];
    const result = mergeInsights(
      current,
      {
        consensus: [
          {
            content: '低风险场景，应先试点！',
            participants: ['E1', 'E2'],
            evidence: [5]
          }
        ]
      },
      context()
    );

    expect(result.changed).toBe(true);
    expect(result.insights).toHaveLength(1);
    expect(result.insights[0]?.id).toBe(existingConsensusId);
    expect(result.insights[0]?.content).toBe('低风险场景，应先试点！');
  });

  it('丢弃未知别名和主持人别名且不足两名专家的洞察不入库', () => {
    const result = mergeInsights(
      [],
      {
        consensus: [
          {
            content: '无效共识',
            participants: ['E1', 'H', 'E9'],
            evidence: [1]
          }
        ],
        divergences: [
          {
            content: '无效分歧',
            stances: [
              { who: 'E1', position: '支持' },
              { who: 'E9', position: '反对' }
            ],
            evidence: [2],
            resolved: false
          }
        ]
      },
      context()
    );

    expect(result.insights).toEqual([]);
    expect(result.changed).toBe(false);
  });

  it('过滤不存在的证据序号并丢弃过滤后没有证据的洞察', () => {
    const result = mergeInsights(
      [],
      {
        consensus: [
          {
            content: '保留有效证据',
            participants: ['E1', 'E2'],
            evidence: [3, 99, 3]
          },
          {
            content: '没有有效证据',
            participants: ['E1', 'E2'],
            evidence: [99, 100]
          }
        ]
      },
      context()
    );

    expect(result.insights).toHaveLength(1);
    expect(result.insights[0]?.evidenceSeqs).toEqual([3]);
    expect(result.insights[0]?.content).toBe('保留有效证据');
  });

  it('有效分歧补丁标记已化解时更新为 resolved', () => {
    const result = mergeInsights(
      [divergence()],
      {
        divergences: [
          {
            ref: 'D1',
            content: '专家已对风险边界达成一致',
            stances: [
              { who: 'E1', position: '同意先限定范围' },
              { who: 'E2', position: '同意先限定范围' }
            ],
            evidence: [5],
            resolved: true
          }
        ]
      },
      context()
    );

    expect(result.changed).toBe(true);
    expect(result.insights[0]).toMatchObject({
      id: existingDivergenceId,
      kind: 'divergence',
      status: 'resolved',
      updatedAtSeq: 9,
      evidenceSeqs: [3, 4, 5]
    });
  });

  it('补丁没有提及的已有洞察保持原样', () => {
    const untouched = divergence({
      id: '00000000-0000-4000-8000-000000000031',
      content: '部署速度与人员培训之间的分歧',
      updatedAtSeq: 6
    });
    const current = [consensus(), untouched];
    const result = mergeInsights(
      current,
      {
        consensus: [
          {
            content: '全新且不同的试点条件',
            participants: ['E1', 'E3'],
            evidence: [8]
          }
        ]
      },
      context()
    );

    expect(result.changed).toBe(true);
    expect(result.insights).toContainEqual(untouched);
  });

  it('每类超过上限时保留最近更新的洞察', () => {
    const current = [
      consensus({
        id: '00000000-0000-4000-8000-000000000041',
        content: '议题甲的观点',
        updatedAtSeq: 2
      }),
      consensus({
        id: '00000000-0000-4000-8000-000000000042',
        content: '议题乙的观点',
        updatedAtSeq: 5
      }),
      consensus({
        id: '00000000-0000-4000-8000-000000000043',
        content: '议题丙的观点',
        updatedAtSeq: 7
      })
    ];
    const result = mergeInsights(
      current,
      {
        consensus: [
          {
            content: '全新议题丁的观点',
            participants: ['E1', 'E3'],
            evidence: [9]
          }
        ]
      },
      context({ maxPerKind: 2 })
    );

    expect(result.changed).toBe(true);
    expect(result.insights).toHaveLength(2);
    expect(new Set(result.insights.map(({ id }) => id))).toEqual(
      new Set([
        '00000000-0000-4000-8000-000000000043',
        '00000000-0000-4000-8000-000000000100'
      ])
    );
  });

  it('空补丁或非法补丁原样返回且不标记变更', () => {
    const current = [consensus()];
    const empty = mergeInsights(current, {}, context());
    const invalid = mergeInsights(
      current,
      {
        consensus: [
          { content: '', participants: ['E1', 'E2'], evidence: [1] }
        ]
      },
      context()
    );

    expect(empty.insights).toEqual(current);
    expect(empty.changed).toBe(false);
    expect(invalid.insights).toEqual(current);
    expect(invalid.changed).toBe(false);
  });
});

describe('similarity', () => {
  it('按去除标点空白后的字符二元组计算 Jaccard 相似度', () => {
    expect(similarity('完全相同的内容', '完全相同的内容')).toBe(1);
    expect(similarity('苹果计划', '香蕉预算')).toBe(0);
    expect(similarity('效率提升？信任风险。', '效率提升信任风险')).toBe(1);
  });
});
