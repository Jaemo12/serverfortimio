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

// The handler is now named POST for the App Router
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
    const cacheKey = `insights_${simpleHash(content.substring(0, 200))}`;
    
    // Check cache first
    if (cache.has(cacheKey)) {
      console.log('Cache hit for insights');
      return new Response(JSON.stringify({
        success: true,
        result: cache.get(cacheKey),
        title: title || 'Insights',
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
    const maxLength = 7000;
    const truncatedContent = content.length > maxLength 
      ? content.substring(0, maxLength) + '...[truncated]' 
      : content;

    console.log(`Processing insights for content length: ${truncatedContent.length}`);

    // Optimized prompt for faster processing
    const prompt = `Analyze this article concisely. Structure your response exactly like this:

**Main Arguments**: What are the 2-3 central claims or points?

**Evidence Quality**: How well supported are the arguments? Mention key data/sources if present.

**Potential Bias**: What perspectives or limitations might be present?

**Key Questions**: What important aspects are left unaddressed?

Keep each section brief and focused.`;

    // Call Claude API
    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 800,
        messages: [{
          role: "user",
          content: `${prompt}\n\n---\n\n${truncatedContent}`
        }],
        temperature: 0.3
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
    console.log(`Insights completed in ${processingTime}ms`);

    return new Response(JSON.stringify({
      success: true,
      result: result,
      title: title || 'Insights',
      processingTime: processingTime
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Insights error:', error);
    const processingTime = Date.now() - startTime;
    return new Response(JSON.stringify({
      success: false,
      error: typeof error === 'object' && error !== null && 'message' in error ? (error as { message: string }).message : 'An unexpected error occurred',
      processingTime: processingTime
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}