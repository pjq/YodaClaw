# YodaClaw 改进计划

基于 learn-claude-code 架构的渐进式增强路线图

## 概述

参考项目: https://github.com/shareAI-lab/learn-claude-code
克隆位置: /home/pjq/workspace/learn-claude-code

## 任务清单

### Phase 1: 基础增强 ✅

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| 1.1 | 增强TodoWrite - 添加nag reminder机制 | ✅ 已完成 | 当有open todos但3轮无更新时提醒 |
| 1.2 | Context Compression - 实现3层压缩策略 | ✅ 已完成 | microcompact + auto_compact + 存档 |

### Phase 2: 任务系统 ✅

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| 2.1 | File-based Task Manager | ✅ 已完成 | 任务持久化 + 依赖图 |
| 2.2 | Background Tasks | ✅ 已完成 | 守护线程 + 通知注入 |

### Phase 3: 多代理协作 ✅

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| 3.1 | Agent Teams | ✅ 已完成 | 持久化队友 + JSONL邮箱 |
| 3.2 | Team Protocols | ✅ 已完成 | shutdown审批 + plan审批流程 |
| 3.3 | Auto-claim | ✅ 已完成 | 空闲时自动认领任务 |

### Phase 4: 高级功能 ✅

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| 4.1 | 增强Memory | ✅ 已完成 | 语义搜索、标签分类、时间检索 |
| 4.2 | 定时任务 | ✅ 已完成 | Cron式调度、任务管理 |

---

## 笔记

- Phase 1 优先级最高，是最容易上手的改进
- Context Compression 对长会话至关重要
- Task Manager 是多代理协作的基础

## 更新日志

- 2026-03-07: 创建计划文档
- 2026-03-07: Phase 1.1 完成 - 实现TodoWrite工具 + nag reminder机制
  - 新增 `src/todo.ts` - TodoManager类
  - 修改 `src/index.ts` - 集成TodoWrite工具
  - 支持3轮无操作后自动提醒模型更新todo
- 2026-03-07: Phase 1.2 完成 - 实现Context Compression 3层压缩
  - 新增 `src/context.ts` - ContextManager类
  - Layer 1: microcompact - 保留最近3个tool_results
  - Layer 2: auto_compact - 超过阈值时自动摘要对话
  - Layer 3: transcript归档到JSONL
- 2026-03-07: Phase 2 完成 - 任务系统和后台任务
  - 新增 `src/task.ts` - 任务系统（持久化 + 依赖图）
  - 新增 `src/background.ts` - 后台任务管理器
  - Task相关工具: task_create/get/update/list
  - 后台工具: background_run/check
  - 支持任务依赖追踪和状态变更通知
  - 支持后台命令执行和自动通知注入
- 2026-03-07: Phase 3 完成 - 多代理协作系统
  - 新增 `src/team.ts` - MessageBus消息系统（JSONL邮箱）
  - 新增 `src/team-manager.ts` - TeamManager团队管理
  - 团队工具: spawn_teammate/list_teammates/send_message/broadcast/read_inbox
  - 协议工具: shutdown_request/plan_approval
  - 任务工具: claim_task/idle
  - 支持团队消息收发、任务认领、关闭审批、计划审批流程
- 2026-03-07: Phase 4 完成 - 高级功能
  - 新增 `src/scheduler.ts` - 定时任务调度器
  - 新增 `src/memory.ts` - 增强内存系统
  - 调度工具: schedule_add/list/remove
  - 内存工具: memory_add/search/recent/tags
  - 支持30m/1h/1d等间隔调度
  - 支持内存标签、语义搜索、时间检索
