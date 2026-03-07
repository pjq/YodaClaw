/**
 * Context Compression Manager
 * 
 * Based on learn-claude-code's s06-context-compact pattern
 * 
 * 3-layer compression strategy:
 * 1. microcompact - Clear old tool_results (keep last 3)
 * 2. auto_compact - Summarize conversation when token threshold exceeded
 * 3. transcript archiving - Save full conversation to JSONL
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';

export class ContextManager {
  private tokenThreshold: number;
  private transcriptDir: string;
  private maxToolResults: number = 3;

  constructor(transcriptDir: string, tokenThreshold = 100000) {
    this.transcriptDir = transcriptDir;
    this.tokenThreshold = tokenThreshold;
    this.ensureDir();
  }

  private ensureDir() {
    if (!fs.existsSync(this.transcriptDir)) {
      fs.mkdirSync(this.transcriptDir, { recursive: true });
    }
  }

  /**
   * Estimate token count (rough approximation: 4 chars per token)
   */
  estimateTokens(messages: any[]): number {
    return Math.ceil(JSON.stringify(messages).length / 4);
  }

  /**
   * Layer 1: Microcompact - clear old tool_results, keep last N
   * Call this before each LLM request
   */
  microcompact(messages: any[]): void {
    const toolResultIndices: number[] = [];
    
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role === 'user' && Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (typeof part === 'object' && part.type === 'tool_result') {
            toolResultIndices.push(i);
          }
        }
      }
    }

    // If we have more than maxToolResults, clear older ones
    if (toolResultIndices.length > this.maxToolResults) {
      for (const idx of toolResultIndices.slice(0, -this.maxToolResults)) {
        if (typeof messages[idx].content === 'string' && messages[idx].content.length > 100) {
          messages[idx].content = '[cleared]';
        }
      }
    }
  }

  /**
   * Layer 2: Auto-compact - summarize and archive when threshold exceeded
   * Returns true if compaction was performed
   */
  async autoCompact(messages: any[], summarizeFn: (text: string) => Promise<string>): Promise<boolean> {
    if (this.estimateTokens(messages) <= this.tokenThreshold) {
      return false;
    }

    console.log('[auto-compact triggered]');
    
    // Save full transcript to archive
    this.archiveTranscript(messages);

    // Get text to summarize (first 80k chars)
    const convText = JSON.stringify(messages).slice(0, 80000);
    
    // Ask LLM to summarize
    const summary = await summarizeFn(`Summarize for continuity:\n${convText}`);
    
    // Replace messages with summary
    messages.length = 0;
    messages.push(
      { role: 'user', content: `[Compressed. Transcript archived to ${this.transcriptDir}]\n${summary}` },
      { role: 'assistant', content: 'Understood. Continuing with summary context.' }
    );

    return true;
  }

  /**
   * Layer 3: Archive transcript to JSONL
   */
  archiveTranscript(messages: any[]): string {
    const timestamp = Math.floor(Date.now() / 1000);
    const filename = `transcript_${timestamp}.jsonl`;
    const filepath = path.join(this.transcriptDir, filename);

    const lines = messages.map(msg => JSON.stringify(msg)).join('\n');
    fs.writeFileSync(filepath, lines);

    console.log(`[transcript archived to ${filename}]`);
    return filepath;
  }

  /**
   * List archived transcripts
   */
  listTranscripts(): string[] {
    if (!fs.existsSync(this.transcriptDir)) {
      return [];
    }
    return fs.readdirSync(this.transcriptDir)
      .filter(f => f.startsWith('transcript_') && f.endsWith('.jsonl'))
      .sort()
      .reverse();
  }

  /**
   * Read a specific transcript
   */
  readTranscript(filename: string): any[] {
    const filepath = path.join(this.transcriptDir, filename);
    if (!fs.existsSync(filepath)) {
      return [];
    }
    const content = fs.readFileSync(filepath, 'utf-8');
    return content.split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
  }

  /**
   * Clean old transcripts (keep last N)
   */
  cleanOldTranscripts(keepLast = 10): number {
    const transcripts = this.listTranscripts();
    let deleted = 0;
    
    for (let i = keepLast; i < transcripts.length; i++) {
      const filepath = path.join(this.transcriptDir, transcripts[i]);
      fs.unlinkSync(filepath);
      deleted++;
    }
    
    return deleted;
  }
}
