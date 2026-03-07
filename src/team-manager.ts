/**
 * Team Manager
 * 
 * Based on learn-claude-code's s09-agent-teams and s11-autonomous-agents patterns
 * 
 * Features:
 * - Team configuration (name, members)
 * - Member status tracking (working, idle, shutdown)
 * - Spawn autonomous teammates
 * - Auto-claim tasks from the board
 */

import fs from 'fs';
import path from 'path';

export interface TeamMember {
  name: string;
  role: string;
  status: 'working' | 'idle' | 'shutdown';
  lastActive: number;
}

export interface TeamConfig {
  teamName: string;
  members: TeamMember[];
}

export class TeamManager {
  private configPath: string;
  private config: TeamConfig;
  private teamDir: string;

  constructor(teamDir: string) {
    this.teamDir = teamDir;
    this.configPath = path.join(teamDir, 'config.json');
    this.config = this.loadConfig();
    this.ensureDir();
  }

  private ensureDir() {
    if (!fs.existsSync(this.teamDir)) {
      fs.mkdirSync(this.teamDir, { recursive: true });
    }
  }

  private loadConfig(): TeamConfig {
    if (fs.existsSync(this.configPath)) {
      try {
        return JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
      } catch (e) {
        console.error('Error loading team config:', e);
      }
    }
    return { teamName: 'default', members: [] };
  }

  private saveConfig() {
    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
  }

  /**
   * Get team name
   */
  getTeamName(): string {
    return this.config.teamName;
  }

  /**
   * Set team name
   */
  setTeamName(name: string) {
    this.config.teamName = name;
    this.saveConfig();
  }

  /**
   * Get all members
   */
  getMembers(): TeamMember[] {
    return [...this.config.members];
  }

  /**
   * Find a member by name
   */
  findMember(name: string): TeamMember | undefined {
    return this.config.members.find(m => m.name === name);
  }

  /**
   * Add or update a member
   */
  upsertMember(name: string, role: string, status: TeamMember['status'] = 'idle'): TeamMember {
    const existing = this.findMember(name);
    if (existing) {
      existing.role = role;
      existing.status = status;
      existing.lastActive = Date.now();
      this.saveConfig();
      return existing;
    }

    const member: TeamMember = { name, role, status, lastActive: Date.now() };
    this.config.members.push(member);
    this.saveConfig();
    return member;
  }

  /**
   * Update member status
   */
  updateStatus(name: string, status: TeamMember['status']): string {
    const member = this.findMember(name);
    if (!member) {
      return `Error: Member '${name}' not found`;
    }
    member.status = status;
    member.lastActive = Date.now();
    this.saveConfig();
    return `Member '${name}' status updated to ${status}`;
  }

  /**
   * Remove a member
   */
  removeMember(name: string): string {
    const idx = this.config.members.findIndex(m => m.name === name);
    if (idx === -1) {
      return `Error: Member '${name}' not found`;
    }
    this.config.members.splice(idx, 1);
    this.saveConfig();
    return `Member '${name}' removed`;
  }

  /**
   * List all members as string
   */
  list(): string {
    if (this.config.members.length === 0) {
      return 'No teammates.';
    }

    const lines = [`Team: ${this.config.teamName}`];
    for (const m of this.config.members) {
      lines.push(`  ${m.name} (${m.role}): ${m.status}`);
    }
    return lines.join('\n');
  }

  /**
   * Get member names (for broadcasting)
   */
  getMemberNames(): string[] {
    return this.config.members.map(m => m.name);
  }

  /**
   * Get idle members
   */
  getIdleMembers(): TeamMember[] {
    return this.config.members.filter(m => m.status === 'idle');
  }

  /**
   * Get working members
   */
  getWorkingMembers(): TeamMember[] {
    return this.config.members.filter(m => m.status === 'working');
  }
}
