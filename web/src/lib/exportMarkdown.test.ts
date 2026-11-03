import { describe, expect, it } from 'vitest';
import { createShowcaseSnapshot } from '../mocks/fixtures';
import { exportMarkdown } from './exportMarkdown';

describe('exportMarkdown', () => {
  it('exports ordered public discussion content without internal intents', () => {
    const snapshot = createShowcaseSnapshot(43, 'ended');
    const markdown = exportMarkdown(snapshot);

    expect(markdown).toContain(`# ${snapshot.discussion.topic}`);
    expect(markdown).toContain('## 嘉宾阵容');
    expect(markdown).toContain('## 现场实录');
    expect(markdown).toContain('## 共识');
    expect(markdown).toContain('## 分歧');
    expect(markdown).toContain('## 主持人总结');
    expect(markdown.indexOf('### #1')).toBeLessThan(markdown.indexOf('### #2'));
    expect(markdown).not.toContain('raise_hand');
    expect(markdown).not.toContain('reasoning_content');
    expect(markdown.endsWith('\n')).toBe(true);
  });
});
