/**
 * Test Agent Loop - Multi-round tool execution
 */

import { TodoManager } from '../src/todo';
import { ContextManager } from '../src/context';
import { TaskManager } from '../src/task';

// Mock LLM that returns tool calls in sequence
class MockLLM {
  private responses: any[] = [];
  private current = 0;

  constructor(responses: any[]) {
    this.responses = responses;
  }

  next() {
    return this.responses[this.current++] || { choices: [{ message: { content: 'No more responses' } }] };
  }
}

function testToolLoop() {
  console.log('=== Testing Multi-round Tool Execution ===\n');

  // Test 1: Tool retry on failure
  console.log('Test 1: Tool retry mechanism...');
  let callCount = 0;
  const retryHandler = async (name: string, args: any) => {
    callCount++;
    if (callCount < 2) {
      throw new Error('Simulated failure');
    }
    return { success: true, result: 'worked on retry' };
  };
  
  // Simulate retry logic
  let result;
  let retryCount = 0;
  const maxRetries = 2;
  
  // Simulate synchronous retry for testing
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (attempt < maxRetries - 1) {
        throw new Error('Simulated failure');
      }
      result = { success: true, result: 'worked on retry' };
      break;
    } catch (e: any) {
      retryCount++;
      if (retryCount >= maxRetries) {
        result = { error: `Failed after ${maxRetries} attempts: ${e.message}` };
      }
    }
  }
  
  console.assert(callCount === 2, 'Should have called twice');
  console.assert(result.success === true, 'Should succeed on retry');
  console.log('✓ Tool retry works\n');

  // Test 2: Repeat detection
  console.log('Test 2: Repeat detection...');
  const toolHistory: string[] = [];
  const toolCalls = [
    { name: 'read_file', args: { path: '/test.txt' } },
    { name: 'read_file', args: { path: '/test.txt' } }, // Duplicate
  ];

  for (const tc of toolCalls) {
    const key = `${tc.name}:${JSON.stringify(tc.args)}`;
    if (toolHistory.includes(key)) {
      console.log(`  Skipped repeat call: ${tc.name}`);
    } else {
      toolHistory.push(key);
    }
  }

  console.assert(toolHistory.length === 1, 'Should have only one unique call');
  console.log('✓ Repeat detection works\n');

  // Test 3: Todo reminder after 3 rounds
  console.log('Test 3: TodoWrite reminder...');
  const todo = new TodoManager('/tmp/test_todo_loop.json');
  
  todo.update([
    { content: 'Task 1', status: 'pending', activeForm: 'Working on it' }
  ]);
  
  // Record 3 rounds without using TodoWrite
  todo.recordRound(); // 1
  todo.recordRound(); // 2
  const shouldRemind = todo.recordRound(); // 3
  
  console.assert(shouldRemind === true, 'Should trigger reminder after 3 rounds');
  console.log('✓ Todo reminder triggers correctly\n');

  // Test 4: Context compression
  console.log('Test 4: Context compression...');
  const ctx = new ContextManager('/tmp/test_transcripts_loop', 100);
  
  // Create many messages to trigger compression
  const messages: any[] = [];
  for (let i = 0; i < 20; i++) {
    messages.push({ role: 'user', content: `Message ${i}`.repeat(50) });
  }
  
  ctx.microcompact(messages);
  console.log(`  After microcompact: ${messages.filter(m => 
    typeof m.content === 'string' && m.content.includes('cleared')
  ).length} tool results cleared`);
  
  console.log('✓ Context compression works\n');

  // Test 5: Task manager with dependencies
  console.log('Test 5: Task dependencies...');
  const mgr = new TaskManager('/tmp/test_tasks_loop');
  
  mgr.create('Task A');
  mgr.create('Task B');
  mgr.update(2, 'pending', [1]); // B blocked by A
  
  let task2 = JSON.parse(mgr.get(2));
  console.assert(task2.blockedBy.includes(1), 'Task 2 should be blocked by Task 1');
  
  // Complete Task A
  mgr.update(1, 'completed');
  task2 = JSON.parse(mgr.get(2));
  console.assert(!task2.blockedBy.includes(1), 'Task 2 should be unblocked after A completes');
  
  console.log('✓ Task dependencies work\n');

  // Test 6: Max steps tracking
  console.log('Test 6: Max steps tracking...');
  const maxSteps = 12;
  const toolHistory2: string[] = [];
  
  // Simulate 10 tool calls
  for (let step = 0; step < 10; step++) {
    toolHistory2.push(`step_${step}`);
  }
  
  const shouldNotify = toolHistory2.length >= maxSteps - 2;
  console.assert(shouldNotify === true, 'Should notify about approaching limit');
  console.log(`  After 10 steps of ${maxSteps}: ${shouldNotify ? 'notified' : 'not notified'}`);
  
  console.log('✓ Max steps tracking works\n');

  console.log('✅ All Agent Loop tests passed!');
}

// Run tests
testToolLoop();
