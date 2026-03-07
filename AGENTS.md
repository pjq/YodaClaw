# AGENTS.md - YodaClaw Workspace

*YodaClaw's workspace structure and conventions*

## Workspace Structure

```
YodaClaw/
├── src/               # Source code
│   ├── index.ts       # Main entry point
│   ├── todo.ts        # TodoManager
│   ├── task.ts        # TaskManager
│   ├── context.ts     # ContextManager
│   ├── background.ts  # Background tasks
│   ├── team.ts        # MessageBus
│   ├── team-manager.ts # Team management
│   ├── scheduler.ts    # Task scheduler
│   ├── memory.ts      # Memory manager
│   ├── tavily.ts      # Tavily search
│   ├── research.ts    # Deep research
│   └── logger.ts      # Logging
├── test/              # Unit tests
├── memory/            # Runtime data (auto-created)
│   ├── history/       # Chat history per user (JSONL)
│   ├── memories/       # Enhanced memories (indexed)
│   ├── tasks/         # Task board (task_N.json)
│   ├── team/          # Team config + inboxes
│   ├── transcripts/   # Archived conversations
│   └── schedules.json # Scheduled tasks
├── config/           # Configuration
├── workspace/        # Default workspace for file ops
├── SOUL.md          # YodaClaw identity
├── USER.md           # User information
└── IMPROVEMENT_PLAN.md # Feature roadmap
```

## Config & Data Locations

| Type | Location | Description |
|------|----------|-------------|
| Identity | `SOUL.md` | YodaClaw's personality & capabilities |
| User Info | `USER.md` | Owner preferences & context |
| Chat History | `memory/history/history_{chatId}.jsonl` | Per-user conversation |
| Memories | `memory/memories/memory-index.json` | Tagged long-term memories |
| Tasks | `memory/tasks/task_{id}.json` | Task board with dependencies |
| Schedules | `memory/schedules.json` | Cron-like scheduled tasks |
| Team | `memory/team/config.json` | Teammates & roles |

## Key Files

- **SOUL.md** - YodaClaw's identity (loaded at startup)
- **USER.md** - User context (loaded at startup)  
- **AGENTS.md** - This file (workspace conventions)
- **IMPROVEMENT_PLAN.md** - Feature roadmap

## Features

### Phase 1: Foundation
- TodoWrite with nag reminders
- Context Compression (3 layers)

### Phase 2: Task System
- File-based Task Manager
- Background Tasks

### Phase 3: Multi-Agent
- Team messaging
- Team protocols

### Phase 4: Advanced
- Scheduler
- Enhanced Memory
- Deep Research

## Running

```bash
npm run dev    # Development mode
npm run build  # Compile
npm start      # Run compiled
```

## Testing

```bash
npm run test        # Run all tests
npm run test:todo   # Todo tests
npm run test:task   # Task tests
npm run test:agent  # Agent loop tests
```
