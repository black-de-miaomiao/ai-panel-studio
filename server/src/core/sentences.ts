export interface SentenceLimiter {
  push(delta: string): string;
  readonly done: boolean;
}

export function sanitizeUtterance(
  _text: string,
  _speakerName: string
): string {
  throw new Error('NOT_IMPLEMENTED');
}

export function clampSentences(_text: string, _max: number): string {
  throw new Error('NOT_IMPLEMENTED');
}

export function createSentenceLimiter(
  _max: number,
  _speakerName: string
): SentenceLimiter {
  throw new Error('NOT_IMPLEMENTED');
}
