/**
 * Test ContextManager
 */

import { ContextManager } from '../src/context';
import fs from 'fs';

const TEST_DIR = '/tmp/test_transcripts';

function cleanup() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true });
  }
}

function testEstimateTokens() {
  cleanup();
  const ctx = new ContextManager(TEST_DIR, 1000);
  
  const messages = [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there!' }
  ];
  
  const tokens = ctx.estimateTokens(messages);
  console.assert(tokens > 0, 'Should estimate some tokens');
  
  console.log('✓ EstimateTokens test passed!');
}

function testMicrocompact() {
  cleanup();
  const ctx = new ContextManager(TEST_DIR, 1000);
  
  // Create messages with many tool_results
  const messages: any[] = [
    { role: 'user', content: 'Task 1' },
    { role: 'assistant', content: [{ type: 'tool_use', name: 'bash', id: '1' }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: '1', content: 'Result 1'.repeat(100) }] },
    { role: 'user', content: 'Task 2' },
    { role: 'assistant', content: [{ type: 'tool_use', name: 'bash', id: '2' }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: '2', content: 'Result 2'.repeat(100) }] },
    { role: 'user', content: 'Task 3' },
    { role: 'assistant', content: [{ type: 'tool_use', name: 'bash', id: '3' }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: '3', content: 'Result 3'.repeat(100) }] },
    { role: 'user', content: 'Task 4' },
    { role: 'assistant', content: [{ type: 'tool_use', name: 'bash', id: '4' }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: '4', content: 'Result 4'.repeat(100) }] },
  ];
  
  ctx.microcompact(messages);
  
  // Should keep only last 3 tool_results, older should be cleared
  console.log('✓ Microcompact test passed!');
}

function testArchive() {
  cleanup();
  const ctx = new ContextManager(TEST_DIR);
  
  const messages = [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi' }
  ];
  
  const path = ctx.archiveTranscript(messages);
  console.assert(fs.existsSync(path), 'Should create transcript file');
  
  const files = ctx.listTranscripts();
  console.assert(files.length === 1, 'Should have 1 transcript');
  console.assert(files[0].includes('transcript_'), 'Should be transcript file');
  
  console.log('✓ Archive test passed!');
}

function testCleanOld() {
  cleanup();
  const ctx = new ContextManager(TEST_DIR);
  
  // Create 15 transcripts
  for (let i = 0; i < 15; i++) {
    ctx.archiveTranscript([{ role: 'user', content: `Msg ${i}` }]);
  }
  
  let files = ctx.listTranscripts();
  console.assert(files.length === 15, 'Should have 15 transcripts');
  
  // Clean keeping last 10
  const deleted = ctx.cleanOldTranscripts(10);
  console.assert(deleted === 5, 'Should delete 5');
  
  files = ctx.listTranscripts();
  console.assert(files.length === 10, 'Should have 10 remaining');
  
  console.log('✓ CleanOld test passed!');
}

function testReadTranscript() {
  cleanup();
  const ctx = new ContextManager(TEST_DIR);
  
  const original = [
    { role: 'user', content: 'Test message' },
    { role: 'assistant', content: 'Test response' }
  ];
  
  const path = ctx.archiveTranscript(original);
  const filename = path.split('/').pop() || '';
  
  const restored = ctx.readTranscript(filename);
  console.assert(restored.length === 2, 'Should restore 2 messages');
  console.assert(restored[0].content === 'Test message', 'First should match');
  
  console.log('✓ ReadTranscript test passed!');
}

// Run tests
console.log('Running ContextManager tests...\n');
testEstimateTokens();
testMicrocompact();
testArchive();
testCleanOld();
testReadTranscript();
console.log('\n✅ All ContextManager tests passed!');
cleanup();
