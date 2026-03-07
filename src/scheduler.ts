/**
 * Scheduler - Cron-like task scheduling
 */

import fs from 'fs';
import path from 'path';
import https from 'https';

// Comprehensive research function
async function runResearch(query: string): Promise<string> {
  return new Promise((resolve) => {
    const apiKey = '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';
    const postData = JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'advanced',
      max_results: 8,
      include_answer: true,
      include_raw_content: false
    });

    const options = {
      hostname: 'api.tavily.com',
      path: '/search',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
    };

    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString());
          const lines: string[] = [];
          
          lines.push(`🔬 **${query}**\n`);
          
          if (data.answer) {
            lines.push(`## 📝 Summary\n${data.answer}\n`);
          }
          
          if (data.results && data.results.length > 0) {
            lines.push(`## 📚 Top ${data.results.length} Sources\n`);
            for (let i = 0; i < Math.min(data.results.length, 8); i++) {
              const r = data.results[i];
              lines.push(`\n### ${i + 1}. ${r.title || 'Untitled'}`);
              lines.push(`🔗 ${r.url}`);
              if (r.content) {
                lines.push(`   ${r.content.slice(0, 300)}...`);
              }
            }
          }
          
          resolve(lines.join('\n').slice(0, 4000));
        } catch { resolve('Error parsing results.'); }
      });
    });
    req.on('error', () => resolve('Network error.'));
    req.write(postData);
    req.end();
  });
}

export interface ScheduledTask {
  id: string;
  name: string;
  schedule: string;
  delay?: number;
  action: string;
  params?: Record<string, any>;
  enabled: boolean;
  lastRun?: number;
  createdAt: number;
}

interface ScheduleConfig {
  schedules: ScheduledTask[];
}

type TaskCallback = (task: ScheduledTask, result: string) => void;

export class Scheduler {
  private configPath: string;
  private config: ScheduleConfig;
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private callbacks: TaskCallback[] = [];

  constructor(configPath: string) {
    this.configPath = configPath;
    this.config = this.loadConfig();
    this.startAll();
  }

  private loadConfig(): ScheduleConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        return JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
      }
    } catch (e) { console.error('Load config failed:', e); }
    return { schedules: [] };
  }

  private saveConfig() {
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
  }

  onTask(cb: TaskCallback) { this.callbacks.push(cb); }

  add(name: string, schedule: string, action: string, params?: Record<string, any>): string {
    let parsedSchedule = schedule;
    let parsedDelay: number | undefined;
    
    const fromNowMatch = schedule.match(/(\d+)\s*(minute|min|hour|hr|day|second|sec)\s*(from now|later)?/i);
    if (fromNowMatch) {
      const value = parseInt(fromNowMatch[1]);
      const unit = fromNowMatch[2].toLowerCase();
      if (unit.startsWith('min') || unit.startsWith('sec')) {
        parsedSchedule = 'once';
        parsedDelay = value * (unit.startsWith('sec') ? 1000 : 60000);
      } else if (unit.startsWith('hour') || unit.startsWith('hr')) {
        parsedSchedule = 'once';
        parsedDelay = value * 3600000;
      } else if (unit.startsWith('day')) {
        parsedSchedule = 'once';
        parsedDelay = value * 86400000;
      }
    } else {
      const simpleMatch = schedule.match(/^(\d+)(m|h|d)$/);
      if (!simpleMatch) parsedSchedule = '1h';
    }
    
    let parsedAction = action;
    let parsedParams = params;
    
    if (action.includes('deep_research') || action.includes('research')) {
      const queryMatch = action.match(/(?:about|on|for)\s+(.+)$/i);
      if (queryMatch) {
        parsedAction = 'research';
        parsedParams = { query: queryMatch[1] };
      } else {
        parsedAction = 'research';
        parsedParams = { query: name };
      }
    }
    
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const task: ScheduledTask = { 
      id, name, schedule: parsedSchedule, delay: parsedDelay,
      action: parsedAction, params: parsedParams, enabled: true, createdAt: Date.now() 
    };
    this.config.schedules.push(task);
    this.saveConfig();
    this.startTask(task);
    return `Schedule added: ${name}`;
  }

  remove(idOrName: string): string {
    const idx = this.config.schedules.findIndex(t => t.id === idOrName || t.name === idOrName);
    if (idx === -1) return `Not found: ${idOrName}`;
    const task = this.config.schedules[idx];
    this.stopTask(task.id);
    this.config.schedules.splice(idx, 1);
    this.saveConfig();
    return `Removed: ${task.name}`;
  }

  list(): string {
    if (!this.config.schedules.length) return 'No schedules.';
    return this.config.schedules.map(t => 
      `${t.enabled ? '✅' : '❌'} ${t.name} (${t.schedule}) - ${t.action}`
    ).join('\n');
  }

  private startTask(task: ScheduledTask) {
    if (!task.enabled) return;
    this.stopTask(task.id);
    
    if (task.schedule === 'once' && task.delay) {
      const timeout = setTimeout(() => {
        this.runTask(task);
        const idx = this.config.schedules.findIndex(t => t.id === task.id);
        if (idx >= 0) this.config.schedules.splice(idx, 1);
        this.saveConfig();
      }, task.delay);
      this.intervals.set(task.id, timeout);
      return;
    }
    
    const match = task.schedule.match(/^(\d+)(m|h|d)$/);
    let ms = 3600000;
    if (match) {
      const v = parseInt(match[1]);
      ms = match[2] === 'm' ? v * 60000 : match[2] === 'h' ? v * 3600000 : v * 86400000;
    }
    
    const interval = setInterval(() => this.runTask(task), ms);
    this.intervals.set(task.id, interval);
  }

  private stopTask(id: string) {
    const t = this.intervals.get(id);
    if (t) { clearInterval(t); clearTimeout(t); this.intervals.delete(id); }
  }

  private startAll() {
    for (const t of this.config.schedules) if (t.enabled) this.startTask(t);
  }

  private async runTask(task: ScheduledTask) {
    task.lastRun = Date.now();
    this.saveConfig();
    console.log(`[Scheduler] Running: ${task.name}`);
    
    let result = '';
    try {
      if (task.action === 'research' && task.params?.query) {
        result = await runResearch(task.params.query);
      } else {
        result = `[${task.action}]`;
      }
    } catch (e: any) { result = `Error: ${e.message}`; }
    
    for (const cb of this.callbacks) cb(task, result);
  }

  stopAll() { for (const [id] of this.intervals) this.stopTask(id); }
}
