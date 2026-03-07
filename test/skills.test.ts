/**
 * Test Skills Manager
 */

import { SkillsManager } from '../src/skills';
import fs from 'fs';
import path from 'path';

const TEST_DIR = '/tmp/test_skills';

function cleanup() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true });
  }
}

function testLoadSkills() {
  cleanup();
  
  // Create test skill structure
  const skillDir = path.join(TEST_DIR, '.claude', 'skills', 'test-skill');
  fs.mkdirSync(skillDir, { recursive: true });
  
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `---
name: Test Skill
description: A test skill for unit testing
---

# Test Skill

This is a test skill that does something useful.

## Usage

Use this skill when you need to test something.

## Steps

1. First step
2. Second step
3. Third step
`);

  const mgr = new SkillsManager(TEST_DIR);
  
  console.assert(mgr.has('test-skill'), 'Should have test-skill');
  console.assert(mgr.names().includes('test-skill'), 'Should include test-skill');
  
  const content = mgr.getContent('test-skill');
  console.assert(content.includes('Test Skill'), 'Should have skill content');
  
  const list = mgr.list();
  console.assert(list.includes('test-skill'), 'Should list skill');
  
  console.log('✓ testLoadSkills passed!');
}

function testListEmpty() {
  cleanup();
  const mgr = new SkillsManager(TEST_DIR);
  
  const list = mgr.list();
  console.assert(list.includes('No skills'), 'Should say no skills');
  
  console.log('✓ testListEmpty passed!');
}

function testGetNonExistent() {
  cleanup();
  const mgr = new SkillsManager(TEST_DIR);
  
  const content = mgr.getContent('non-existent');
  console.assert(content.includes('not found'), 'Should say not found');
  
  console.log('✓ testGetNonExistent passed!');
}

function testMultipleSkills() {
  cleanup();
  
  // Create multiple skills
  const skill1Dir = path.join(TEST_DIR, '.claude', 'skills', 'skill-one');
  const skill2Dir = path.join(TEST_DIR, '.claude', 'skills', 'skill-two');
  fs.mkdirSync(skill1Dir, { recursive: true });
  fs.mkdirSync(skill2Dir, { recursive: true });
  
  fs.writeFileSync(path.join(skill1Dir, 'SKILL.md'), `---
name: Skill One
description: First skill
---
# One`);
  
  fs.writeFileSync(path.join(skill2Dir, 'SKILL.md'), `---
name: Skill Two  
description: Second skill
---
# Two`);
  
  const mgr = new SkillsManager(TEST_DIR);
  
  console.assert(mgr.names().length === 2, 'Should have 2 skills');
  
  const list = mgr.list();
  console.assert(list.includes('skill-one'), 'Should have skill-one');
  console.assert(list.includes('skill-two'), 'Should have skill-two');
  
  console.log('✓ testMultipleSkills passed!');
}

// Run tests
console.log('Running SkillsManager tests...\n');
testLoadSkills();
testListEmpty();
testGetNonExistent();
testMultipleSkills();
console.log('\n✅ All SkillsManager tests passed!');
cleanup();
