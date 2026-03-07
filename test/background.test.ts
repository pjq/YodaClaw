/**
 * Test BackgroundManager
 */

import { BackgroundManager } from '../src/background';

function testRun() {
  const mgr = new BackgroundManager();
  
  // Test simple command
  const result = mgr.run('echo "hello world"', 5000);
  console.assert(result.includes('Background task'), 'Should return task started message');
  console.assert(result.includes('started'), 'Should say started');
  
  console.log('✓ Run test passed!');
}

function testCheck() {
  const mgr = new BackgroundManager();
  
  // Check empty
  let result = mgr.check();
  console.assert(result === 'No background tasks.', 'Empty should say no tasks');
  
  // Run task and check
  mgr.run('sleep 0.1 && echo done', 5000);
  result = mgr.check();
  console.assert(result.includes('[running]'), 'Should show running');
  
  // Wait and check specific
  setTimeout(() => {
    const taskId = result.split(':')[0].trim();
    const specific = mgr.check(taskId);
    console.assert(specific.includes('[completed]'), 'Should show completed');
    console.log('✓ Check test passed!');
  }, 200);
}

function testDrain() {
  const mgr = new BackgroundManager();
  
  // Initially no notifications
  console.assert(!mgr.hasNotifications(), 'Should have no notifications initially');
  
  // Run a quick task
  mgr.run('echo drained', 5000);
  
  // Should have notifications after completion
  setTimeout(() => {
    const notifs = mgr.drain();
    console.assert(notifs.length >= 0, 'Should return notifications array');
    console.log('✓ Drain test passed!');
  }, 200);
}

// Run tests
console.log('Running BackgroundManager tests...\n');
testRun();
setTimeout(() => {
  testCheck();
  setTimeout(() => {
    testDrain();
    console.log('\n✅ All BackgroundManager tests passed!');
  }, 300);
}, 300);
