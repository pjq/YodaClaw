/**
 * Skills Manager - Load and manage Agent Skills
 * 
 * Skills are stored in .claude/skills/ folder
 * Each skill has a SKILL.md with instructions
 */

import fs from 'fs';
import path from 'path';

export interface Skill {
  name: string;
  description: string;
  content: string;
  path: string;
}

export class SkillsManager {
  private skillsDir: string;
  private skills: Map<string, Skill> = new Map();

  constructor(skillsDir: string) {
    this.skillsDir = skillsDir;
    this.loadSkills();
  }

  private loadSkills() {
    const claudeDir = path.join(this.skillsDir, '.claude', 'skills');
    
    if (!fs.existsSync(claudeDir)) {
      console.log('[Skills] No skills directory found');
      return;
    }

    try {
      const entries = fs.readdirSync(claudeDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        
        const skillPath = path.join(claudeDir, entry.name, 'SKILL.md');
        if (!fs.existsSync(skillPath)) continue;

        try {
          const content = fs.readFileSync(skillPath, 'utf-8');
          const { name, description } = this.parseFrontmatter(content);
          
          this.skills.set(entry.name, {
            name: name || entry.name,
            description: description || '',
            content,
            path: skillPath
          });
          
          console.log(`[Skills] Loaded: ${entry.name}`);
        } catch (e) {
          console.error(`[Skills] Failed to load ${entry.name}:`, e);
        }
      }
    } catch (e) {
      console.error('[Skills] Failed to read skills directory:', e);
    }
  }

  private parseFrontmatter(content: string): { name?: string; description?: string } {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return {};

    const frontmatter: Record<string, string> = {};
    for (const line of match[1].split('\n')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      frontmatter[key] = value;
    }

    return {
      name: frontmatter.name,
      description: frontmatter.description
    };
  }

  /**
   * Get list of available skills
   */
  list(): string {
    if (this.skills.size === 0) {
      return 'No skills installed. Skills should be in .claude/skills/ folder.';
    }

    const lines = ['Available Skills:\n'];
    for (const [name, skill] of this.skills) {
      lines.push(`• **${name}** - ${skill.description || 'No description'}`);
    }
    return lines.join('\n');
  }

  /**
   * Get a specific skill
   */
  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  /**
   * Get skill content
   */
  getContent(name: string): string {
    const skill = this.skills.get(name);
    return skill?.content || `Skill not found: ${name}`;
  }

  /**
   * Check if skill exists
   */
  has(name: string): boolean {
    return this.skills.has(name);
  }

  /**
   * Reload skills
   */
  reload() {
    this.skills.clear();
    this.loadSkills();
  }

  /**
   * Get all skill names
   */
  names(): string[] {
    return Array.from(this.skills.keys());
  }
}
