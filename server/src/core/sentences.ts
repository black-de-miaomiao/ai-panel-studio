export interface SentenceLimiter {
  push(delta: string): string;
  readonly done: boolean;
}

const SENTENCE_MARKS = new Set(['。', '！', '？', '!', '?', '…']);
const CLOSING_MARKS = new Set([
  '”',
  '’',
  '"',
  "'",
  '」',
  '』',
  '）',
  ')',
  '】'
]);

function stripSpeakerPrefix(text: string, speakerName: string): string {
  const prefixes = [
    `**${speakerName}**：`,
    `${speakerName}：`,
    `${speakerName}:`,
    `【${speakerName}】`,
    '主持人：'
  ];
  for (const prefix of prefixes) {
    if (prefix && text.startsWith(prefix)) {
      return text.slice(prefix.length);
    }
  }
  return text;
}

function sentenceEnds(text: string): number[] {
  const characters = Array.from(text);
  const ends: number[] = [];

  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index] ?? '';
    let endIndex = index + 1;
    let isEnd = SENTENCE_MARKS.has(character);

    if (character === '.') {
      while (characters[endIndex] === '.') {
        endIndex += 1;
      }
      const nextVisibleIndex = (() => {
        let next = endIndex;
        while (CLOSING_MARKS.has(characters[next] ?? '')) {
          next += 1;
        }
        return next;
      })();
      const previous = characters[index - 1] ?? '';
      const next = characters[nextVisibleIndex] ?? '';
      isEnd =
        !/^[0-9]$/u.test(previous) &&
        (nextVisibleIndex === characters.length || /\s/u.test(next));
    } else if (character === '…') {
      while (characters[endIndex] === '…') {
        endIndex += 1;
      }
    } else if (isEnd) {
      while (SENTENCE_MARKS.has(characters[endIndex] ?? '')) {
        endIndex += 1;
      }
    }

    if (!isEnd) {
      continue;
    }
    while (CLOSING_MARKS.has(characters[endIndex] ?? '')) {
      endIndex += 1;
    }
    ends.push(endIndex);
    index = endIndex - 1;
  }

  return ends;
}

export function sanitizeUtterance(
  text: string,
  speakerName: string
): string {
  let cleaned = text.trim();
  const quotePairs: ReadonlyArray<readonly [string, string]> = [
    ['“', '”'],
    ['"', '"'],
    ['「', '」']
  ];
  for (const [opening, closing] of quotePairs) {
    if (cleaned.startsWith(opening) && cleaned.endsWith(closing)) {
      cleaned = cleaned.slice(opening.length, -closing.length).trim();
      break;
    }
  }

  cleaned = stripSpeakerPrefix(cleaned, speakerName)
    .replace(/\*\*/gu, '')
    .replace(/__/gu, '')
    .replace(/`/gu, '')
    .replace(/^\s*[#-]\s*/gmu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  return cleaned;
}

export function clampSentences(text: string, max: number): string {
  const cleaned = text.trim();
  const limit = Math.max(0, Math.floor(max));
  if (!cleaned || limit === 0) {
    return '';
  }

  const ends = sentenceEnds(cleaned);
  if (ends.length >= limit) {
    const end = ends[limit - 1];
    return end === undefined
      ? cleaned
      : Array.from(cleaned).slice(0, end).join('').trim();
  }

  if (ends.length === 0 && Array.from(cleaned).length > 120) {
    return `${Array.from(cleaned).slice(0, 120).join('')}…`;
  }
  return cleaned;
}

export function createSentenceLimiter(
  max: number,
  speakerName: string
): SentenceLimiter {
  const sentenceLimit = Math.max(0, Math.floor(max));
  let finished = sentenceLimit === 0;
  let prefixResolved = false;
  let prefixBuffer = '';
  let sentenceBuffer = '';
  let sentencesEmitted = 0;

  const resolvePrefix = (): void => {
    sentenceBuffer += stripSpeakerPrefix(prefixBuffer.trimStart(), speakerName);
    prefixBuffer = '';
    prefixResolved = true;
  };

  return {
    get done() {
      return finished;
    },
    push(delta: string): string {
      if (finished || !delta) {
        return '';
      }

      if (!prefixResolved) {
        prefixBuffer += delta;
        const prefixBoundarySeen =
          prefixBuffer.includes('：') ||
          prefixBuffer.includes(':') ||
          prefixBuffer.includes('】');
        if (prefixBoundarySeen || Array.from(prefixBuffer).length >= 16) {
          resolvePrefix();
        } else {
          return '';
        }
      } else {
        sentenceBuffer += delta;
      }

      let output = '';
      while (sentencesEmitted < sentenceLimit) {
        const end = sentenceEnds(sentenceBuffer)[0];
        if (end === undefined) {
          break;
        }
        const characters = Array.from(sentenceBuffer);
        output += characters.slice(0, end).join('');
        sentenceBuffer = characters.slice(end).join('');
        sentencesEmitted += 1;
      }

      if (sentencesEmitted >= sentenceLimit) {
        finished = true;
        prefixBuffer = '';
        sentenceBuffer = '';
      }
      return output;
    }
  };
}
