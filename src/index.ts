import 'dotenv/config';
import express from 'express';
import TelegramBot from 'node-telegram-bot-api';
import { logger } from './logger';
import { TodoManager } from './todo';
import { ContextManager } from './context';
import { TaskManager } from './task';
import { BackgroundManager } from './background';
import { TeamManager } from './team-manager';
import { MessageBus } from './team';
import { tavilySearch } from './tavily';
import { deepResearch, extractUrl } from './research';
import { HistoryManager } from './history';
import { Scheduler } from './scheduler';
import { MemoryManager } from './memory';
import { SkillsManager } from './skills';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import https from 'https';
// MCP is optional - only load if available
let startMCP: any = null;
let callMCP: any = null;
let MCPHandleType: any = null;
let MCPConfigType: any = null;
try {
  const mcp = require('./mcp');
  startMCP = mcp.startMCP;
  callMCP = mcp.callMCP;
  MCPHandleType = mcp.MCPHandle;
  MCPConfigType = mcp.MCPConfig;
} catch (e: any) {
  logger.warn('mcp.module_missing', { e: String(e) });
}

// ----- Config & App -----
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  logger.debug('http', { method: req.method, path: req.path });
  next();
});

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const STARTUP_NOTIFY_CHAT_ID = process.env.STARTUP_NOTIFY_CHAT_ID ? Number(process.env.STARTUP_NOTIFY_CHAT_ID) : undefined;
const PORT = Number(process.env.PORT || 3000);
const WORKSPACE_ROOT = path.resolve('/home/pjq/clawd/YodaClaw');
const ENABLE_TOOLS = process.env.ENABLE_TOOLS === '1';
const ENABLE_MCP = process.env.ENABLE_MCP === '1';

// Load identity files
function loadIdentityFile(filename: string): string {
  const filepath = path.join(WORKSPACE_ROOT, filename);
  try {
    if (fs.existsSync(filepath)) {
      return fs.readFileSync(filepath, 'utf-8');
    }
  } catch (e) {
    logger.warn(`Failed to load ${filename}`, { e: String(e) });
  }
  return '';
}

const SOUL = loadIdentityFile('SOUL.md');
const USER = loadIdentityFile('USER.md');
const AGENTS = loadIdentityFile('AGENTS.md');

const SYSTEM_BASE = 'You are OpenClaw (YodaClaw), an AI assistant running on OpenClaw. Be concise, helpful, and precise. Default to Chinese if the user writes in Chinese; otherwise reply in the user\'s language. Keep answers under 3000 chars. When asked to search the web, ALWAYS use tavily_search tool. You have access to Agent Skills - use skills_list to see available skills. AUTOMATICALLY use relevant skills when the user\'s request matches a skill\'s description. Check skills FIRST before doing tasks manually.' +
  (SOUL ? '\n\n## YodaClaw Identity\n' + SOUL.slice(0, 500) : '') +
  (USER ? '\n\n## User Context\n' + USER.slice(0, 500) : '');

const SYSTEM_CODE = 'You are OpenClaw (YodaClaw), an AI assistant running on OpenClaw. Think step-by-step. If code is requested, produce minimal, runnable snippets. Keep answers under 4000 chars.' +
  (SOUL ? '\n\n' + SOUL.slice(0, 500) : '');

const SYSTEM_IMAGE = 'You are OpenClaw (YodaClaw), an AI assistant running on OpenClaw. Analyze the image and provide a detailed description.' +
  (SOUL ? '\n\n' + SOUL.slice(0, 300) : '');

logger.info('identity_loaded', { 
  hasSoul: !!SOUL, 
  hasUser: !!USER, 
  hasAgents: !!AGENTS 
});

let mcpHandles: any[] = [];

// Todo Manager for enhanced task tracking (s03 from learn-claude-code)
const TODO = new TodoManager(path.join(WORKSPACE_ROOT, 'memory', 'todos.json'));

// Context Manager for conversation compression (s06 from learn-claude-code)
const CTX = new ContextManager(path.join(WORKSPACE_ROOT, 'memory', 'transcripts'), 80000);

// History Manager for conversation persistence
const HISTORY = new HistoryManager(path.join(WORKSPACE_ROOT, 'memory', 'history'));

// Scheduler for cron-like tasks
const SCHEDULER = new Scheduler(path.join(WORKSPACE_ROOT, 'memory', 'schedules.json'));

// Register scheduler callback for notifications (will be set after bot is created)
let schedulerCallback: ((task: any, result: string) => void) | null = null;
SCHEDULER.onTask((task, result) => {
  if (schedulerCallback) {
    schedulerCallback(task, result);
  }
});

// Memory Manager for enhanced memories
const MEMORY = new MemoryManager(path.join(WORKSPACE_ROOT, 'memory', 'memories'));

// Skills Manager - Load Agent Skills
const SKILLS = new SkillsManager(WORKSPACE_ROOT);

logger.info('skills_loaded', { count: SKILLS.names().length });

// Task Manager for file-based task persistence (s07 from learn-claude-code)
const TASK_MGR = new TaskManager(path.join(WORKSPACE_ROOT, 'memory', 'tasks'));

// Background Task Manager (s08 from learn-claude-code)
const BG = new BackgroundManager();

// Team Manager (s09 from learn-claude-code)
const TEAM = new TeamManager(path.join(WORKSPACE_ROOT, 'memory', 'team'));
const BUS = new MessageBus(path.join(WORKSPACE_ROOT, 'memory', 'team', 'inbox'));

// Shutdown and plan approval tracking
const shutdownRequests: Map<string, { target: string; status: string }> = new Map();
const planRequests: Map<string, { from: string; status: string }> = new Map();

const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const MODEL_NAME = process.env.MODEL_NAME || 'gpt-5';

if (!TELEGRAM_BOT_TOKEN) {
  logger.error('Missing TELEGRAM_BOT_TOKEN in .env');
  process.exit(1);
}

// ----- Utilities -----
function chunk(text: string, max = 3800) {
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += max) parts.push(text.slice(i, i + max));
  return parts;
}

async function safeReply(bot: TelegramBot, chatId: number, text: string, replyToMessageId?: number) {
  for (const part of chunk(text)) {
    try {
      const sent = await bot.sendMessage(chatId, part, { reply_to_message_id: replyToMessageId });
      logger.info('reply', { chatId, replyTo: replyToMessageId, messageId: sent.message_id, len: part.length });
    } catch (e: any) {
      logger.error('sendMessage failed', { e: String(e) });
    }
  }
}

function withinWorkspace(p: string) {
  const base = WORKSPACE_ROOT;
  const target = path.resolve(base, p.startsWith('/') ? path.relative('/', p) : p);
  return target.startsWith(base) ? target : null;
}

function isSafeContent(buf: Buffer, maxBytes = 200_000) {
  if (buf.length > maxBytes) return { ok: false, reason: `Content too large (${buf.length} bytes)` } as const;
  const ascii = buf.toString('utf8');
  if (/\x00/.test(ascii)) return { ok: false, reason: 'Binary content not allowed' } as const;
  return { ok: true } as const;
}

