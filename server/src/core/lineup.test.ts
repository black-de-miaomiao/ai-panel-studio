import { EXPERT_PALETTE, HOST_COLOR } from '@aps/shared';
import { describe, expect, it } from 'vitest';
import {
  LineupValidationError,
  normalizeLineup,
  type LineupValidationCode
} from './lineup';

function expert(name: string, stanceTag: string) {
  return {
    name,
    profession: '服务设计师',
    title: '服务设计顾问',
    stance: '支持在风险可控的场景逐步验证方案。',
    stanceTag,
    persona: '关注流程和用户体验。'
  };
}

function lineup(experts: unknown[] = [
  expert('周明', '支持'),
  expert('陈澄', '审慎'),
  expert('顾言', '观望'),
  expert('唐宁', '反对'),
  expert('许闻溪', '中立'),
  expert('林舟', '谨慎')
]) {
  return {
    host: {
      name: '林知远',
      profession: '访谈主持',
      title: '圆桌主持人',
      stance: '帮助各方充分表达并梳理观点。',
      stanceTag: '引导',
      persona: '善于倾听和串联观点。'
    },
    experts
  };
}

function expectLineupError(
  raw: unknown,
  expertCount: number,
  code: LineupValidationCode
): void {
  let thrown: unknown;
  try {
    normalizeLineup(raw, expertCount);
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(LineupValidationError);
  expect((thrown as LineupValidationError).code).toBe(code);
}

describe('normalizeLineup', () => {
  it('按专家人数生成主持人和连续座位并分配角色头像与颜色', () => {
    for (let expertCount = 2; expertCount <= 6; expertCount += 1) {
      const result = normalizeLineup(lineup(), expertCount);

      expect(result.host).toMatchObject({
        role: 'host',
        seat: 0,
        color: HOST_COLOR,
        avatar: '林'
      });
      expect(result.experts).toHaveLength(expertCount);
      expect(result.experts.map(({ seat }) => seat)).toEqual(
        Array.from({ length: expertCount }, (_, index) => index + 1)
      );
      expect(result.experts.map(({ color }) => color)).toEqual(
        EXPERT_PALETTE.slice(0, expertCount)
      );
      expect(new Set(result.experts.map(({ color }) => color)).size).toBe(
        expertCount
      );
      expect(result.experts.every(({ role }) => role === 'expert')).toBe(true);
      expect(result.experts.map(({ avatar, name }) => avatar === name[0])).toEqual(
        Array.from({ length: expertCount }, () => true)
      );
    }
  });

  it('专家多于指定人数时只保留最前面的专家', () => {
    const result = normalizeLineup(lineup(), 2);

    expect(result.experts.map(({ name }) => name)).toEqual(['周明', '陈澄']);
  });

  it('专家少于指定人数时报告专家人数不足', () => {
    expectLineupError(
      lineup([expert('周明', '支持'), expert('陈澄', '审慎')]),
      3,
      'INSUFFICIENT_EXPERTS'
    );
  });

  it('主持人与专家或专家之间姓名重复时拒绝阵容', () => {
    expectLineupError(
      lineup([expert('周明', '支持'), expert('周明', '审慎')]),
      2,
      'DUPLICATE_NAMES'
    );
    expectLineupError(
      {
        ...lineup([expert('周明', '支持'), expert('陈澄', '审慎')]),
        host: {
          name: '周明',
          profession: '访谈主持',
          title: '圆桌主持人',
          stance: '帮助各方充分表达。',
          stanceTag: '引导',
          persona: ''
        }
      },
      2,
      'DUPLICATE_NAMES'
    );
  });

  it('两名及以上专家的立场标签完全相同时报告多样性不足', () => {
    expectLineupError(
      lineup([expert('周明', '谨慎'), expert('陈澄', '谨慎')]),
      2,
      'LOW_DIVERSITY'
    );
  });

  it('修剪字段并按长度上限截断且补齐可选字段默认值', () => {
    const raw = {
      host: {
        name: `  ${'林'.repeat(14)}  `,
        profession: `  ${'主'.repeat(22)}  `,
        title: `  ${'题'.repeat(32)}  `,
        stance: `  ${'立'.repeat(82)}  `
      },
      experts: [
        {
          name: `  ${'周'.repeat(14)}  `,
          profession: `  ${'业'.repeat(22)}  `,
          title: `  ${'职'.repeat(32)}  `,
          stance: `  ${'观'.repeat(82)}  `,
          stanceTag: `  ${'态'.repeat(8)}  `,
          persona: `  ${'人'.repeat(202)}  `
        },
        {
          name: '陈澄',
          profession: '用户研究员',
          title: '用户研究负责人',
          stance: '关注复杂问题中的服务质量。',
        }
      ]
    };
    const result = normalizeLineup(raw, 2);

    expect(result.host.name).toBe(`${'林'.repeat(11)}…`);
    expect(result.host.profession).toBe(`${'主'.repeat(19)}…`);
    expect(result.host.title).toBe(`${'题'.repeat(29)}…`);
    expect(result.host.stance).toBe(`${'立'.repeat(79)}…`);
    expect(result.host.stanceTag).toBe('观点');
    expect(result.host.persona).toBe('');
    expect(result.experts[0]).toMatchObject({
      name: `${'周'.repeat(11)}…`,
      profession: `${'业'.repeat(19)}…`,
      title: `${'职'.repeat(29)}…`,
      stance: `${'观'.repeat(79)}…`,
      stanceTag: `${'态'.repeat(5)}…`,
      persona: `${'人'.repeat(199)}…`
    });
    expect(result.experts[1]).toMatchObject({
      stanceTag: '观点',
      persona: ''
    });
  });

  it('缺少主持人专家数组或必填字段为空时报告格式无效', () => {
    expectLineupError(
      { experts: [expert('周明', '支持'), expert('陈澄', '审慎')] },
      2,
      'INVALID_FORMAT'
    );
    expectLineupError(
      {
        ...lineup([expert('周明', '支持'), expert('陈澄', '审慎')]),
        experts: '不是数组'
      },
      2,
      'INVALID_FORMAT'
    );
    expectLineupError(
      {
        ...lineup([expert('周明', '支持'), expert('陈澄', '审慎')]),
        host: { ...lineup().host, name: '   ' }
      },
      2,
      'INVALID_FORMAT'
    );
    expectLineupError(
      {
        ...lineup([
          { ...expert('周明', '支持'), title: '   ' },
          expert('陈澄', '审慎')
        ])
      },
      2,
      'INVALID_FORMAT'
    );
  });

  it('输入不是对象时报告格式无效', () => {
    expectLineupError(null, 2, 'INVALID_FORMAT');
    expectLineupError('不是对象', 2, 'INVALID_FORMAT');
  });
});
