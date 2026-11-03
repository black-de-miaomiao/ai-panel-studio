import { describe, expect, it } from 'vitest';
import {
  CONTRACT_VERSION,
  EXPERT_PALETTE,
  HOST_COLOR
} from './index';

describe('shared entry point', () => {
  it('preserves the contract version and re-exports core constants', () => {
    expect(CONTRACT_VERSION).toBe('0.1.0');
    expect(HOST_COLOR).toBe('#E8C872');
    expect(EXPERT_PALETTE).toHaveLength(6);
  });
});
