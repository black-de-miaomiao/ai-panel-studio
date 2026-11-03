import { describe, expect, it } from 'vitest';
import { CONTRACT_VERSION } from './index';

describe('shared scaffold', () => {
  it('exposes the placeholder contract version', () => {
    expect(CONTRACT_VERSION).toBe('0.1.0');
  });
});
