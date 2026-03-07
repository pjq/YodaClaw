import { Client, StdioServerTransport } from '@modelcontextprotocol/sdk';
import { spawn } from 'child_process';
import { logger } from './logger';

export type MCPConfig = {
  servers: Array<{
    name: string;
    command: string; // executable name
    args?: string[];
    env?: Record<string,string>;
  }>;
};

export type MCPHandle = {
  client: any;
  tools: Record<string, any>;
  kill: () => void;
};

export async function startMCP(cfg: MCPConfig): Promise<MCPHandle[]> {
  const handles: MCPHandle[] = [];
  for (const s of cfg.servers) {
    const child = spawn(s.command, s.args || [], {
      env: { ...process.env, ...(s.env || {}) },
      stdio: 'pipe',
    });
    const transport = new StdioServerTransport(child.stdout!, child.stdin!);
    const client = new Client({ name: `yodaclaw-${s.name}`, version: '0.1.0' }, { transport });
    await client.connect();
    const tools = await client.listTools();
    const toolMap: Record<string, any> = {};
    for (const t of tools) toolMap[`${s.name}:${t.name}`] = t;
    logger.info('mcp.connected', { server: s.name, tools: Object.keys(toolMap) });
    const kill = () => { try { child.kill(); } catch {} };
    handles.push({ client, tools: toolMap, kill });
  }
  return handles;
}

export async function callMCP(handle: MCPHandle, fqTool: string, params: any): Promise<any> {
  const tool = handle.tools[fqTool];
  if (!tool) throw new Error(`MCP tool not found: ${fqTool}`);
  const req: Request = { name: tool.name, arguments: params } as any;
  const res = await handle.client.callTool(req);
  return res;
}
