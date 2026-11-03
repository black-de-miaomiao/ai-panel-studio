export class LLMFormatError extends Error {
  constructor(message = '大模型返回内容格式无效') {
    super(message);
    this.name = 'LLMFormatError';
  }
}

export function parseJsonLoose(_text: string): unknown {
  throw new Error('NOT_IMPLEMENTED');
}
