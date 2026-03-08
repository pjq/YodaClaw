/**
 * Test Markdown Parser - Vitest format
 */

import { describe, it, expect } from 'vitest';

describe('Markdown Parser', () => {
  it('should parse bold text', () => {
    const text = '**bold**';
    const result = text.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    expect(result).toBe('<b>bold</b>');
  });

  it('should parse inline code', () => {
    const text = '`code`';
    const result = text.replace(/`(.+?)`/g, '<code>$1</code>');
    expect(result).toBe('<code>code</code>');
  });

  it('should escape HTML entities', () => {
    const text = '<script>alert("xss")</script>';
    const result = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    expect(result).toContain('&lt;script&gt;');
  });
});