function sanitizeCommand(input: string) {
  const forbidden = /[;&|`$><\\]/;
  if (forbidden.test(input)) return { ok: false, reason: 'Forbidden characters in command' } as const;
  const parts = input.trim().split(/\s+/);
  const cmd = parts[0];
  // Allow all commands (user is responsible for safety)
  return { ok: true, cmd, args: parts.slice(1) } as const;
}

function execCommand(command: string, timeoutMs = 10_000): Promise<{ stdout: string; stderr: string; code: number | null }>
{ return new Promise((resolve) => {
    exec(command, { timeout: timeoutMs, maxBuffer: 512 * 1024 }, (error, stdout, stderr) => {
      resolve({ stdout, stderr, code: (error as any)?.code ?? 0 });
    });
  });
}

function httpGet(url: string, maxBytes = 150_000): Promise<{ status: number; body: string }>
{ return new Promise((resolve, reject) => {
    try {
      https.get(url, (res) => {
        const status = res.statusCode || 0;
        const chunks: Buffer[] = [];
        let total = 0;
        res.on('data', (d) => {
          total += d.length;
          if (total <= maxBytes) chunks.push(d);
        });
        res.on('end', () => resolve({ status, body: Buffer.concat(chunks).toString('utf8') }));
      }).on('error', reject);
    } catch (e) { reject(e); }
  });
}

function httpPostJson(urlStr: string, body: any, headers: Record<string,string>): Promise<{ status: number; body: string }>
{ return new Promise((resolve, reject) => {
    try {
      const url = new URL(urlStr);
      const opts: https.RequestOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
      };
      const req = https.request(url, opts, (res) => {
        const status = res.statusCode || 0;
        const chunks: Buffer[] = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () => resolve({ status, body: Buffer.concat(chunks).toString('utf8') }));
      });
      req.on('error', reject);
      req.write(JSON.stringify(body));
      req.end();
    } catch (e) { reject(e); }
  });
}

// Download image and return base64 encoded string
async function downloadImage(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve(buffer.toString('base64'));
      });
      res.on('error', () => resolve(null));
    }).on('error', () => resolve(null));
  });
}

type ChatMsg = { role: 'system'|'user'|'assistant'|'tool'; content: any; name?: string; tool_call_id?: string; tool_calls?: any[]; reasoning?: string };

async function llmChat(messages: ChatMsg[], temperature = 0.7): Promise<string> {
  if (!OPENAI_API_KEY) {
    logger.warn('LLM not configured: missing OPENAI_API_KEY');
    return 'LLM not configured on server (missing OPENAI_API_KEY).';
  }
  const url = `${OPENAI_BASE_URL}/chat/completions`;
  // Base tools
  const baseTools = [
    { type: 'function', function: { name: 'read_file', description: 'Read a UTF-8 text file under the workspace', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } },
    { type: 'function', function: { name: 'write_file', description: 'Write a small UTF-8 text file under the workspace', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path','content'] } } },
    { type: 'function', function: { name: 'list_files', description: 'List files in a directory under the workspace', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } },
    { type: 'function', function: { name: 'run_command', description: 'Run a whitelisted command with timeout', parameters: { type: 'object', properties: { cmd: { type: 'string' } }, required: ['cmd'] } } },
    { type: 'function', function: { name: 'web_search', description: 'Search and fetch a web page', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
    { type: 'function', function: { name: 'tavily_search', description: 'Search the web using Tavily AI search', parameters: { type: 'object', properties: { query: { type: 'string' }, maxResults: { type: 'number' } }, required: ['query'] } } },
    { type: 'function', function: { name: 'deep_research', description: 'Deep research on a topic with comprehensive sources and AI summary', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
    { type: 'function', function: { name: 'extract_url', description: 'Extract full content from a URL', parameters: { type: 'object', properties: { url: { type: 'string' }, maxChars: { type: 'number' } }, required: ['url'] } } },
    { type: 'function', function: { name: 'git_status', description: 'Git status and short diff', parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'TodoWrite', description: 'Update task tracking list with items containing content, status (pending/in_progress/completed), and activeForm', parameters: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { content: { type: 'string' }, status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] }, activeForm: { type: 'string' } }, required: ['content', 'status', 'activeForm'] } } }, required: ['items'] } } },
    { type: 'function', function: { name: 'task_create', description: 'Create a new persistent task', parameters: { type: 'object', properties: { subject: { type: 'string' }, description: { type: 'string' } }, required: ['subject'] } } },
    { type: 'function', function: { name: 'task_get', description: 'Get task details by ID', parameters: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] } } },
    { type: 'function', function: { name: 'task_update', description: 'Update task status or dependencies', parameters: { type: 'object', properties: { id: { type: 'number' }, status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'deleted'] }, addBlockedBy: { type: 'array', items: { type: 'number' } }, addBlocks: { type: 'array', items: { type: 'number' } } }, required: ['id'] } } },
    { type: 'function', function: { name: 'task_list', description: 'List all tasks', parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'schedule_add', description: 'Add a scheduled task (e.g., "30m", "1h", "1d")', parameters: { type: 'object', properties: { name: { type: 'string' }, schedule: { type: 'string' }, action: { type: 'string' } }, required: ['name', 'schedule', 'action'] } } },
    { type: 'function', function: { name: 'schedule_list', description: 'List scheduled tasks', parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'schedule_remove', description: 'Remove a scheduled task', parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } } },
    { type: 'function', function: { name: 'memory_add', description: 'Add a memory entry', parameters: { type: 'object', properties: { content: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } }, required: ['content'] } } },
    { type: 'function', function: { name: 'memory_search', description: 'Search memories', parameters: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' } }, required: ['query'] } } },
    { type: 'function', function: { name: 'memory_recent', description: 'Get recent memories', parameters: { type: 'object', properties: { days: { type: 'number' }, limit: { type: 'number' } } } } },
    { type: 'function', function: { name: 'memory_tags', description: 'List memory tags', parameters: { type: 'object', properties: {} } } },
    // Skills tools
    { type: 'function', function: { name: 'skills_list', description: 'List available Agent Skills', parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'skill_show', description: 'Show skill details', parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } } },
    { type: 'function', function: { name: 'background_run', description: 'Run command in background thread', parameters: { type: 'object', properties: { command: { type: 'string' }, timeout: { type: 'number' } }, required: ['command'] } } },
    { type: 'function', function: { name: 'background_check', description: 'Check background task status', parameters: { type: 'object', properties: { taskId: { type: 'string' } } } } },
    // Team tools
    { type: 'function', function: { name: 'spawn_teammate', description: 'Spawn a new teammate agent', parameters: { type: 'object', properties: { name: { type: 'string' }, role: { type: 'string' }, prompt: { type: 'string' } }, required: ['name', 'role', 'prompt'] } } },
    { type: 'function', function: { name: 'list_teammates', description: 'List all teammates', parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'send_message', description: 'Send a message to a teammate', parameters: { type: 'object', properties: { to: { type: 'string' }, content: { type: 'string' }, msgType: { type: 'string', enum: ['message', 'broadcast', 'shutdown_request', 'shutdown_response', 'plan_approval_response'] } }, required: ['to', 'content'] } } },
    { type: 'function', function: { name: 'broadcast', description: 'Broadcast message to all teammates', parameters: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'] } } },
    { type: 'function', function: { name: 'read_inbox', description: 'Read and drain inbox messages', parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'shutdown_request', description: 'Request a teammate to shut down', parameters: { type: 'object', properties: { teammate: { type: 'string' } }, required: ['teammate'] } } },
    { type: 'function', function: { name: 'plan_approval', description: 'Approve or reject a plan', parameters: { type: 'object', properties: { requestId: { type: 'string' }, approve: { type: 'boolean' }, feedback: { type: 'string' } }, required: ['requestId', 'approve'] } } },
    { type: 'function', function: { name: 'idle', description: 'Signal idle state (for teammates)', parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'claim_task', description: 'Claim a task from the board', parameters: { type: 'object', properties: { taskId: { type: 'number' } }, required: ['taskId'] } } },
  ];
  // Add MCP tools if connected
  let mcpTools: any[] = [];
  if (ENABLE_MCP && mcpHandles.length) {
    for (const h of mcpHandles) {
      for (const [fq, t] of Object.entries(h.tools)) {
        const toolDef = t as any;
        mcpTools.push({ type: 'function', function: { name: fq, description: toolDef.description || `MCP tool: ${fq}`, parameters: toolDef.inputSchema || { type: 'object', properties: {} } } });
      }
    }
  }
  const tools: any[] = ENABLE_TOOLS ? [...baseTools, ...mcpTools] : undefined;
  const payload: any = { messages, temperature, stream: false, max_tokens: 800 };
  if (tools) { payload.tools = tools; payload.tool_choice = 'auto'; }
  // Some Azure/SAP-style deployments carry the deployment in the URL and reject a 'model' field in the body.
  if (OPENAI_BASE_URL.includes('api.openai.com')) {
    payload.model = MODEL_NAME;
  }
  logger.debug('llm.request', { model: MODEL_NAME, baseUrl: OPENAI_BASE_URL, messages: messages.length });
  const headers: Record<string,string> = { Authorization: `Bearer ${OPENAI_API_KEY}` };
  // Some proxies require api-version in query; honor if already present in base URL. Otherwise add a safe default.
  const urlWithVersion = /api-version=/.test(url) ? url : `${url}?api-version=2023-05-15`;
  const res = await httpPostJson(urlWithVersion, payload, headers);
  if (res.status < 200 || res.status >= 300) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const ej = JSON.parse(res.body);
      errMsg = ej?.error?.message || ej?.error?.code || (res.body || '').slice(0, 200);
    } catch {}
    logger.error('llm.http_error', { status: res.status, body: res.body.slice(0, 500) });
    return `LLM error: ${errMsg} (HTTP ${res.status})`;
  }
  try {
    const json = JSON.parse(res.body);
    const text: string = json?.choices?.[0]?.message?.content || '';
    logger.debug('llm.response', { ok: !!text, chars: text.length });
    return text || '[empty response]';
  } catch (e: any) {
    logger.error('llm.parse_error', { e: String(e) });
    return 'LLM parse error';
  }
}

// Simple summarization for context compression (no tools to avoid recursion)
async function llmChatSummary(messages: ChatMsg[]): Promise<string> {
  if (!OPENAI_API_KEY) return '[summary unavailable - no API key]';
  
  const url = `${OPENAI_BASE_URL}/chat/completions`;
  const payload = {
    messages,
    temperature: 0.5,
    stream: false,
    max_tokens: 2000,
    model: OPENAI_BASE_URL.includes('api.openai.com') ? MODEL_NAME : undefined
  };
  
  const headers: Record<string,string> = { Authorization: `Bearer ${OPENAI_API_KEY}` };
  const urlWithVersion = /api-version=/.test(url) ? url : `${url}?api-version=2023-05-15`;
  
  try {
    const res = await httpPostJson(urlWithVersion, payload, headers);
    if (res.status < 200 || res.status >= 300) {
      return '[summary failed - API error]';
    }
    const json = JSON.parse(res.body);
    return json?.choices?.[0]?.message?.content || '[empty summary]';
  } catch (e) {
    return '[summary failed - exception]';
  }
}

async function llmDefaultAnswer(text: string, chatId?: number): Promise<string> {
  // Load conversation history if chatId provided
  let messages: ChatMsg[] = [];
  if (chatId) {
    messages = HISTORY.load(chatId);
    if (messages.length === 0) {
      // First message - add system prompt
      messages.push({ role: 'system', content: SYSTEM_BASE });
    }
  } else {
    messages = [
      { role: 'system', content: SYSTEM_BASE },
    ];
  }
  
  // Add current user message
  messages.push({ role: 'user', content: text });
  
  let answer: string;
  if (!ENABLE_TOOLS) {
    answer = await llmChat(messages, 0.7);
  } else {
    answer = await llmToolLoop(messages);
  }
  
  // Save to history
  if (chatId) {
    HISTORY.addUserMessage(chatId, text);
    HISTORY.addAssistantMessage(chatId, answer);
  }
  
  return answer;
}

async function llmToolLoop(messages: ChatMsg[], maxSteps = 12): Promise<string> {
  let toolsFailed = false;
  const toolHistory: string[] = []; // Track tool calls to avoid repeats
  
  for (let step = 0; step < maxSteps; step++) {
    // s03: Check if reminder needed (after 3 rounds without TodoWrite)
    const shouldRemind = TODO.recordRound();
    const reminderMsg = shouldRemind ? '<reminder>You have open todos. Consider using TodoWrite to update your task list.</reminder>' : null;
    
    // s06: Layer 1 - Microcompact (clear old tool_results)
    CTX.microcompact(messages);
    
    // s06: Layer 2 - Auto-compact if threshold exceeded
    await CTX.autoCompact(messages, async (text: string) => {
      const summaryMsgs: ChatMsg[] = [
        { role: 'system', content: 'You are a summarization assistant. Create a concise summary of the conversation, preserving key information, decisions, and context.' },
        { role: 'user', content: text }
      ];
      return await llmChatSummary(summaryMsgs);
    });
    
    // s08: Check background task notifications
    const bgNotifs = BG.drain();
    if (bgNotifs.length > 0) {
      const notifText = bgNotifs
        .map(n => `[background:${n.taskId}] ${n.status}: ${n.result}`)
        .join('\n');
      messages.push(
        { role: 'user', content: `<background-notifications>\n${notifText}\n</background-notifications>` },
        { role: 'assistant', content: 'Noted background task notifications.' }
      );
    }
    
    // s09: Check team inbox
    const inbox = BUS.readInbox('lead');
    if (inbox.length > 0) {
      messages.push(
        { role: 'user', content: `<inbox>\n${JSON.stringify(inbox, null, 2)}\n</inbox>` },
        { role: 'assistant', content: 'Noted inbox messages.' }
      );
    }
    
    const reply = await rawChat(messages, toolsFailed);
    // Parse tool calls (OpenAI style)
    const toolCalls = (reply as any)?.choices?.[0]?.message?.tool_calls;
    const finalText = (reply as any)?.choices?.[0]?.message?.content;
    const reasoning = (reply as any)?.choices?.[0]?.message?.reasoning;
    
    // Log reasoning if available (new models)
    if (reasoning && step === 0) {
      logger.info('llm.reasoning', { reasoning: String(reasoning).slice(0, 200) });
    }
    
    if (toolCalls && toolCalls.length) {
      // First push the assistant message with tool_calls
      const assistantMsg = (reply as any)?.choices?.[0]?.message;
      messages.push({ role: 'assistant', content: assistantMsg.content, tool_calls: assistantMsg.tool_calls });
      
      // Execute tools (potentially in parallel)
      for (const tc of toolCalls) {
        const name = tc.function?.name;
        let args: any = {};
        try { args = JSON.parse(tc.function?.arguments || '{}'); } catch {}
        
        const toolKey = `${name}:${JSON.stringify(args)}`;
        
        // Check for repeated tool calls
        if (toolHistory.includes(toolKey)) {
          logger.warn('tool.repeat', { name, args });
          messages.push({ 
            role: 'tool', 
            tool_call_id: tc.id, 
            name, 
            content: `[Skipped: Already tried this exact call]` 
          });
          continue;
        }
        
        toolHistory.push(toolKey);
        logger.info('tool.call', { name, args, step });
        
        let result: any;
        let retryCount = 0;
        const maxRetries = 2;
        
        // Tool retry loop
        while (retryCount < maxRetries) {
          try {
            result = await dispatchTool(name, args);
            break;
          } catch (e: any) {
            retryCount++;
            if (retryCount >= maxRetries) {
              result = { error: `Tool failed after ${maxRetries} attempts: ${e.message}` };
            } else {
              logger.warn('tool.retry', { name, attempt: retryCount, error: e.message });
              await new Promise(r => setTimeout(r, 500)); // Brief delay before retry
            }
          }
        }
        
        // Check for tool errors and provide helpful feedback
        if (result?.error) {
          const errorMsg = String(result.error);
          // Add hint for common errors
          if (errorMsg.includes('not found') || errorMsg.includes('ENOENT')) {
            result.error += ' Hint: Check if the path exists or use list_files first.';
          } else if (errorMsg.includes('permission')) {
            result.error += ' Hint: Check file permissions.';
          } else if (errorMsg.includes('timeout')) {
            result.error += ' Hint: Try a simpler command or increase timeout.';
          }
        }
        
        messages.push({ 
          role: 'tool', 
          tool_call_id: tc.id, 
          name, 
          content: JSON.stringify(result).slice(0, 3000) 
        });
      }
      
      // After tool execution, inject reminder if needed
      if (shouldRemind) {
        messages.push({ role: 'user', content: reminderMsg });
      }
      
      // Check if we've hit tool limit - provide summary
      if (step >= maxSteps - 2) {
        messages.push({ 
          role: 'user', 
          content: `<note>You have used ${step + 1} of ${maxSteps} tool steps. Please provide your final answer now.</note>` 
        });
      }
      
      continue; // ask model again with tool results
    }
    
    // No tool calls - check for stop conditions
    if (finalText && finalText.trim()) {
      // Check for completion signals
      const lowerText = finalText.toLowerCase();
      const completionSignals = ['done', 'completed', 'finished', 'success', '✅', 'result:', 'answer:'];
      const hasCompletion = completionSignals.some(sig => lowerText.includes(sig));
      
      // If short response with completion signal, return immediately
      if (hasCompletion && finalText.length < 500) {
        return finalText;
      }
      
      return finalText;
    }
    
    // Fallback: if neither tool calls nor text, return empty response
    break;
  }
  
  // Check for partial results in messages
  const lastToolResult = messages.filter(m => m.role === 'tool').pop();
  if (lastToolResult) {
    return `Completed ${toolHistory.length} tool calls. Last result: ${String(lastToolResult.content).slice(0, 500)}`;
  }
  
  return 'No result after max steps.';
}

async function rawChat(messages: ChatMsg[], forceNoTools = false): Promise<any> {
  if (!OPENAI_API_KEY) return { error: 'No API key' };
  const url = `${OPENAI_BASE_URL}/chat/completions`;
  // Base tools
  const baseTools = [
    { type: 'function', function: { name: 'read_file', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } },
    { type: 'function', function: { name: 'write_file', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path','content'] } } },
    { type: 'function', function: { name: 'list_files', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } },
    { type: 'function', function: { name: 'run_command', parameters: { type: 'object', properties: { cmd: { type: 'string' } }, required: ['cmd'] } } },
    { type: 'function', function: { name: 'web_search', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
    { type: 'function', function: { name: 'tavily_search', parameters: { type: 'object', properties: { query: { type: 'string' }, maxResults: { type: 'number' } }, required: ['query'] } } },
    { type: 'function', function: { name: 'deep_research', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
    { type: 'function', function: { name: 'extract_url', parameters: { type: 'object', properties: { url: { type: 'string' }, maxChars: { type: 'number' } }, required: ['url'] } } },
    { type: 'function', function: { name: 'git_status', parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'TodoWrite', parameters: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { content: { type: 'string' }, status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] }, activeForm: { type: 'string' } }, required: ['content', 'status', 'activeForm'] } } }, required: ['items'] } } },
    { type: 'function', function: { name: 'task_create', parameters: { type: 'object', properties: { subject: { type: 'string' }, description: { type: 'string' } }, required: ['subject'] } } },
    { type: 'function', function: { name: 'task_get', parameters: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] } } },
    { type: 'function', function: { name: 'task_update', parameters: { type: 'object', properties: { id: { type: 'number' }, status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'deleted'] }, addBlockedBy: { type: 'array', items: { type: 'number' } }, addBlocks: { type: 'array', items: { type: 'number' } } }, required: ['id'] } } },
    { type: 'function', function: { name: 'task_list', parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'schedule_add', parameters: { type: 'object', properties: { name: { type: 'string' }, schedule: { type: 'string' }, action: { type: 'string' } }, required: ['name', 'schedule', 'action'] } } },
    { type: 'function', function: { name: 'schedule_list', parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'schedule_remove', parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } } },
    { type: 'function', function: { name: 'memory_add', parameters: { type: 'object', properties: { content: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } }, required: ['content'] } } },
    { type: 'function', function: { name: 'memory_search', parameters: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' } } } } },
    { type: 'function', function: { name: 'memory_recent', parameters: { type: 'object', properties: { days: { type: 'number' }, limit: { type: 'number' } } } } },
    { type: 'function', function: { name: 'memory_tags', parameters: { type: 'object', properties: {} } } },
    // Skills tools
    { type: 'function', function: { name: 'skills_list', parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'skill_show', parameters: { type: 'object', properties: { name: { type: 'string' } } } } },
    { type: 'function', function: { name: 'skill_apply', parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } } },
    { type: 'function', function: { name: 'background_run', parameters: { type: 'object', properties: { command: { type: 'string' }, timeout: { type: 'number' } }, required: ['command'] } } },
    { type: 'function', function: { name: 'background_check', parameters: { type: 'object', properties: { taskId: { type: 'string' } } } } },
    // Team tools
    { type: 'function', function: { name: 'spawn_teammate', parameters: { type: 'object', properties: { name: { type: 'string' }, role: { type: 'string' }, prompt: { type: 'string' } }, required: ['name', 'role', 'prompt'] } } },
    { type: 'function', function: { name: 'list_teammates', parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'send_message', parameters: { type: 'object', properties: { to: { type: 'string' }, content: { type: 'string' }, msgType: { type: 'string', enum: ['message', 'broadcast', 'shutdown_request', 'shutdown_response', 'plan_approval_response'] } }, required: ['to', 'content'] } } },
    { type: 'function', function: { name: 'broadcast', parameters: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'] } } },
    { type: 'function', function: { name: 'read_inbox', parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'shutdown_request', parameters: { type: 'object', properties: { teammate: { type: 'string' } }, required: ['teammate'] } } },
    { type: 'function', function: { name: 'plan_approval', parameters: { type: 'object', properties: { requestId: { type: 'string' }, approve: { type: 'boolean' }, feedback: { type: 'string' } }, required: ['requestId', 'approve'] } } },
    { type: 'function', function: { name: 'idle', parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'claim_task', parameters: { type: 'object', properties: { taskId: { type: 'number' } }, required: ['taskId'] } } },
  ];
  // Add MCP tools if connected
  let mcpTools: any[] = [];
  if (ENABLE_MCP && mcpHandles.length && !forceNoTools) {
    for (const h of mcpHandles) {
      for (const [fq, t] of Object.entries(h.tools)) {
        const toolDef = t as any;
        mcpTools.push({ type: 'function', function: { name: fq, description: toolDef.description || `MCP tool: ${fq}`, parameters: toolDef.inputSchema || { type: 'object', properties: {} } } });
      }
    }
  }
  const tools = (ENABLE_TOOLS && !forceNoTools) ? [...baseTools, ...mcpTools] : undefined;
  const payload: any = { messages, temperature: 0.7, stream: false, max_tokens: 800 };
  if (tools) { payload.tools = tools; payload.tool_choice = 'auto'; }
  const headers: Record<string,string> = { Authorization: `Bearer ${OPENAI_API_KEY}` };
  const urlWithVersion = /api-version=/.test(url) ? url : `${url}?api-version=2023-05-15`;
  logger.debug('llm.raw.request', { messages: messages.length, tools: !!tools, forceNoTools });
  const res = await httpPostJson(urlWithVersion, payload, headers);
  // If 400 error and we tried with tools, retry without tools
  if (res.status === 400 && tools && !forceNoTools) {
    logger.warn('llm.raw.400_with_tools', { msg: 'Retrying without tools', payload: JSON.stringify(payload).slice(0, 500) });
    return rawChat(messages, true);
  }
  if (res.status < 200 || res.status >= 300) {
    logger.error('llm.raw.http_error', { status: res.status, body: res.body.slice(0, 300), payload: JSON.stringify(payload).slice(0, 500) });
    return { error: res.body, status: res.status };
  }
  try { return JSON.parse(res.body); } catch { return { error: 'parse error', body: res.body }; }
}

function startTyping(bot: TelegramBot, chatId: number) {
  const iv = setInterval(() => { bot.sendChatAction(chatId, 'typing').catch(() => {}); }, 4000);
  return () => clearInterval(iv);
}

// ----- Command Handlers -----
async function handleRun(cmdline: string): Promise<string> {
  const sane = sanitizeCommand(cmdline);
  if (!sane.ok) return `Denied: ${sane.reason}`;
  const result = await execCommand([sane.cmd, ...sane.args].join(' '));
  const out = result.stdout.trim();
  const err = result.stderr.trim();
  const head = `code=${result.code}`;
  return [head, out ? `stdout:\n${out}` : '', err ? `stderr:\n${err}` : ''].filter(Boolean).join('\n\n').slice(0, 3500);
}

function isDangerous(cmd: string) {
  const banned = [
    /\brm\s+-rf\s+\//,  // rm -rf /
    /\bsudo\s+/,        // sudo
    /\bshutdown\b/,     // shutdown
    /\breboot\b/,       // reboot
    /\bmkfs\b/,         // mkfs
    /:\(\){:/,          // fork bomb
    /\bdd\s+if=\/dev\/zero/, // dd wipe
  ];
  return banned.some((re) => re.test(cmd));
}

async function handleBash(cmd: string): Promise<string> {
  const code = cmd.trim();
  if (!code) return 'Usage: /bash <one-line bash command>';
  if (isDangerous(code)) return 'Denied: command contains dangerous operations';
  const result = await execCommand(`bash -lc ${JSON.stringify(code)}`, 15000);
  const out = result.stdout.trim();
  const err = result.stderr.trim();
  return [`code=${result.code}`, out ? `stdout:\n${out}` : '', err ? `stderr:\n${err}` : ''].filter(Boolean).join('\n\n').slice(0, 3500);
}

async function handleScript(content: string): Promise<string> {
  const body = content.trim();
  if (!body) return 'Usage: /script\n<bash script lines>';
  if (isDangerous(body)) return 'Denied: script contains dangerous operations';
  const scratch = path.join(WORKSPACE_ROOT, '.scratch');
  try { if (!fs.existsSync(scratch)) fs.mkdirSync(scratch, { recursive: true }); } catch {}
  const name = `script-${Date.now()}.sh`;
  const full = path.join(scratch, name);
  fs.writeFileSync(full, `#!/usr/bin/env bash\nset -euo pipefail\n${body}\n`, { mode: 0o700 });
  const result = await execCommand(`bash -lc ${JSON.stringify(full)}`, 20000);
  const out = result.stdout.trim();
  const err = result.stderr.trim();
  return [`ran: ${name}`, `code=${result.code}`, out ? `stdout:\n${out}` : '', err ? `stderr:\n${err}` : ''].filter(Boolean).join('\n\n').slice(0, 3500);
}

async function handleRead(rawPath: string): Promise<string> {
  const safe = withinWorkspace(rawPath);
  if (!safe) return 'Denied: path escapes workspace';
  if (!fs.existsSync(safe)) return 'Not found';
  const stat = fs.statSync(safe);
  if (stat.isDirectory()) {
    const files = fs.readdirSync(safe).slice(0, 200);
    return `Directory: ${rawPath}\n- ${files.join('\n- ')}`.slice(0, 3800);
  }
  const buf = fs.readFileSync(safe);
  const chk = isSafeContent(buf);
  if (!chk.ok) return `Denied: ${chk.reason}`;
  const text = buf.toString('utf8');
  const preview = text.slice(0, 3500);
  const more = text.length > preview.length ? `\n…(${text.length - preview.length} more chars)` : '';
  return `File: ${rawPath} (${buf.length} bytes)\n\n${preview}${more}`;
}

async function handleWrite(rawPath: string, content: string): Promise<string> {
  const safe = withinWorkspace(rawPath);
  if (!safe) return 'Denied: path escapes workspace';
  const buf = Buffer.from(content, 'utf8');
  const chk = isSafeContent(buf);
  if (!chk.ok) return `Denied: ${chk.reason}`;
  const dir = path.dirname(safe);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(safe, buf);
  return `Wrote ${buf.length} bytes to ${rawPath}`;
}

async function dispatchTool(name?: string, args: any = {}): Promise<any> {
  try {
    // MCP tool call: format "server:tool"
    if (name && name.includes(':') && mcpHandles.length) {
      const [server, tool] = name.split(':');
      const handle = mcpHandles.find(h => h.client?.name?.includes(server));
      if (handle) {
        const result = await callMCP(handle, name, args);
        return result;
      }
      return { error: `MCP server not found: ${server}` };
    }
    switch (name) {
      case 'read_file': return await handleRead(String(args.path || ''));
      case 'write_file': return await handleWrite(String(args.path || ''), String(args.content || ''));
      case 'list_files': return await handleRun(`ls -1 ${args.path ? String(args.path) : '.'}`);
      case 'run_command': return await handleRun(String(args.cmd || ''));
      case 'web_search': return await handleSearch(String(args.query || ''));
      case 'tavily_search': 
        try {
          return await tavilySearch(String(args.query || ''), args.maxResults ? Number(args.maxResults) : 5);
        } catch (e: any) {
          return { error: String(e) };
        }
      case 'deep_research':
        try {
          return await deepResearch(String(args.query || ''));
        } catch (e: any) {
          return { error: String(e) };
        }
      case 'extract_url':
        try {
          return await extractUrl(String(args.url || ''), args.maxChars ? Number(args.maxChars) : 15000);
        } catch (e: any) {
          return { error: String(e) };
        }
      case 'git_status': return await handleGit();
      case 'TodoWrite': 
        try {
          TODO.markTodoUsed();
          return TODO.update(args.items || []);
        } catch (e: any) {
          return { error: String(e) };
        }
      // Task Manager tools
      case 'task_create':
        return TASK_MGR.create(String(args.subject || ''), String(args.description || ''));
      case 'task_get':
        return TASK_MGR.get(Number(args.id));
      case 'task_update':
        return TASK_MGR.update(
          Number(args.id),
          args.status as string | undefined,
          args.addBlockedBy as number[] | undefined,
          args.addBlocks as number[] | undefined
        );
      case 'task_list':
        return TASK_MGR.list();
      // Scheduler tools
      case 'schedule_add':
        return SCHEDULER.add(
          String(args.name), 
          String(args.schedule), 
          String(args.action)
        );
      case 'schedule_list':
        return SCHEDULER.list();
      case 'schedule_remove':
        return SCHEDULER.remove(String(args.id));
      // Memory tools
      case 'memory_add':
        return MEMORY.add(
          String(args.content), 
          args.tags ? args.tags as string[] : []
        );
      case 'memory_search':
        return MEMORY.search(
          String(args.query), 
          args.limit ? Number(args.limit) : 5
        );
      case 'memory_recent':
        return MEMORY.recent(
          args.days ? Number(args.days) : 7,
          args.limit ? Number(args.limit) : 10
        );
      case 'memory_tags':
        return MEMORY.tags();
      // Skills tools
      case 'skills_list':
        return SKILLS.list();
      case 'skill_show':
        return SKILLS.getContent(String(args.name || ''));
      case 'skill_apply':
        // For now, just show the skill content - execution would require parsing phases
        return `To apply skill "${args.name}", I need to execute its phases. Here's the skill:\n\n${SKILLS.getContent(String(args.name || ''))}`;
      // Background Task tools  
      case 'background_run':
        return BG.run(String(args.command), args.timeout ? Number(args.timeout) * 1000 : undefined);
      case 'background_check':
        return BG.check(args.taskId ? String(args.taskId) : undefined);
      // Team tools
      case 'spawn_teammate':
        return TEAM.upsertMember(String(args.name), String(args.role), 'working').name 
          ? `Spawned teammate '${args.name}' (role: ${args.role})`
          : `Failed to spawn teammate '${args.name}'`;
      case 'list_teammates':
        return TEAM.list();
      case 'send_message':
        return BUS.send('lead', String(args.to), String(args.content), 
          (args.msgType as any) || 'message');
      case 'broadcast':
        return BUS.broadcast('lead', String(args.content), TEAM.getMemberNames());
      case 'read_inbox':
        return JSON.stringify(BUS.readInbox('lead'), null, 2);
      case 'shutdown_request': {
        const teammate = String(args.teammate);
        const reqId = Math.random().toString(36).slice(2, 10);
        shutdownRequests.set(reqId, { target: teammate, status: 'pending' });
        BUS.send('lead', teammate, 'Please shut down.', 'shutdown_request', { requestId: reqId });
        return `Shutdown request ${reqId} sent to '${teammate}'`;
      }
      case 'plan_approval': {
        const reqId = String(args.requestId);
        const req = planRequests.get(reqId);
        if (!req) return `Error: Unknown plan request '${reqId}'`;
        req.status = args.approve ? 'approved' : 'rejected';
        BUS.send('lead', req.from, String(args.feedback || ''), 'plan_approval_response', {
          requestId: reqId,
          approve: args.approve,
          feedback: String(args.feedback || '')
        });
        return `Plan ${req.status} for '${req.from}'`;
      }
      case 'idle':
        return 'Lead does not idle.';
      case 'claim_task':
        return TASK_MGR.claim(Number(args.taskId), 'lead');
      case 'mcp_call': return { error: 'Use format server:tool to call MCP tools' };
      default: return { error: `Unknown tool: ${name}` };
    }
  } catch (e: any) {
    return { error: String(e) };
  }
}

async function handleGit(): Promise<string> {
  const status = await execCommand('git -C ' + JSON.stringify(WORKSPACE_ROOT) + ' status --porcelain=v1 -b');
  const diff = await execCommand('git -C ' + JSON.stringify(WORKSPACE_ROOT) + ' --no-pager diff --stat');
  return ['git status:', status.stdout || status.stderr, '', 'git diff --stat:', diff.stdout || diff.stderr]
    .join('\n').slice(0, 3500);
}

async function handleSearch(query: string): Promise<string> {
  const q = query.trim();
  if (!q) return 'Usage: /search <query or URL>';
  if (/^https?:\/\//i.test(q)) {
    const res = await httpGet(q);
    if (res.status < 200 || res.status >= 300) return `Fetch failed: HTTP ${res.status}`;
    const title = res.body.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || 'No <title>';
    const text = res.body.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ');
    const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 600);
    return `Title: ${title}\nURL: ${q}\n\n${snippet}`;
  } else {
    const url = 'https://duckduckgo.com/html/?q=' + encodeURIComponent(q);
    const res = await httpGet(url);
    if (res.status < 200 || res.status >= 300) return `Search failed: HTTP ${res.status}`;
    const results: { title: string; href: string }[] = [];
    const re = /<a[^>]+class=\"result__a\"[^>]+href=\"([^\"]+)\"[^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(res.body)) && results.length < 3) {
      const href = m[1].replace(/&amp;/g, '&');
      const title = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      results.push({ title, href });
    }
    if (!results.length) return 'No results found (DuckDuckGo HTML parsing)';
    return results.map((r, i) => `${i + 1}. ${r.title}\n${r.href}`).join('\n\n');
  }
}

