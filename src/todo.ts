/**
 * TodoManager - Enhanced task tracking with nag reminder
 * 
 * Based on learn-claude-code's s03-todo-write pattern
 * 
 * Features:
 * - Track todo items with content, status, and activeForm
 * - Auto-remind after 3 rounds without TodoWrite usage
 * - Persist to disk (optional)
 */

import fs from 'fs';
import path from 'path';

export interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm: string;
}

export class TodoManager {
  private items: TodoItem[] = [];
  private roundsSinceLastTodo: number = 0;
  private storagePath?: string;

  constructor(storagePath?: string) {
    if (storagePath) {
      this.storagePath = storagePath;
      this.load();
    }
  }

  /**
   * Update the todo list
   */
  update(items: TodoItem[]): string {
    // Validate input
    const validated: TodoItem[] = [];
    let inProgressCount = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const content = String(item.content || '').trim();
      const status = String(item.status || 'pending').toLowerCase() as TodoItem['status'];
      const activeForm = String(item.activeForm || '').trim();

      if (!content) {
        throw new Error(`Item ${i}: content required`);
      }
      if (!['pending', 'in_progress', 'completed'].includes(status)) {
        throw new Error(`Item ${i}: invalid status '${status}'`);
      }
      if (!activeForm) {
        throw new Error(`Item ${i}: activeForm required`);
      }
      if (status === 'in_progress') {
        inProgressCount++;
      }
      validated.push({ content, status, activeForm });
    }

    if (validated.length > 20) {
      throw new Error('Max 20 todos');
    }
    if (inProgressCount > 1) {
      throw new Error('Only one in_progress allowed');
    }

    this.items = validated;
    this.save();
    return this.render();
  }

  /**
   * Render the todo list as a string
   */
  render(): string {
    if (this.items.length === 0) {
      return 'No todos.';
    }

    const lines: string[] = [];
    for (const item of this.items) {
      const marker = {
        'completed': '[x]',
        'in_progress': '[>]',
        'pending': '[ ]'
      }[item.status] || '[?]';

      const suffix = item.status === 'in_progress' ? ` <- ${item.activeForm}` : '';
      lines.push(`${marker} ${item.content}${suffix}`);
    }

    const done = this.items.filter(t => t.status === 'completed').length;
    lines.push(`\n(${done}/${this.items.length} completed)`);

    return lines.join('\n');
  }

  /**
   * Check if there are open (non-completed) todos
   */
  hasOpenItems(): boolean {
    return this.items.some(item => item.status !== 'completed');
  }

  /**
   * Record that TodoWrite was used this round
   * Call this when the model uses the TodoWrite tool
   */
  markTodoUsed() {
    this.roundsSinceLastTodo = 0;
  }

  /**
   * Record a round passing (LLM call without TodoWrite)
   * Returns true if reminder should be triggered
   */
  recordRound(): boolean {
    this.roundsSinceLastTodo++;
    // Trigger reminder if: open todos exist AND 3+ rounds passed
    return this.hasOpenItems() && this.roundsSinceLastTodo >= 3;
  }

  /**
   * Get current rounds count (for debugging)
   */
  getRoundsSinceLastTodo(): number {
    return this.roundsSinceLastTodo;
  }

  /**
   * Get current items (for debugging)
   */
  getItems(): TodoItem[] {
    return [...this.items];
  }

  /**
   * Add a single todo item
   */
  add(content: string, activeForm: string): string {
    this.items.push({
      content,
      status: 'pending',
      activeForm
    });
    this.save();
    return this.render();
  }

  /**
   * Clear all todos
   */
  clear(): string {
    this.items = [];
    this.save();
    return 'Todos cleared.';
  }

  private save() {
    if (this.storagePath) {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.storagePath, JSON.stringify(this.items, null, 2));
    }
  }

  private load() {
    if (this.storagePath && fs.existsSync(this.storagePath)) {
      try {
        const data = fs.readFileSync(this.storagePath, 'utf-8');
        this.items = JSON.parse(data);
      } catch (e) {
        console.error('Failed to load todos:', e);
        this.items = [];
      }
    }
  }
}
