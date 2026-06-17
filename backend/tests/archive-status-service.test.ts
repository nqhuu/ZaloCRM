import { describe, expect, it } from 'vitest';
import {
  isOpenArchiveBehavior,
  legacyBusinessStatus,
  transitionPermission,
} from '../src/modules/archive/archive-status-service.js';

describe('archive dynamic status compatibility', () => {
  it('maps configurable behavior groups to the legacy status column', () => {
    expect(legacyBusinessStatus('active')).toBe('pending');
    expect(legacyBusinessStatus('waiting')).toBe('pending');
    expect(legacyBusinessStatus('completed')).toBe('completed');
    expect(legacyBusinessStatus('cancelled')).toBe('cancelled');
  });

  it('only treats active and waiting behavior groups as open', () => {
    expect(isOpenArchiveBehavior('active')).toBe(true);
    expect(isOpenArchiveBehavior('waiting')).toBe(true);
    expect(isOpenArchiveBehavior('completed')).toBe(false);
    expect(isOpenArchiveBehavior('cancelled')).toBe(false);
  });

  it('derives transition permissions and respects configured overrides', () => {
    expect(transitionPermission('active', 'waiting')).toBe('edit');
    expect(transitionPermission('active', 'completed')).toBe('approve');
    expect(transitionPermission('active', 'cancelled')).toBe('delete');
    expect(transitionPermission('completed', 'active')).toBe('approve');
    expect(transitionPermission('active', 'completed', 'edit')).toBe('edit');
  });
});
