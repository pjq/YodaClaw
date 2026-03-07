import fs from 'fs';
import path from 'path';

type Level = 'debug'|'info'|'warn'|'error';
const levelOrder: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

let LOG_LEVEL: Level = (process.env.LOG_LEVEL as Level) || 'debug';
const LOG_FILE = process.env.LOG_FILE === 'true' || true;
const LOG_DIR = path.resolve(process.cwd(), 'logs');
const LOG_PATH = path.join(LOG_DIR, 'yodaclaw.log');

if (LOG_FILE) {
  try { if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true }); } catch {}
}

function ts() { return new Date().toISOString(); }
function write(line: string) {
  const out = `${line}\n`;
  try { process.stdout.write(out); } catch {}
  if (LOG_FILE) { try { fs.appendFileSync(LOG_PATH, out); } catch {} }
}
function should(level: Level) { return levelOrder[level] >= levelOrder[LOG_LEVEL]; }

export const logger = {
  setLevel(level: Level) { LOG_LEVEL = level; logger.info(`log level set to ${level}`); },
  debug(msg: string, meta: any = {}) { if (!should('debug')) return; write(`[${ts()}] [DEBUG] ${msg} ${JSON.stringify(meta)}`); },
  info(msg: string, meta: any = {}) { if (!should('info')) return; write(`[${ts()}] [INFO] ${msg} ${JSON.stringify(meta)}`); },
  warn(msg: string, meta: any = {}) { if (!should('warn')) return; write(`[${ts()}] [WARN] ${msg} ${JSON.stringify(meta)}`); },
  error(msg: string, meta: any = {}) { write(`[${ts()}] [ERROR] ${msg} ${JSON.stringify(meta)}`); },
};
