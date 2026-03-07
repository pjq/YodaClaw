/**
 * Test MessageBus
 */

import { MessageBus } from '../src/team';
import fs from 'fs';

const TEST_DIR = '/tmp/test_inbox';

function cleanup() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true });
  }
}

function testSend() {
  cleanup();
  const bus = new MessageBus(TEST_DIR);
  
  const result = bus.send('alice', 'bob', 'Hello Bob!');
  console.assert(result === 'Sent message to bob', 'Should confirm sent');
  
  console.log('✓ Send test passed!');
}

function testReadInbox() {
  cleanup();
  const bus = new MessageBus(TEST_DIR);
  
  bus.send('alice', 'bob', 'Message 1');
  bus.send('alice', 'bob', 'Message 2');
  
  const messages = bus.readInbox('bob');
  console.assert(messages.length === 2, 'Should have 2 messages');
  console.assert(messages[0].content === 'Message 1', 'First should be Message 1');
  console.assert(messages[1].content === 'Message 2', 'Second should be Message 2');
  
  // Inbox should be empty after reading
  const empty = bus.readInbox('bob');
  console.assert(empty.length === 0, 'Inbox should be empty after drain');
  
  console.log('✓ ReadInbox test passed!');
}

function testBroadcast() {
  cleanup();
  const bus = new MessageBus(TEST_DIR);
  
  bus.broadcast('alice', 'Hello everyone', ['bob', 'charlie', 'diana']);
  
  const bobMsgs = bus.readInbox('bob');
  const charlieMsgs = bus.readInbox('charlie');
  const dianaMsgs = bus.readInbox('diana');
  
  console.assert(bobMsgs.length === 1, 'Bob should have 1 message');
  console.assert(charlieMsgs.length === 1, 'Charlie should have 1 message');
  console.assert(dianaMsgs.length === 1, 'Diana should have 1 message');
  
  // Alice should NOT receive her own broadcast
  const aliceMsgs = bus.readInbox('alice');
  console.assert(aliceMsgs.length === 0, 'Alice should have 0 messages');
  
  console.log('✓ Broadcast test passed!');
}

function testMessageTypes() {
  cleanup();
  const bus = new MessageBus(TEST_DIR);
  
  bus.send('alice', 'bob', 'Normal msg', 'message');
  bus.send('alice', 'bob', 'Broadcast', 'broadcast');
  bus.send('alice', 'bob', 'Shutdown plz', 'shutdown_request', { requestId: 'req123' });
  
  const messages = bus.readInbox('bob');
  console.assert(messages[0].type === 'message', 'First should be message type');
  console.assert(messages[1].type === 'broadcast', 'Second should be broadcast type');
  console.assert(messages[2].type === 'shutdown_request', 'Third should be shutdown_request');
  console.assert(messages[2].requestId === 'req123', 'Should have requestId');
  
  console.log('✓ MessageTypes test passed!');
}

// Run tests
console.log('Running MessageBus tests...\n');
testSend();
testReadInbox();
testBroadcast();
testMessageTypes();
console.log('\n✅ All MessageBus tests passed!');
cleanup();
