/**
 * Team Messaging System
 * 
 * Based on learn-claude-code's s09-agent-teams pattern
 * 
 * Features:
 * - JSONL-based message bus
 * - Inboxes for each team member
 * - Message types: message, broadcast, shutdown_request, shutdown_response, plan_approval_response
 */

import fs from 'fs';
import path from 'path';

export interface TeamMessage {
  type: 'message' | 'broadcast' | 'shutdown_request' | 'shutdown_response' | 'plan_approval_response';
  from: string;
  content: string;
  timestamp: number;
  requestId?: string;
  approve?: boolean;
  feedback?: string;
}

export class MessageBus {
  private inboxDir: string;

  constructor(inboxDir: string) {
    this.inboxDir = inboxDir;
    this.ensureDir();
  }

  private ensureDir() {
    if (!fs.existsSync(this.inboxDir)) {
      fs.mkdirSync(this.inboxDir, { recursive: true });
    }
  }

  private inboxPath(name: string): string {
    return path.join(this.inboxDir, `${name}.jsonl`);
  }

  /**
   * Send a message to a team member
   */
  send(from: string, to: string, content: string, msgType: TeamMessage['type'] = 'message', extra?: Partial<TeamMessage>): string {
    const msg: TeamMessage = {
      type: msgType,
      from,
      content,
      timestamp: Date.now(),
      ...extra
    };

    const inboxPath = this.inboxPath(to);
    fs.appendFileSync(inboxPath, JSON.stringify(msg) + '\n');
    return `Sent ${msgType} to ${to}`;
  }

  /**
   * Read and drain inbox (messages are deleted after reading)
   */
  readInbox(name: string): TeamMessage[] {
    const inboxPath = this.inboxPath(name);
    if (!fs.existsSync(inboxPath)) {
      return [];
    }

    try {
      const content = fs.readFileSync(inboxPath, 'utf-8');
      const messages = content
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));
      
      // Clear inbox after reading
      fs.writeFileSync(inboxPath, '');
      return messages;
    } catch (e) {
      console.error('Error reading inbox:', e);
      return [];
    }
  }

  /**
   * Broadcast to multiple team members
   */
  broadcast(from: string, content: string, recipients: string[]): string {
    let count = 0;
    for (const to of recipients) {
      if (to !== from) {
        this.send(from, to, content, 'broadcast');
        count++;
      }
    }
    return `Broadcast to ${count} teammates`;
  }
}
