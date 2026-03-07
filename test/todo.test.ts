/**
 * Test TodoManager
 */

import { TodoManager } from '../src/todo';
import path from 'path';
import fs from 'fs';

const TEST_FILE = '/tmp/test_todos.json';

function cleanup() {
  if (fs.existsSync(TEST_FILE)) {
    fs.unlinkSync(TEST_FILE);
  }
}

function testBasic() {
  cleanup();
  const todo = new TodoManager(TEST_FILE);
  
  // Test initial state
  console.assert(todo.render() === 'No todos.', 'Initial should be empty');
  console.assert(!todo.hasOpenItems(), 'Should have no open items');
  
  // Test add
  const result = todo.update([
    { content: 'Test task', status: 'pending', activeForm: 'Testing' }
  ]);
  console.assert(todo.hasOpenItems(), 'Should have open items');
  console.log('✓ Basic operations');
  
  // Test markTodoUsed
  todo.markTodoUsed();
  console.assert(todo.getRoundsSinceLastTodo() === 0, 'Rounds should be 0 after use');
  
  // Test recordRound
  todo.recordRound();
  todo.recordRound();
  console.assert(todo.getRoundsSinceLastTodo() === 2, 'Rounds should be 2');
  
  // Test reminder trigger
  todo.recordRound(); // 3rd round
  const shouldRemind = todo.recordRound(); // 4th round
  console.assert(shouldRemind === true, 'Should trigger reminder after 3 rounds');
  
  console.log('✓ TodoWrite tests passed!');
  cleanup();
}

function testStatus() {
  cleanup();
  const todo = new TodoManager(TEST_FILE);
  
  todo.update([
    { content: 'Task 1', status: 'pending', activeForm: 'Doing' },
    { content: 'Task 2', status: 'in_progress', activeForm: 'Working' },
    { content: 'Task 3', status: 'completed', activeForm: 'Done' }
  ]);
  
  const items = todo.getItems();
  console.assert(items.length === 3, 'Should have 3 items');
  console.assert(items.filter(i => i.status === 'in_progress').length === 1, 'Only one in_progress');
  console.assert(items.filter(i => i.status === 'completed').length === 1, 'Only one completed');
  
  console.log('✓ Status tests passed!');
  cleanup();
}

function testValidation() {
  cleanup();
  const todo = new TodoManager(TEST_FILE);
  
  // Test max items
  try {
    const items = Array(21).fill(null).map((_, i) => ({
      content: `Task ${i}`,
      status: 'pending' as const,
      activeForm: 'Test'
    }));
    todo.update(items);
    console.assert(false, 'Should throw on too many items');
  } catch (e: any) {
    console.assert(e.message.includes('Max 20'), 'Should say max 20');
  }
  
  // Test multiple in_progress
  try {
    todo.update([
      { content: 'Task 1', status: 'in_progress', activeForm: 'A' },
      { content: 'Task 2', status: 'in_progress', activeForm: 'B' }
    ]);
    console.assert(false, 'Should throw on multiple in_progress');
  } catch (e: any) {
    console.assert(e.message.includes('Only one in_progress'), 'Should say only one');
  }
  
  console.log('✓ Validation tests passed!');
  cleanup();
}

// Run tests
console.log('Running TodoManager tests...\n');
testBasic();
testStatus();
testValidation();
console.log('\n✅ All TodoManager tests passed!');
