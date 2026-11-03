import { describe, expect, it } from 'vitest';
import {
  clampSentences,
  createSentenceLimiter,
  sanitizeUtterance
} from './sentences';

describe('clampSentences', () => {
  it('中文句子超过上限时只保留前两句', () => {
    expect(clampSentences('第一句。第二句！第三句？', 2)).toBe(
      '第一句。第二句！'
    );
  });

  it('英文小数点不被误判为句末', () => {
    expect(clampSentences('增长了 3.5 个百分点。第二句！第三句。', 2)).toBe(
      '增长了 3.5 个百分点。第二句！'
    );
  });

  it('省略号问号感叹号和紧随的右引号均保持完整', () => {
    expect(clampSentences('第一句……”第二句？第三句！”第四句。', 3)).toBe(
      '第一句……”第二句？第三句！”'
    );
  });

  it('没有句末标记且超过一百二十字时截断并追加省略号', () => {
    const text = '甲'.repeat(130);

    expect(clampSentences(text, 2)).toBe(`${'甲'.repeat(120)}…`);
  });
});

describe('sanitizeUtterance', () => {
  it('移除发言人前缀整体引号 Markdown 标记并合并换行', () => {
    const prefixes = [
      ['张三：正文。', '正文。'],
      ['张三:正文。', '正文。'],
      ['【张三】正文。', '正文。'],
      ['**张三**：正文。', '正文。'],
      ['主持人：正文。', '正文。']
    ] as const;

    for (const [input, expected] of prefixes) {
      expect(sanitizeUtterance(input, '张三')).toBe(expected);
    }
    expect(
      sanitizeUtterance(
        '“**张三**：第一句。\n- 第二句。\n# 标题 `词`”',
        '张三'
      )
    ).toBe('第一句。 第二句。 标题 词');
  });

  it('保留正文中的冒号而不误认作发言人前缀', () => {
    expect(sanitizeUtterance('我的观点是：先从低风险场景试点。', '张三')).toBe(
      '我的观点是：先从低风险场景试点。'
    );
  });
});

describe('createSentenceLimiter', () => {
  it('分片过滤到句数上限且完成后不再输出发言人前缀或额外内容', () => {
    const limiter = createSentenceLimiter(2, '张三');
    const chunks = ['**张三**', '：第一句。第二', '句。第三句。'];
    const outputs = chunks.map((chunk) => limiter.push(chunk));
    const output = outputs.join('');
    const expected = clampSentences(
      sanitizeUtterance('**张三**：第一句。第二句。第三句。', '张三'),
      2
    );

    expect(limiter.done).toBe(true);
    expect(limiter.push('额外的第四句。')).toBe('');
    expect(output).toBe(expected);
    expect(output).not.toContain('张三');
  });
});
