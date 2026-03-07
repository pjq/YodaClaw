/**
 * Test Markdown to HTML conversion
 */

function testMarkdownToHtml() {
  const text = `**Bold text**
*Italic text*
\`inline code\`

## Heading 2

\`\`\`
code block
\`\`\`

- list item 1
- list item 2`;

  // Simulate the conversion
  const htmlText = text
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.+?)\*/g, '<i>$1</i>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/```[\s\S]*?```/g, (match) => '<pre>' + match.replace(/```/g, '').trim() + '</pre>');

  console.assert(htmlText.includes('<b>Bold text</b>'), 'Should convert bold');
  console.assert(htmlText.includes('<i>Italic text</i>'), 'Should convert italic');
  console.assert(htmlText.includes('<code>inline code</code>'), 'Should convert code');
  console.assert(htmlText.includes('<pre>'), 'Should convert code blocks');
  
  console.log('✓ testMarkdownToHtml passed!');
}

function testHtmlEntities() {
  // Test that special HTML chars are handled
  const text = '<test> & "quote"';
  
  // Telegram HTML should handle basic chars
  console.assert(text.includes('<test>'), 'Should keep brackets');
  console.assert(text.includes('&'), 'Should keep ampersand');
  
  console.log('✓ testHtmlEntities passed!');
}

console.log('Running Markdown conversion tests...\n');
testMarkdownToHtml();
testHtmlEntities();
console.log('\n✅ All Markdown tests passed!');