async function handleAsk(prompt: string): Promise<string> {
  if (!prompt.trim()) return 'Usage: /ask <your question>'; 
  return await llmDefaultAnswer(prompt);
}

async function handleCode(task: string): Promise<string> {
  if (!task.trim()) return 'Usage: /code <task>'; 
  const messages = [
    { role: 'system' as const, content: SYSTEM_CODE },
    { role: 'user' as const, content: task }
  ];
  return await llmChat(messages, 0.6);
}

function startBot() {
  const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
  logger.info('Telegram bot polling started');
  
  // Set bot commands menu
  bot.setMyCommands([
    { command: 'start', description: 'Start YodaClaw' },
    { command: 'help', description: 'Show help' },
    { command: 'menu', description: 'Show quick actions' },
    { command: 'ping', description: 'Check bot is alive' },
    { command: 'chatid', description: 'Get chat ID' },
    { command: 'status', description: 'Bot status' },
    { command: 'clear', description: 'Clear conversation history' },
    { command: 'oclaws', description: 'OpenClaw status' },
    { command: 'restart', description: 'Restart OpenClaw' },
  ]).catch((e) => logger.error('setMyCommands failed', { e: String(e) }));
  
  bot.getMe()
    .then((me) => logger.info('getMe', me))
    .catch((e) => logger.error('getMe failed', { e: String(e) }));

  if (STARTUP_NOTIFY_CHAT_ID && Number.isFinite(STARTUP_NOTIFY_CHAT_ID)) {
    const now = new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai', hour12: false });
    bot.sendMessage(STARTUP_NOTIFY_CHAT_ID, `🤖 YodaClaw is online at ${now}`)
      .then(() => logger.info('startup notify sent', { chatId: STARTUP_NOTIFY_CHAT_ID }))
      .catch((e) => logger.error('startup notify failed', { e: String(e) }));
  }
  
  // Set up scheduler callback to notify via Telegram
  schedulerCallback = async (task: any, result: string) => {
    if (STARTUP_NOTIFY_CHAT_ID) {
      const msg = `📅 **Scheduled: ${task.name}**\n\n${result.slice(0, 1500)}`;
      try {
        await bot.sendMessage(STARTUP_NOTIFY_CHAT_ID, msg, { parse_mode: 'Markdown' });
      } catch (e) {
        logger.error('scheduler notify failed', { e: String(e) });
      }
    }
  };
  
  // Check for due scheduled tasks every minute
  setInterval(() => {
    // Tasks are handled by the scheduler's interval - this just logs
    logger.debug('scheduler heartbeat');
  }, 60000);

  bot.on('polling_error', (err: any) => logger.error('polling_error', { code: err?.code, message: String(err) }));

  // Handle callback queries (button clicks)
  bot.on('callback_query', async (query) => {
    const chatId = query.message?.chat.id;
    const msgId = query.message?.message_id;
    const data = query.data || '';
    
    if (!chatId) return;
    
    try {
      await bot.answerCallbackQuery(query.id);
      
      const stop = startTyping(bot, chatId);
      let answer = '';
      
      switch (data) {
        case 'action_search':
          answer = '🔍 Send me your search query...';
          break;
        case 'action_read':
          answer = '📝 Send me the file path to read...';
          break;
        case 'action_run':
          answer = '💻 Send me the command to run...';
          break;
        case 'action_git':
          answer = await handleGit();
          break;
        case 'action_weather':
          answer = await tavilySearch('Shanghai weather today', 3);
          break;
        case 'action_news':
          answer = await tavilySearch('latest technology AI news', 5);
          break;
        case 'action_clear':
          HISTORY.clear(chatId);
          answer = '🗑️ Conversation history cleared!';
          break;
        // OpenClaw actions
        case 'action_status':
          answer = '📊 Checking OpenClaw status...';
          if (msgId) await bot.sendMessage(chatId, answer, { reply_to_message_id: msgId });
          execCommand('/home/pjq/.nvm/versions/node/v24.13.0/bin/openclaw gateway status', 30000).then((result) => {
            stop();
            const output = result.stdout || result.stderr || 'Failed';
            bot.sendMessage(chatId, `📊 OpenClaw Status:\n\`\`\`\n${output.slice(0, 3000)}\n\`\`\``, { reply_to_message_id: msgId }).catch(() => {});
          }).catch(() => {
            stop();
            bot.sendMessage(chatId, '❌ Failed to get OpenClaw status', { reply_to_message_id: msgId }).catch(() => {});
          });
          answer = '';
          break;
        case 'action_restart':
          answer = '🔄 Restarting OpenClaw...';
          if (msgId) await bot.sendMessage(chatId, answer, { reply_to_message_id: msgId });
          execCommand('/home/pjq/.nvm/versions/node/v24.13.0/bin/openclaw gateway restart', 30000).then((result) => {
            stop();
            const output = result.stdout || result.stderr || 'Restarted';
            bot.sendMessage(chatId, `🔄 ${output.slice(0, 3000)}`, { reply_to_message_id: msgId }).catch(() => {});
          }).catch(() => {
            stop();
            bot.sendMessage(chatId, '❌ Failed to restart OpenClaw', { reply_to_message_id: msgId }).catch(() => {});
          });
          answer = '';
          break;
        case 'action_logs':
          answer = '📜 Getting recent logs...';
          if (msgId) await bot.sendMessage(chatId, answer, { reply_to_message_id: msgId });
          execCommand('/home/pjq/.nvm/versions/node/v24.13.0/bin/openclaw logs --lines 30', 30000).then((result) => {
            stop();
            const output = result.stdout || result.stderr || 'No logs';
            bot.sendMessage(chatId, `📜 Logs:\n\`\`\`\n${output.slice(-3000)}\n\`\`\``, { reply_to_message_id: msgId }).catch(() => {});
          }).catch(() => {
            stop();
            bot.sendMessage(chatId, '❌ Failed to get logs', { reply_to_message_id: msgId }).catch(() => {});
          });
          answer = '';
          break;
        case 'action_version':
          answer = '📌 Getting version info...';
          if (msgId) await bot.sendMessage(chatId, answer, { reply_to_message_id: msgId });
          execCommand('/home/pjq/.nvm/versions/node/v24.13.0/bin/openclaw version', 30000).then((result) => {
            stop();
            const output = result.stdout || result.stderr || 'Unknown';
            bot.sendMessage(chatId, `📌 Version:\n\`\`\`\n${output.slice(0, 3000)}\n\`\`\``, { reply_to_message_id: msgId }).catch(() => {});
          }).catch(() => {
            stop();
            bot.sendMessage(chatId, '❌ Failed to get version', { reply_to_message_id: msgId }).catch(() => {});
          });
          answer = '';
          break;
        default:
          answer = 'Unknown action';
      }
      
      stop();
      
      if (answer && msgId) {
        await bot.sendMessage(chatId, answer, { reply_to_message_id: msgId });
      } else if (answer) {
        await bot.sendMessage(chatId, answer);
      }
    } catch (e: any) {
      logger.error('callback_query failed', { e: String(e) });
    }
  });

  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text || '';
    const hasPhoto = !!msg.photo && msg.photo.length > 0;
    logger.info('inbound', { chatId, messageId: msg.message_id, textLen: text.length, hasPhoto, isCommand: text.startsWith('/') });

    // Handle image messages
    if (hasPhoto && !text) {
      try {
        const stop = startTyping(bot, chatId);
        // Get the largest photo (best quality)
        const photo = msg.photo[msg.photo.length - 1];
        const file = await bot.getFile(photo.file_id);
        
        // Download the file
        const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${file.file_path}`;
        const imageData = await downloadImage(fileUrl);
        
        if (!imageData) {
          stop();
          await safeReply(bot, chatId, 'Failed to download image', msg.message_id);
          return;
        }
        
        // Send to LLM with image
        const visionMsg = {
          role: 'user' as const,
          content: [
            { type: 'text', text: 'What do you see in this image? Please describe it in detail.' },
            { type: 'image_url', image_url: { url: `data:${file.mime_type || 'image/jpeg'};base64,${imageData}` } }
          ]
        };
        
        const messages: ChatMsg[] = [
          { role: 'system', content: SYSTEM_IMAGE },
          visionMsg
        ];
        
        const answer = await llmChat(messages, 0.7);
        stop();
        
        // Save to history
        HISTORY.addUserMessage(chatId, '[Image]');
        HISTORY.addAssistantMessage(chatId, answer);
        
        await safeReply(bot, chatId, answer, msg.message_id);
      } catch (e: any) {
        logger.error('image_processing_failed', { e: String(e) });
        await safeReply(bot, chatId, `Error processing image: ${e.message}`, msg.message_id);
      }
      return;
    }

    try {
      // Slash commands (do NOT send to LLM)
      if (text.startsWith('/ping'))   { await safeReply(bot, chatId, 'pong', msg.message_id); return; }
      if (text.startsWith('/status')) { await safeReply(bot, chatId, '✅ OpenClaw (YodaClaw) is running!', msg.message_id); return; }
      if (text.startsWith('/oclaws') || text.startsWith('/restart')) {
        const isRestart = text.startsWith('/restart');
        const stop = startTyping(bot, chatId);
        const cmd = isRestart ? '/home/pjq/.nvm/versions/node/v24.13.0/bin/openclaw gateway restart' : '/home/pjq/.nvm/versions/node/v24.13.0/bin/openclaw gateway status';
        execCommand(cmd, 30000).then((result) => {
          stop();
          const output = result.stdout || result.stderr;
          safeReply(bot, chatId, `🤖 OpenClaw ${isRestart ? 'restart' : 'status'}:\n\`\`\`\n${output.slice(0, 3000)}\n\`\`\``, msg.message_id);
        }).catch((err) => {
          stop();
          safeReply(bot, chatId, `❌ Error: ${err.message}`, msg.message_id);
        });
        return;
      }
      if (text.startsWith('/chatid')) { await safeReply(bot, chatId, `chat id: ${chatId}`, msg.message_id); return; }
      if (text.startsWith('/debug ')) {
        const mode = text.split(/\s+/)[1];
        if (mode === 'on') { (logger as any).setLevel('debug'); await safeReply(bot, chatId, 'debug=on', msg.message_id); }
        else if (mode === 'off') { (logger as any).setLevel('info'); await safeReply(bot, chatId, 'debug=off', msg.message_id); }
        else { await safeReply(bot, chatId, 'Usage: /debug on|off', msg.message_id); }
        return;
      }
      if (text.startsWith('/help')) {
        await safeReply(bot, chatId,
`Commands:\n/ping\n/status\n/chatid\n/debug on|off\n/ask <question>\n/code <task>\n/run <cmd>\n/bash <one-line bash>\n/script <multiline bash>\n/read <path>\n/write <path>\n<content on next line>\n/git\n/search <query or URL>`,
          msg.message_id);
        return;
      }
      
      // Quick actions menu
      if (text.startsWith('/menu') || text.startsWith('/clear')) {
        const clearHistory = text.startsWith('/clear');
        
        const keyboard = {
          inline_keyboard: [
            [{ text: '🔍 Web Search', callback_data: 'action_search' }, { text: '📝 Read File', callback_data: 'action_read' }],
            [{ text: '💻 Run Command', callback_data: 'action_run' }, { text: '📊 Git Status', callback_data: 'action_git' }],
            [{ text: '🌤️ Weather', callback_data: 'action_weather' }, { text: '📰 Tech News', callback_data: 'action_news' }],
            [{ text: '🗑️ Clear History', callback_data: 'action_clear' }],
            [{ text: '🤖 OpenClaw Status', callback_data: 'action_status' }, { text: '🔄 Restart', callback_data: 'action_restart' }],
            [{ text: '📜 Logs', callback_data: 'action_logs' }, { text: '📌 Version', callback_data: 'action_version' }],
          ]
        };
        
        if (clearHistory) {
          HISTORY.clear(chatId);
          await safeReply(bot, chatId, '✅ Conversation history cleared!', msg.message_id);
          return;
        }
        
        await bot.sendMessage(chatId, '⚡ OpenClaw Quick Actions:', {
          reply_markup: keyboard,
          reply_to_message_id: msg.message_id
        });
        return;
      }
      
      if (text.startsWith('/run ')) {
        const cmdline = text.slice('/run '.length);
        const out = await handleRun(cmdline);
        await safeReply(bot, chatId, out, msg.message_id);
        return;
      }
      if (text.startsWith('/bash ')) {
        const cmdline = text.slice('/bash '.length);
        const out = await handleBash(cmdline);
        await safeReply(bot, chatId, out, msg.message_id);
        return;
      }
      if (text.startsWith('/script')) {
        const firstNl = text.indexOf('\n');
        const payload = firstNl === -1 ? '' : text.slice(firstNl + 1);
        const out = await handleScript(payload);
        await safeReply(bot, chatId, out, msg.message_id);
        return;
      }
      if (text.startsWith('/read ')) {
        const p = text.slice('/read '.length).trim();
        const out = await handleRead(p);
        await safeReply(bot, chatId, out, msg.message_id);
        return;
      }
      if (text.startsWith('/write')) {
        const firstSpace = text.indexOf(' ');
        if (firstSpace === -1) { await safeReply(bot, chatId, 'Usage: /write <path>\n<content>', msg.message_id); return; }
        const rest = text.slice(firstSpace + 1);
        const lineBreak = rest.indexOf('\n');
        if (lineBreak === -1) { await safeReply(bot, chatId, 'Provide content on next line', msg.message_id); return; }
        const p = rest.slice(0, lineBreak).trim();
        const c = rest.slice(lineBreak + 1);
        const out = await handleWrite(p, c);
        await safeReply(bot, chatId, out, msg.message_id);
        return;
      }
      if (text.startsWith('/git')) {
        const out = await handleGit();
        await safeReply(bot, chatId, out, msg.message_id);
        return;
      }
      if (text.startsWith('/search')) {
        const q = text.replace(/^\/search\s*/, '');
        const out = await handleSearch(q);
        await safeReply(bot, chatId, out, msg.message_id);
        return;
      }
      if (text.startsWith('/ask ')) {
        const q = text.slice('/ask '.length);
        const stop = startTyping(bot, chatId);
        const out = await handleAsk(q);
        stop();
        await safeReply(bot, chatId, out, msg.message_id);
        return;
      }
      if (text.startsWith('/code ')) {
        const q = text.slice('/code '.length);
        const stop = startTyping(bot, chatId);
        const out = await handleCode(q);
        stop();
        await safeReply(bot, chatId, out, msg.message_id);
        return;
      }

      // Default: send every non-command message to LLM
      const stop = startTyping(bot, chatId);
      const answer = await llmDefaultAnswer(text, chatId);
      stop();
      await safeReply(bot, chatId, answer, msg.message_id);
    } catch (e: any) {
      logger.error('handler failed', { e: String(e) });
      await safeReply(bot, chatId, 'Error occurred.', msg.message_id);
    }
  });

  return bot;
}

// Start bot
try { startBot(); } catch (e: any) { logger.error('bot start failed', { e: String(e) }); }

// Initialize MCP if enabled
if (ENABLE_MCP) {
  (async () => {
    try {
      const cfgPath = path.join(WORKSPACE_ROOT, 'yodaclaw.mcp.json');
      if (fs.existsSync(cfgPath)) {
        const cfg: any = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
        mcpHandles = await startMCP(cfg);
        logger.info('mcp.started', { servers: mcpHandles.length });
      } else {
        logger.warn('mcp.config_missing', { path: cfgPath });
      }
    } catch (e: any) {
      logger.error('mcp.init_failed', { e: String(e) });
    }
  })();
}

// ----- Health endpoint -----
app.get('/health', (_req, res) => { logger.debug('health'); res.json({ status: 'ok', agent: 'YodaClaw' }); });
app.listen(PORT, () => logger.info('HTTP server listening', { PORT }));
