import { NextResponse } from 'next/server';

export const config = {
  runtime: 'edge',
}

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

const cache = new Map();

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString();
}

// Define the shape of the request body for type safety
interface RequestBody {
  content?: string;
  title?: string;
}

export async function POST(req: Request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };

  if (req.method === 'OPTIONS') {
    return new NextResponse(null, { status: 200, headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const { content, title }: RequestBody = await req.json();
    
    if (!content || content.trim() === '') {
      return new NextResponse(JSON.stringify({ success: false, error: 'Content is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const cacheKey = `summary_${simpleHash(content.substring(0, 200))}`;
    
    if (cache.has(cacheKey)) {
      console.log('Cache hit for summary');
      return new NextResponse(JSON.stringify({
        success: true,
        result: cache.get(cacheKey),
        title: title || 'Summary',
        cached: true,
        processingTime: Date.now() - startTime
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
    }

    if (!CLAUDE_API_KEY) {
      return new NextResponse(JSON.stringify({ success: false, error: 'API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const maxLength = 6000;
    const truncatedContent = content.length > maxLength 
      ? content.substring(0, maxLength) + '...[truncated]' 
      : content;

    console.log(`Processing summary for content length: ${truncatedContent.length}`);

    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 600,
        messages: [{
          role: "user",
          content: `Summarize this article in 3-4 concise bullet points. Focus on the most important facts and key takeaways:\n\n${truncatedContent}`
        }],
        temperature: 0.2
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', errorText);
      throw new Error(`Claude API failed with status ${response.status}`);
    }

    const data = await response.json();
    const result = data.content[0].text;
    
    cache.set(cacheKey, result);
    
    const processingTime = Date.now() - startTime;
    console.log(`Summary completed in ${processingTime}ms`);

    return new NextResponse(JSON.stringify({
      success: true,
      result: result,
      title: title || 'Summary',
      processingTime: processingTime
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});

  } catch (error) {
    console.error('Summary error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    return new NextResponse(JSON.stringify({
      success: false,
      error: errorMessage,
      processingTime: Date.now() - startTime
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  }
}