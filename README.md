# YodaClaw

🤖 AI Agent with memory, tools, skills, and multi-agent collaboration.

Based on [learn-claude-code](https://github.com/shareAI-lab/learn-claude-code) architecture.

## Setup

```bash
npm install
cp .env.example .env
# Edit .env with your API keys
npm run dev
```

## Features

### Core Capabilities
- **Multi-round task execution** - Tool loop with retry logic (up to 12 steps)
- **Infinite memory** - Context compression with 3-layer strategy
- **Command execution** - Run any command safely
- **Tavily search** - AI-powered web search (default)
- **Deep research** - Comprehensive topic research with sources
- **Scheduled tasks** - Cron-like scheduling with notifications
- **Agent Skills** - Auto-load and trigger skills from `.claude/skills/`

### Task Management
- **TodoWrite** - Enhanced task tracking with nag reminders
- **Task Manager** - File-based tasks with dependency graph
- **Background Tasks** - Run commands in background with notifications
- **Scheduler** - Schedule tasks to run periodically or once

### Memory & Context
- **Chat history** - Persistent per-user conversation history
- **Enhanced memory** - Tagged memories with search
- **Context compression** - Auto-summarize long conversations
- **Identity files** - SOUL.md, USER.md auto-loaded

### Team Collaboration
- **Team messaging** - JSONL-based inbox system
- **Protocols** - Shutdown approval, plan approval
- **Auto-claim** - Idle agents auto-claim available tasks

## Available Tools

| Category | Tool | Description |
|----------|------|-------------|
| **Search** | `tavily_search` | AI-powered web search (default) |
| | `deep_research` | Comprehensive research with sources |
| | `extract_url` | Extract content from URL |
| **Memory** | `memory_add` | Add tagged memory |
| | `memory_search` | Search memories |
| | `memory_recent` | Get recent memories |
| | `memory_tags` | List all tags |
| **Tasks** | `TodoWrite` | Update task list |
| | `task_create` | Create persistent task |
| | `task_update` | Update task status/dependencies |
| | `task_list` | List all tasks |
| **Scheduler** | `schedule_add` | Add scheduled task |
| | `schedule_list` | List schedules |
| | `schedule_remove` | Remove schedule |
| **Skills** | `skills_list` | List available skills |
| | `skill_show` | Show skill details |
| **Files** | `read_file` | Read file |
| | `write_file` | Write file |
| | `list_files` | List directory |
| **Commands** | `run_command` | Run command |
| | `git_status` | Git status |
| **Team** | `spawn_teammate` | Spawn teammate |
| | `send_message` | Send to teammate |
| | `broadcast` | Broadcast message |
| | `read_inbox` | Read inbox |

## Agent Skills

Skills are auto-loaded from `.claude/skills/` folder. Each skill has a `SKILL.md` with instructions.

### Using Skills
1. Ask: "What skills are available?"
2. YodaClaw auto-matches your request to relevant skills
3. Skills are checked before manual execution

### Installing Skills
```bash
# Add skills to .claude/skills/
mkdir -p .claude/skills/my-skill
# Create SKILL.md with instructions
```

## Scheduled Tasks

Create tasks that run automatically:

- **Recurring**: "30m", "1h", "1d" (minutes, hours, days)
- **One-time**: "5 minutes from now", "in 1 hour"

YodaClaw will notify you via Telegram with results!

## Commands

### Telegram Commands
- `/start` - Start YodaClaw
- `/help` - Show help
- `/menu` - Quick actions menu
- `/ping` - Check bot is alive
- `/status` - Bot status
- `/clear` - Clear conversation history
- `/oclaws` - OpenClaw status
- `/restart` - Restart OpenClaw

## Configuration

See `.env.example` for required variables:

```
TELEGRAM_BOT_TOKEN=your_token
OPENAI_API_KEY=your_key
OPENAI_BASE_URL=your_openai_compatible_proxy_url
MODEL_NAME=your_model  # e.g., gpt-5, gpt-4o, claude-sonnet-4, etc.
TAVILY_API_KEY=your_tavily_key
```

## Supported Models

Any OpenAI-compatible model is supported via `OPENAI_BASE_URL`:
- GPT-5, GPT-4o, GPT-4.1
- Claude Sonnet 4.5, Claude Opus 4
- Gemini 2.5 Pro
- And any other OpenAI-compatible model

Set `MODEL_NAME` in `.env` to specify which model to use.

## Identity Files

- **SOUL.md** - YodaClaw's personality and identity
- **USER.md** - User preferences and context
- **AGENTS.md** - Workspace structure and conventions

These are auto-loaded at startup and included in system prompts.

## Memory Locations

| Type | Location |
|------|----------|
| Chat history | `memory/history/history_{chatId}.jsonl` |
| Memories | `memory/memories/memory-index.json` |
| Tasks | `memory/tasks/task_{id}.json` |
| Schedules | `memory/schedules.json` |
| Team | `memory/team/config.json` |

## Architecture

Based on learn-claude-code's progressive sessions:

- **Phase 1**: Agent loop, TodoWrite, Context compression
- **Phase 2**: Task system, Background tasks
- **Phase 3**: Team collaboration, Protocols
- **Phase 4**: Scheduler, Memory, Skills, Deep research

## Development

```bash
npm run dev      # Development mode
npm run build   # Compile
npm start       # Run compiled
npm test        # Run tests
npm run test:todo    # Todo tests
npm run test:task    # Task tests
npm run test:scheduler # Scheduler tests
npm run test:agent   # Agent loop tests
npm run test:team    # Team tests
npm run test:bg      # Background tests
```

## License

MIT
