/**
 * Background Task Manager
 * 
 * Based on learn-claude-code's s08-background-tasks pattern
 * 
 * Features:
 * - Run commands in background threads
 * - Track task status (running/completed/error)
 * - Notification queue for completion events
 */

import { spawn, ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';

export interface BackgroundTask {
  id: string;
  command: string;
  status: 'running' | 'completed' | 'error';
  result?: string;
  startedAt: number;
  completedAt?: number;
}

export class BackgroundManager extends EventEmitter {
  private tasks: Map<string, BackgroundTask> = new Map();
  private notifications: Array<{ taskId: string; status: string; result: string }> = [];
  private processes: Map<string, ChildProcess> = new Map();

  constructor() {
    super();
  }

  /**
   * Run a command in the background
   */
  run(command: string, timeout: number = 120000): string {
    const taskId = randomUUID().slice(0, 8);
    
    this.tasks.set(taskId, {
      id: taskId,
      command,
      status: 'running',
      startedAt: Date.now()
    });

    // Execute in background using spawn
    const child = spawn('bash', ['-lc', command], {
      timeout,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    this.processes.set(taskId, child);

    let output = '';
    
    child.stdout?.on('data', (data) => {
      output += data.toString();
    });
    
    child.stderr?.on('data', (data) => {
      output += data.toString();
    });

    const cleanup = (error?: Error) => {
      const task = this.tasks.get(taskId);
      if (!task) return;

      this.processes.delete(taskId);

      if (error) {
        task.status = 'error';
        task.result = `Error: ${error.message}`;
      } else {
        task.status = 'completed';
        task.result = output.slice(0, 50000) || '(no output)';
      }
      task.completedAt = Date.now();

      // Queue notification
      const notification = {
        taskId,
        status: task.status,
        result: task.result.slice(0, 500)
      };
      this.notifications.push(notification);
      this.emit('taskComplete', notification);
    };

    child.on('error', cleanup);
    child.on('close', (code) => {
      if (code === 0) {
        cleanup();
      } else {
        cleanup(new Error(`Process exited with code ${code}`));
      }
    });

    // Handle timeout
    setTimeout(() => {
      const task = this.tasks.get(taskId);
      if (task && task.status === 'running') {
        child.kill('SIGTERM');
        task.status = 'error';
        task.result = 'Timeout';
        task.completedAt = Date.now();
        this.notifications.push({
          taskId,
          status: 'error',
          result: 'Timeout'
        });
        this.emit('taskComplete', { taskId, status: 'error', result: 'Timeout' });
      }
    }, timeout);

    return `Background task ${taskId} started: ${command.slice(0, 80)}`;
  }

  /**
   * Check status of a specific task
   */
  check(taskId?: string): string {
    if (taskId) {
      const task = this.tasks.get(taskId);
      if (!task) {
        return `Unknown task: ${taskId}`;
      }
      return `[${task.status}] ${task.command.slice(0, 60)}\n${task.result || '(running)'}`;
    }

    // List all tasks
    const lines: string[] = [];
    for (const [id, task] of this.tasks) {
      lines.push(`${id}: [${task.status}] ${task.command.slice(0, 60)}`);
    }
    return lines.length > 0 ? lines.join('\n') : 'No background tasks.';
  }

  /**
   * Drain notifications (call this after each LLM turn)
   */
  drain(): Array<{ taskId: string; status: string; result: string }> {
    const notifs = [...this.notifications];
    this.notifications = [];
    return notifs;
  }

  /**
   * Get pending notification count
   */
  hasNotifications(): boolean {
    return this.notifications.length > 0;
  }

  /**
   * Kill a running task
   */
  kill(taskId: string): string {
    const task = this.tasks.get(taskId);
    if (!task) {
      return `Unknown task: ${taskId}`;
    }
    
    const proc = this.processes.get(taskId);
    if (proc) {
      proc.kill('SIGTERM');
      this.processes.delete(taskId);
    }
    
    task.status = 'error';
    task.result = 'Killed by user';
    task.completedAt = Date.now();
    
    return `Task ${taskId} killed`;
  }
}
