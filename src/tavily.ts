/**
 * Tavily Search - Native implementation
 */

import https from 'https';

const TAVILY_API_KEY = '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';

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

interface TavilyResponse {
  results: TavilyResult[];
}

export async function tavilySearch(query: string, maxResults = 5): Promise<string> {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      api_key: TAVILY_API_KEY,
      query,
      max_results: maxResults,
      include_answer: true,
      include_images: false,
      include_raw_content: false
    });

    const options = {
      hostname: 'api.tavily.com',
      path: '/search',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString();
          const data: TavilyResponse = JSON.parse(body);
          
          if (data.results && data.results.length > 0) {
            const lines = [`🔍 Search results for "${query}":\n`];
            for (const result of data.results.slice(0, maxResults)) {
              lines.push(`**${result.title}**`);
              lines.push(`${result.url}`);
              lines.push(`${result.content.slice(0, 200)}...`);
              lines.push('');
            }
            resolve(lines.join('\n'));
          } else {
            resolve('No results found.');
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}
