import { describe, expect, it } from 'vitest';
import { LLMFormatError, parseJsonLoose } from './json';

describe('parseJsonLoose', () => {
  it('解析纯 JSON 对象', () => {
    expect(parseJsonLoose('{"name":"周明","count":2}')).toEqual({
      name: '周明',
      count: 2
    });
  });

  it('解析带 json 标记的代码围栏', () => {
    expect(parseJsonLoose('```json\n{"ok":true}\n```')).toEqual({ ok: true });
  });

  it('从前后说明文字中截取 JSON 对象', () => {
    expect(parseJsonLoose('模型结果如下：{"items":[1,2]} 请查收。')).toEqual({
      items: [1, 2]
    });
  });

  it('非法输入抛出 LLMFormatError', () => {
    expect(() => parseJsonLoose('并非 JSON 内容')).toThrow(LLMFormatError);
  });
});
