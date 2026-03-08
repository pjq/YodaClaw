/**
 * Test Scheduler - Vitest format
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Scheduler } from '../src/scheduler';
import fs from 'fs';

const TEST_CONFIG = '/tmp/test_schedules.json';

describe('Scheduler', () => {
  let scheduler: Scheduler;
  
  beforeEach(() => {
    if (fs.existsSync(TEST_CONFIG)) {
      fs.unlinkSync(TEST_CONFIG);
    }
    scheduler = new Scheduler(TEST_CONFIG);
  });

  it('should initialize with empty schedules', () => {
    const list = scheduler.list();
    expect(list).toBe('No schedules.');
  });

  it('should add a task', () => {
    const result = scheduler.add('Test Task', '1m', 'echo test');
    expect(result).toContain('Schedule added');
    expect(scheduler.list()).toContain('Test Task');
  });

  it('should remove a task', () => {
    scheduler.add('Test Task', '1m', 'echo test');
    const result = scheduler.remove('Test Task');
    expect(result).toContain('Removed');
    expect(scheduler.list()).toBe('No schedules.');
  });

  it('should handle one-time tasks with delay', () => {
    const result = scheduler.add('One-time', 'once', 'echo test', 1000);
    expect(result).toContain('Schedule added');
  });
});
