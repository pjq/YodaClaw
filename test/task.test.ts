/**
 * Test TaskManager
 */

import { TaskManager } from '../src/task';
import fs from 'fs';
import path from 'path';

const TEST_DIR = '/tmp/test_tasks';

function cleanup() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true });
  }
}

function testCreate() {
  cleanup();
  const mgr = new TaskManager(TEST_DIR);
  
  const task = mgr.create('Test task', 'Description here');
  const parsed = JSON.parse(task);
  console.assert(parsed.id === 1, 'First task should have id 1');
  console.assert(parsed.subject === 'Test task', 'Subject should match');
  console.assert(parsed.status === 'pending', 'Status should be pending');
  
  // Create another
  mgr.create('Second task');
  const list = mgr.listAll();
  console.assert(list.length === 2, 'Should have 2 tasks');
  
  console.log('✓ Create test passed!');
}

function testUpdate() {
  cleanup();
  const mgr = new TaskManager(TEST_DIR);
  
  mgr.create('Test task');
  
  // Update status
  mgr.update(1, 'in_progress');
  let task = JSON.parse(mgr.get(1));
  console.assert(task.status === 'in_progress', 'Status should be in_progress');
  
  // Complete
  mgr.update(1, 'completed');
  task = JSON.parse(mgr.get(1));
  console.assert(task.status === 'completed', 'Status should be completed');
  
  console.log('✓ Update test passed!');
}

function testDependencies() {
  cleanup();
  const mgr = new TaskManager(TEST_DIR);
  
  mgr.create('Task 1');
  mgr.create('Task 2');
  
  // Task 2 blocked by Task 1
  mgr.update(2, 'pending', [1]);
  
  let task2 = JSON.parse(mgr.get(2));
  console.assert(task2.blockedBy.includes(1), 'Should be blocked by 1');
  
  // When task 1 completes, task 2 should be unblocked
  mgr.update(1, 'completed');
  task2 = JSON.parse(mgr.get(2));
  console.assert(!task2.blockedBy.includes(1), 'Should be unblocked');
  
  console.log('✓ Dependencies test passed!');
}

function testClaim() {
  cleanup();
  const mgr = new TaskManager(TEST_DIR);
  
  mgr.create('Test task');
  
  mgr.claim(1, 'worker1');
  const task = JSON.parse(mgr.get(1));
  console.assert(task.owner === 'worker1', 'Owner should be worker1');
  console.assert(task.status === 'in_progress', 'Status should be in_progress');
  
  console.log('✓ Claim test passed!');
}

function testList() {
  cleanup();
  const mgr = new TaskManager(TEST_DIR);
  
  mgr.create('First task');
  mgr.create('Second task');
  mgr.create('Third task');
  
  const list = mgr.list();
  console.assert(list.includes('#1'), 'Should include #1');
  console.assert(list.includes('#2'), 'Should include #2');
  console.assert(list.includes('#3'), 'Should include #3');
  
  console.log('✓ List test passed!');
}

function testGetAvailable() {
  cleanup();
  const mgr = new TaskManager(TEST_DIR);
  
  mgr.create('Task 1'); // pending, no owner
  mgr.create('Task 2'); // pending, no owner
  mgr.create('Task 3'); // will be claimed
  mgr.update(2, 'in_progress', [], []); // in_progress
  mgr.claim(3, 'worker'); // pending, has owner
  
  const available = mgr.getAvailable();
  console.assert(available.length === 1, 'Should have 1 available');
  console.assert(available[0].id === 1, 'Task 1 should be available');
  
  console.log('✓ GetAvailable test passed!');
}

// Run tests
console.log('Running TaskManager tests...\n');
testCreate();
testUpdate();
testDependencies();
testClaim();
testList();
testGetAvailable();
console.log('\n✅ All TaskManager tests passed!');
cleanup();
