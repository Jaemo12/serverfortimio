export const config = {
  runtime: 'edge',
}

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

// Simple in-memory cache for Edge runtime
const cache = new Map();

// Create a simple hash for caching
function simpleHash(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString();
}

// The handler is named POST for the App Router
export async function POST(req: { method: string; json: () => PromiseLike<{ content: any; title: any; }> | { content: any; title: any; }; }) {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 200, 
      headers: corsHeaders 
    });
  }

  const startTime = Date.now();

  try {
    // Parse request body
    const { content, title } = await req.json();
    
    if (!content || content.trim() === '') {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Content is required' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Create cache key
    const cacheKey = `summary_${simpleHash(content.substring(0, 200))}`;
    
    // Check cache first
    if (cache.has(cacheKey)) {
      console.log('Cache hit for summary');
      return new Response(JSON.stringify({
        success: true,
        result: cache.get(cacheKey),
        title: title || 'Summary',
        cached: true,
        processingTime: Date.now() - startTime
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Validate API key
    if (!CLAUDE_API_KEY) {
      return new Response(JSON.stringify({
        success: false,
        error: 'API key not configured'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Truncate content for faster processing
    const maxLength = 6000;
    const truncatedContent = content.length > maxLength 
      ? content.substring(0, maxLength) + '...[truncated]' 
      : content;

    console.log(`Processing summary for content length: ${truncatedContent.length}`);

    // Call Claude API
    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307", // Using Haiku for speed/cost
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
    
    // Cache the result
    cache.set(cacheKey, result);
    
    const processingTime = Date.now() - startTime;
    console.log(`Summary completed in ${processingTime}ms`);

    return new Response(JSON.stringify({
      success: true,
      result: result,
      title: title || 'Summary',
      processingTime: processingTime
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Summary error:', error);
    const processingTime = Date.now() - startTime;
    return new Response(JSON.stringify({
      success: false,
      error: (error && typeof error === 'object' && 'message' in error) ? (error as { message: string }).message : 'An unexpected error occurred',
      processingTime: processingTime
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}