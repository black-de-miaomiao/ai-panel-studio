export class LLMFormatError extends Error {
  constructor(message = '大模型返回内容格式无效') {
    super(message);
    this.name = 'LLMFormatError';
  }
}

export function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  try {
    return JSON.parse(withoutFence) as unknown;
  } catch {
    const firstObject = withoutFence.indexOf('{');
    const lastObject = withoutFence.lastIndexOf('}');
    if (firstObject >= 0 && lastObject > firstObject) {
      try {
        return JSON.parse(
          withoutFence.slice(firstObject, lastObject + 1)
        ) as unknown;
      } catch {
        // The bounded extraction is only a recovery path; report one safe error.
      }
    }
    throw new LLMFormatError();
  }
}
