/**
 * Task Manager - File-based task persistence with dependency graph
 * 
 * Based on learn-claude-code's s07-task-system pattern
 * 
 * Features:
 * - Tasks persisted to disk (JSON files)
 * - Dependency graph (blockedBy / blocks)
 * - Owner assignment
 * - Status tracking (pending / in_progress / completed / deleted)
 */

import fs from 'fs';
import path from 'path';

export interface Task {
  id: number;
  subject: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'deleted';
  owner: string | null;
  blockedBy: number[];
  blocks: number[];
  createdAt: number;
  updatedAt: number;
}

export class TaskManager {
  private tasksDir: string;
  private nextId: number = 1;

  constructor(tasksDir: string) {
    this.tasksDir = tasksDir;
    this.ensureDir();
    this.loadNextId();
  }

  private ensureDir() {
    if (!fs.existsSync(this.tasksDir)) {
      fs.mkdirSync(this.tasksDir, { recursive: true });
    }
  }

  private loadNextId() {
    const files = fs.readdirSync(this.tasksDir).filter(f => f.startsWith('task_') && f.endsWith('.json'));
    if (files.length === 0) {
      this.nextId = 1;
      return;
    }
    const ids = files.map(f => parseInt(f.replace('task_', '').replace('.json', '')));
    this.nextId = Math.max(...ids) + 1;
  }

  private taskPath(id: number): string {
    return path.join(this.tasksDir, `task_${id}.json`);
  }

  private loadTask(id: number): Task {
    const filepath = this.taskPath(id);
    if (!fs.existsSync(filepath)) {
      throw new Error(`Task ${id} not found`);
    }
    return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  }

  private saveTask(task: Task) {
    task.updatedAt = Date.now();
    fs.writeFileSync(this.taskPath(task.id), JSON.stringify(task, null, 2));
  }

  /**
   * Create a new task
   */
  create(subject: string, description: string = ''): string {
    const task: Task = {
      id: this.nextId++,
      subject,
      description,
      status: 'pending',
      owner: null,
      blockedBy: [],
      blocks: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    this.saveTask(task);
    return JSON.stringify(task, null, 2);
  }

  /**
   * Get a task by ID
   */
  get(id: number): string {
    const task = this.loadTask(id);
    return JSON.stringify(task, null, 2);
  }

  /**
   * Update task status, blockedBy, or blocks
   */
  update(id: number, status?: string, addBlockedBy?: number[], addBlocks?: number[]): string {
    const task = this.loadTask(id);
    
    if (status) {
      task.status = status as Task['status'];
      
      // If completing, unblock dependents
      if (status === 'completed') {
        const allTasks = this.listAll();
        for (const t of allTasks) {
          if (t.blockedBy.includes(id)) {
            t.blockedBy = t.blockedBy.filter(bid => bid !== id);
            this.saveTask(t);
          }
        }
      }
      
      // If deleting, remove from dependents
      if (status === 'deleted') {
        const allTasks = this.listAll();
        for (const t of allTasks) {
          if (t.blockedBy.includes(id)) {
            t.blockedBy = t.blockedBy.filter(bid => bid !== id);
            this.saveTask(t);
          }
        }
        if (fs.existsSync(this.taskPath(id))) {
          fs.unlinkSync(this.taskPath(id));
        }
        return `Task ${id} deleted`;
      }
    }
    
    if (addBlockedBy) {
      task.blockedBy = [...new Set([...task.blockedBy, ...addBlockedBy])];
    }
    
    if (addBlocks) {
      task.blocks = [...new Set([...task.blocks, ...addBlocks])];
    }
    
    this.saveTask(task);
    return JSON.stringify(task, null, 2);
  }

  /**
   * List all tasks
   */
  listAll(): Task[] {
    const files = fs.readdirSync(this.tasksDir).filter(f => f.startsWith('task_') && f.endsWith('.json'));
    const tasks: Task[] = [];
    
    for (const file of files) {
      try {
        const task = JSON.parse(fs.readFileSync(path.join(this.tasksDir, file), 'utf-8'));
        if (task.status !== 'deleted') {
          tasks.push(task);
        }
      } catch (e) {
        // Skip invalid files
      }
    }
    
    return tasks.sort((a, b) => a.id - b.id);
  }

  /**
   * List tasks as formatted string
   */
  list(): string {
    const tasks = this.listAll();
    if (tasks.length === 0) {
      return 'No tasks.';
    }
    
    const lines: string[] = [];
    for (const t of tasks) {
      const marker = {
        'pending': '[ ]',
        'in_progress': '[>]',
        'completed': '[x]'
      }[t.status] || '[?]';
      
      const owner = t.owner ? ` @${t.owner}` : '';
      const blocked = t.blockedBy.length > 0 ? ` (blocked by: ${t.blockedBy.join(', ')})` : '';
      
      lines.push(`${marker} #${t.id}: ${t.subject}${owner}${blocked}`);
    }
    
    return lines.join('\n');
  }

  /**
   * Claim a task (assign to an owner)
   */
  claim(id: number, owner: string): string {
    const task = this.loadTask(id);
    task.owner = owner;
    task.status = 'in_progress';
    this.saveTask(task);
    return `Claimed task #${id} for ${owner}`;
  }

  /**
   * Get pending tasks that are not blocked
   */
  getAvailable(): Task[] {
    const tasks = this.listAll();
    return tasks.filter(t => 
      t.status === 'pending' && 
      !t.owner && 
      t.blockedBy.length === 0
    );
  }
}
