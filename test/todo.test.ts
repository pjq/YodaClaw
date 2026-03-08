/**
 * Test TodoManager - Vitest format
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TodoManager } from '../src/todo';
import fs from 'fs';

const TEST_FILE = '/tmp/test_todos.json';

describe('TodoManager', () => {
  beforeEach(() => {
    if (fs.existsSync(TEST_FILE)) {
      fs.unlinkSync(TEST_FILE);
    }
  });

  it('should start with empty todos', () => {
    const todo = new TodoManager(TEST_FILE);
    expect(todo.render()).toBe('No todos.');
  });

  it('should add todos', () => {
    const todo = new TodoManager(TEST_FILE);
    todo.update([{ content: 'Test task', status: 'pending', activeForm: 'Testing' }]);
    expect(todo.hasOpenItems()).toBe(true);
  });

  it('should track rounds', () => {
    const todo = new TodoManager(TEST_FILE);
    todo.update([{ content: 'Test task', status: 'pending', activeForm: 'Testing' }]);
    
    todo.markTodoUsed();
    expect(todo.getRoundsSinceLastTodo()).toBe(0);
    
    todo.recordRound();
    todo.recordRound();
    expect(todo.getRoundsSinceLastTodo()).toBe(2);
  });

  it('should validate max items', () => {
    const todo = new TodoManager(TEST_FILE);
    const items = Array(21).fill(null).map((_, i) => ({
      content: `Task ${i}`,
      status: 'pending' as const,
      activeForm: 'Test'
    }));
    
    expect(() => todo.update(items)).toThrow();
  });
});
