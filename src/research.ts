/**
 * Deep Research - Multi-step research with source aggregation
 */

import https from 'https';

const TAVILY_API_KEY = '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';

interface ResearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

interface ResearchResponse {
  results: ResearchResult[];
  answer?: string;
}

/**
 * Deep Research - Comprehensive research on a topic
 */
export async function deepResearch(query: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      api_key: TAVILY_API_KEY,
      query,
      search_depth: 'advanced',
      max_results: 10,
      include_answer: true,
      include_images: false,
      include_raw_content: true,
      include_domains: [], // All domains
      exclude_domains: []
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
          const data: ResearchResponse = JSON.parse(body);
          
          if (data.results && data.results.length > 0) {
            const lines = [`🔬 **Deep Research: ${query}**\n`];
            
            // Add AI answer if available
            if (data.answer) {
              lines.push(`## 📝 Summary\n${data.answer}\n`);
            }
            
            // Add sources
            lines.push(`## 📚 Sources (${data.results.length})`);
            for (const result of data.results) {
              lines.push(`\n### ${result.title}`);
              lines.push(`🔗 ${result.url}`);
              lines.push(`Score: ${(result.score * 100).toFixed(0)}%`);
              if (result.content) {
                lines.push(`\n${result.content.slice(0, 500)}...`);
              }
            }
            
            resolve(lines.join('\n'));
          } else {
            resolve('No results found for research query.');
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

/**
 * Extract content from a URL
 */
export async function extractUrl(url: string, maxChars = 15000): Promise<string> {
  return new Promise((resolve) => {
    // Parse URL to handle redirects manually
    const parseUrl = (urlStr: string, depth = 0): void => {
      if (depth > 5) {
        resolve('Too many redirects');
        return;
      }
      
      const httpsModule = require('https');
      const httpModule = require('http');
      const isHttps = urlStr.startsWith('https://');
      
      // For HTTPS, we need to handle SSL issues
      const options: any = {};
      if (isHttps) {
        options.rejectUnauthorized = false; // Ignore SSL cert errors
      }
      
      const client = isHttps ? httpsModule : httpModule;
      
      const req = client.get(urlStr, options, (res: any) => {
        // Handle redirects (301, 302, 303, 307, 308)
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          console.log(`[extract_url] Redirect: ${urlStr} -> ${res.headers.location}`);
          // Handle relative redirects
          const newUrl = res.headers.location.startsWith('http') 
            ? res.headers.location 
            : new URL(res.headers.location, urlStr).href;
          parseUrl(newUrl, depth + 1);
          return;
        }
        
        const chunks: Buffer[] = [];
        let total = 0;
        
        res.on('data', (d: Buffer) => {
          total += d.length;
          if (total <= maxChars) chunks.push(d);
        });
        
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          let html = buffer.toString('utf-8');
          
          // Extract title
          const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          const title = titleMatch ? titleMatch[1] : 'No title';
          
          // Remove scripts and styles
          html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
          html = html.replace(/<style[\s\S]*?<\/style>/gi, '');
          
          // Convert HTML to text
          let text = html
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n\n')
            .replace(/<\/div>/gi, '\n')
            .replace(/<\/h[1-6]>/gi, '\n\n')
            .replace(/<[^>]+>/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
          
          resolve(`Title: ${title}\nURL: ${urlStr}\n\nContent:\n${text.slice(0, maxChars)}`);
        });
        
        res.on('error', () => resolve(`Failed to fetch: ${urlStr}`));
      });
      
      req.on('error', (e: any) => {
        // Try with SSL disabled if it's an SSL error
        if (e.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || e.code === 'CERT_HAS_EXPIRED') {
          console.log(`[extract_url] SSL error, retrying without verification: ${urlStr}`);
          const optionsNoSSL: any = { rejectUnauthorized: false };
          const retryClient = isHttps ? httpsModule : httpModule;
          retryClient.get(urlStr, optionsNoSSL, (res: any) => {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              const newUrl = res.headers.location.startsWith('http') 
                ? res.headers.location 
                : new URL(res.headers.location, urlStr).href;
              parseUrl(newUrl, depth + 1);
              return;
            }
            const chunks: Buffer[] = [];
            res.on('data', (d: Buffer) => chunks.push(d));
            res.on('end', () => {
              let html = Buffer.concat(chunks).toString('utf-8');
              const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
              const title = titleMatch ? titleMatch[1] : 'No title';
              html = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
              let text = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<\/div>/gi, '\n').replace(/<\/h[1-6]>/gi, '\n\n').replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim();
              resolve(`Title: ${title}\nURL: ${urlStr}\n\nContent:\n${text.slice(0, maxChars)}`);
            });
          }).on('error', () => resolve(`Failed to connect (SSL): ${urlStr}`));
        } else {
          resolve(`Failed to connect: ${urlStr} - ${e.message}`);
        }
      });
    };
    
    parseUrl(url);
  });
}

/**
 * Compare/multiple sources on a topic
 */
export async function compareSources(topics: string[]): Promise<string> {
  const results: { topic: string; sources: ResearchResult[] }[] = [];
  
  for (const topic of topics) {
    try {
      const result = await deepResearch(topic);
      results.push({ topic, sources: [] });
    } catch (e) {
      results.push({ topic, sources: [] });
    }
  }
  
  const lines = ['## 🔍 Multi-Source Comparison\n'];
  
  for (const r of results) {
    lines.push(`\n### ${r.topic}`);
    lines.push('(See detailed research above)');
  }
  
  return lines.join('\n');
}
