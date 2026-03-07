/**
 * Conversation History Manager
 * Persists chat history per user
 */

import fs from 'fs';
import path from 'path';

export class HistoryManager {
  private historyDir: string;
  private maxHistoryPerUser: number = 20;

  constructor(historyDir: string) {
    this.historyDir = historyDir;
    this.ensureDir();
  }

  private ensureDir() {
    if (!fs.existsSync(this.historyDir)) {
      fs.mkdirSync(this.historyDir, { recursive: true });
    }
  }

  private historyPath(chatId: number): string {
    return path.join(this.historyDir, `history_${chatId}.jsonl`);
  }

  /**
   * Load history for a user
   */
  load(chatId: number): any[] {
    const filepath = this.historyPath(chatId);
    if (!fs.existsSync(filepath)) {
      return [];
    }

    try {
      const content = fs.readFileSync(filepath, 'utf-8');
      return content
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));
    } catch (e) {
      console.error('Failed to load history:', e);
      return [];
    }
  }

  /**
   * Save history for a user
   */
  save(chatId: number, messages: any[]) {
    const filepath = this.historyPath(chatId);
    const lines = messages.map(msg => JSON.stringify(msg)).join('\n');
    fs.writeFileSync(filepath, lines);
  }

  /**
   * Add a user message to history
   */
  addUserMessage(chatId: number, content: string) {
    const history = this.load(chatId);
    history.push({ role: 'user', content });
    this.prune(chatId, history);
  }

  /**
   * Add an assistant message to history
   */
  addAssistantMessage(chatId: number, content: string) {
    const history = this.load(chatId);
    history.push({ role: 'assistant', content });
    this.prune(chatId, history);
  }

  /**
   * Prune old messages to keep history manageable
   */
  private prune(chatId: number, messages: any[]) {
    if (messages.length > this.maxHistoryPerUser) {
      // Keep the system prompt and last N messages
      const systemPrompt = messages.find(m => m.role === 'system');
      const recent = messages.slice(-this.maxHistoryPerUser);
      
      if (systemPrompt && recent[0]?.role !== 'system') {
        recent.unshift(systemPrompt);
      }
      
      this.save(chatId, recent);
    } else {
      this.save(chatId, messages);
    }
  }

  /**
   * Clear history for a user
   */
  clear(chatId: number) {
    const filepath = this.historyPath(chatId);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
  }
}
