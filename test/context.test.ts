/**
 * Test Context Manager - Vitest format
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ContextManager } from '../src/context';
import fs from 'fs';

const TEST_DIR = '/tmp/test_context';

describe('ContextManager', () => {
  beforeEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true });
    }
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  it('should initialize with empty messages', () => {
    const ctx = new ContextManager(TEST_DIR);
    const messages: any[] = [];
    ctx.microcompact(messages);
    expect(messages.length).toBe(0);
  });

  it('should have microcompact method', () => {
    const ctx = new ContextManager(TEST_DIR);
    expect(typeof ctx.microcompact).toBe('function');
  });
});
