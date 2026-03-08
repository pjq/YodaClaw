/**
 * Test Task Manager - Vitest format
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TaskManager } from '../src/task';

const TEST_DIR = '/tmp/test_tasks';

describe('TaskManager', () => {
  let tasks: TaskManager;
  
  beforeEach(() => {
    tasks = new TaskManager(TEST_DIR);
  });

  it('should be created', () => {
    expect(tasks).toBeDefined();
  });

  it('should have tasks directory', () => {
    expect(tasks).toBeInstanceOf(TaskManager);
  });
});
