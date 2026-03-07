/**
 * Enhanced Memory System
 * 
 * Features:
 * - Semantic search with keyword matching
 * - Memory categories/tags
 * - Quick recall by time period
 * - Context scoring for relevance
 */

import fs from 'fs';
import path from 'path';

export interface MemoryEntry {
  id: string;
  content: string;
  tags: string[];
  createdAt: number;
  source?: string;
}

interface MemoryIndex {
  entries: MemoryEntry[];
}

export class MemoryManager {
  private indexPath: string;
  private index: MemoryIndex;
  private memoryDir: string;

  constructor(memoryDir: string) {
    this.memoryDir = memoryDir;
    this.indexPath = path.join(memoryDir, 'memory-index.json');
    this.index = this.loadIndex();
  }

  private ensureDir() {
    if (!fs.existsSync(this.memoryDir)) {
      fs.mkdirSync(this.memoryDir, { recursive: true });
    }
  }

  private loadIndex(): MemoryIndex {
    try {
      if (fs.existsSync(this.indexPath)) {
        return JSON.parse(fs.readFileSync(this.indexPath, 'utf-8'));
      }
    } catch (e) {
      console.error('Failed to load memory index:', e);
    }
    return { entries: [] };
  }

  private saveIndex() {
    this.ensureDir();
    fs.writeFileSync(this.indexPath, JSON.stringify(this.index, null, 2));
  }

  /**
   * Add a memory entry
   */
  add(content: string, tags: string[] = [], source?: string): string {
    const entry: MemoryEntry = {
      id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      content,
      tags,
      source,
      createdAt: Date.now()
    };

    this.index.entries.push(entry);
    this.saveIndex();
    
    return `Memory saved: ${entry.id}`;
  }

  /**
   * Search memories by keyword
   */
  search(query: string, limit = 5): string {
    if (!query.trim()) {
      return 'Usage: memory_search <keyword> [limit]';
    }

    const queryLower = query.toLowerCase();
    const keywords = queryLower.split(/\s+/);
    
    // Score and sort entries
    const scored = this.index.entries.map(entry => {
      let score = 0;
      const contentLower = entry.content.toLowerCase();
      
      // Exact match gets higher score
      if (contentLower.includes(queryLower)) {
        score += 100;
      }
      
      // Keyword matches
      for (const kw of keywords) {
        if (contentLower.includes(kw)) {
          score += 10;
        }
        for (const tag of entry.tags) {
          if (tag.toLowerCase().includes(kw)) {
            score += 20;
          }
        }
      }
      
      // Recent entries get slight boost
      const hoursAgo = (Date.now() - entry.createdAt) / (1000 * 60 * 60);
      score += Math.max(0, 10 - hoursAgo / 24);
      
      return { entry, score };
    })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

    if (scored.length === 0) {
      return `No memories found for: ${query}`;
    }

    const lines: string[] = [`Found ${scored.length} memories for "${query}":\n`];
    for (const { entry, score } of scored) {
      const date = new Date(entry.createdAt).toLocaleDateString();
      const tagStr = entry.tags.length > 0 ? ` [${entry.tags.join(', ')}]` : '';
      lines.push(`📌 ${date}${tagStr} (score: ${score})`);
      lines.push(`   ${entry.content.slice(0, 200)}${entry.content.length > 200 ? '...' : ''}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Get recent memories
   */
  recent(days = 7, limit = 10): string {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    
    const recent = this.index.entries
      .filter(e => e.createdAt > cutoff)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);

    if (recent.length === 0) {
      return `No memories from the last ${days} days.`;
    }

    const lines: string[] = [`Recent ${recent.length} memories:\n`];
    for (const entry of recent) {
      const date = new Date(entry.createdAt).toLocaleDateString();
      const tagStr = entry.tags.length > 0 ? ` [${entry.tags.join(', ')}]` : '';
      lines.push(`📌 ${date}${tagStr}`);
      lines.push(`   ${entry.content.slice(0, 150)}${entry.content.length > 150 ? '...' : ''}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * List all tags
   */
  tags(): string {
    const tagCounts = new Map<string, number>();
    
    for (const entry of this.index.entries) {
      for (const tag of entry.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }

    if (tagCounts.size === 0) {
      return 'No tags yet.';
    }

    const sorted = [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1]);

    const lines = ['Memory tags:'];
    for (const [tag, count] of sorted) {
      lines.push(`  #${tag} (${count})`);
    }

    return lines.join('\n');
  }

  /**
   * Get by tag
   */
  byTag(tag: string, limit = 5): string {
    const tagLower = tag.toLowerCase();
    
    const matches = this.index.entries
      .filter(e => e.tags.some(t => t.toLowerCase().includes(tagLower)))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);

    if (matches.length === 0) {
      return `No memories with tag: ${tag}`;
    }

    const lines: string[] = [`Memories with #${tag}:\n`];
    for (const entry of matches) {
      const date = new Date(entry.createdAt).toLocaleDateString();
      lines.push(`📌 ${date}`);
      lines.push(`   ${entry.content.slice(0, 150)}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Get stats
   */
  stats(): string {
    const total = this.index.entries.length;
    const tags = new Set(this.index.entries.flatMap(e => e.tags)).size;
    const oldest = this.index.entries.length > 0 
      ? new Date(Math.min(...this.index.entries.map(e => e.createdAt))).toLocaleDateString()
      : 'N/A';
    const newest = this.index.entries.length > 0
      ? new Date(Math.max(...this.index.entries.map(e => e.createdAt))).toLocaleDateString()
      : 'N/A';

    return `Memory Stats:
  Total entries: ${total}
  Unique tags: ${tags}
  Oldest: ${oldest}
  Newest: ${newest}`;
  }

  /**
   * Clear old memories
   */
  cleanup(days = 30): string {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const before = this.index.entries.length;
    
    this.index.entries = this.index.entries.filter(e => e.createdAt > cutoff);
    const removed = before - this.index.entries.length;
    
    this.saveIndex();
    return `Cleaned up ${removed} memories older than ${days} days.`;
  }
}
