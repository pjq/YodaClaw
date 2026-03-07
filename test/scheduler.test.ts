/**
 * Test Scheduler - Cron-like task scheduling
 */

import { Scheduler } from '../src/scheduler';
import fs from 'fs';

const TEST_FILE = '/tmp/test_scheduler.json';

function cleanup() {
  if (fs.existsSync(TEST_FILE)) {
    fs.unlinkSync(TEST_FILE);
  }
}

function testAddSimple() {
  cleanup();
  const scheduler = new Scheduler(TEST_FILE);
  
  const result = scheduler.add('Test Task', '30m', 'research', { query: 'test query' });
  console.assert(result.includes('Test Task'), 'Should add task');
  
  const list = scheduler.list();
  console.assert(list.includes('Test Task'), 'Should list task');
  console.assert(list.includes('30m'), 'Should have 30m schedule');
  
  console.log('✓ testAddSimple passed');
}

function testAddNaturalLanguage() {
  cleanup();
  const scheduler = new Scheduler(TEST_FILE);
  
  // Test "5 minutes from now"
  let result = scheduler.add('Task 1', '5 minutes from now', 'research', { query: 'test' });
  console.assert(result.includes('delay'), 'Should parse delay');
  
  // Test "1 hour from now"
  result = scheduler.add('Task 2', '1 hour from now', 'research', { query: 'test' });
  console.assert(result.includes('3600000'), 'Should parse hour to ms');
  
  // Test "in 30 minutes"
  result = scheduler.add('Task 3', 'in 30 minutes', 'research', { query: 'test' });
  console.assert(result.includes('delay'), 'Should parse in X minutes');
  
  console.log('✓ testAddNaturalLanguage passed');
}

function testActionParsing() {
  cleanup();
  const scheduler = new Scheduler(TEST_FILE);
  
  // Test "deep_research about X"
  let result = scheduler.add('Research AI', '1h', 'deep_research about AI news');
  console.assert(result.includes('Research AI'), 'Should add task');
  
  // Test simple action
  result = scheduler.add('Simple Task', '1h', 'research', { query: 'test' });
  console.assert(result.includes('Simple Task'), 'Should add simple task');
  
  console.log('✓ testActionParsing passed');
}

function testRemove() {
  cleanup();
  const scheduler = new Scheduler(TEST_FILE);
  
  scheduler.add('To Remove', '1h', 'research', { query: 'test' });
  let list = scheduler.list();
  console.assert(list.includes('To Remove'), 'Should have task');
  
  scheduler.remove('To Remove');
  list = scheduler.list();
  console.assert(!list.includes('To Remove'), 'Should be removed');
  
  console.log('✓ testRemove passed');
}

function testList() {
  cleanup();
  const scheduler = new Scheduler(TEST_FILE);
  
  // Empty list
  let list = scheduler.list();
  console.assert(list === 'No schedules.', 'Empty should say no schedules');
  
  // Add tasks
  scheduler.add('Task A', '1h', 'research', { query: 'a' });
  scheduler.add('Task B', '30m', 'research', { query: 'b' });
  
  list = scheduler.list();
  console.assert(list.includes('Task A'), 'Should have Task A');
  console.assert(list.includes('Task B'), 'Should have Task B');
  
  console.log('✓ testList passed');
}

console.log('Running Scheduler tests...\n');

testAddSimple();
testAddNaturalLanguage();
testActionParsing();
testRemove();
testList();

console.log('\n✅ All Scheduler tests passed!');
cleanup();
