import { NextResponse } from 'next/server';

export const config = {
  runtime: 'edge',
}

// Get all keys from environment variables
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const TAVILY_API_URL = 'https://api.tavily.com/search';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
};

export async function OPTIONS(req: Request) {
    return new NextResponse(null, { status: 200, headers: corsHeaders });
}

interface RequestBody {
  content?: string;
  title?: string;
}

// --- Helper Functions ---

// 1. Get the core topic using Claude Haiku (fast and cheap)
async function getTopicFromContent(content: string): Promise<string> {
    const response = await fetch(CLAUDE_API_URL, {
        method: 'POST',
        headers: { 'x-api-key': CLAUDE_API_KEY!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
            model: 'claude-3-haiku-20240307',
            max_tokens: 50,
            messages: [{ role: 'user', content: `Identify the main topic of the following article text in a short, neutral phrase of 5-10 words. Example: "US inflation and interest rate policy".\n\nARTICLE:\n${content}` }],
        }),
    });
    if (!response.ok) throw new Error('Failed to get topic from Claude');
    const data = await response.json();
    return data.content[0].text;
}

// 2. Search for an article with a specific bias using Tavily
async function searchWithTavily(query: string) {
    const response = await fetch(TAVILY_API_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${TAVILY_API_KEY!}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            api_key: TAVILY_API_KEY!,
            query: query,
            search_depth: "basic",
            max_results: 1, // We only need the top result
        }),
    });
    if (!response.ok) throw new Error(`Tavily search failed for query: ${query}`);
    const data = await response.json();
    // Return a structured object, defaulting if no results are found
    if (data.results && data.results.length > 0) {
        return {
            title: data.results[0].title,
            url: data.results[0].url,
            source_name: new URL(data.results[0].url).hostname,
            summary: data.results[0].content,
        };
    }
    return { title: "No article found", url: "#", source_name: "N/A", summary: "Could not find a relevant article for this perspective." };
}


// --- Main API Route ---

export async function POST(req: Request) {
  if (!CLAUDE_API_KEY || !TAVILY_API_KEY) {
    return new NextResponse(JSON.stringify({ success: false, error: 'API keys for Claude or Tavily are not configured on the server.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const { content }: RequestBody = await req.json();
    if (!content || content.trim() === '') {
      return new NextResponse(JSON.stringify({ success: false, error: 'Content is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const truncatedContent = content.substring(0, 2000);

    // Step 1: Get the core topic from the article
    const topic = await getTopicFromContent(truncatedContent);

    // Step 2: Perform two parallel, biased searches with Tavily
    const [leftPerspective, rightPerspective] = await Promise.all([
        searchWithTavily(`progressive or left-leaning criticism of "${topic}"`),
        searchWithTavily(`conservative or right-leaning support for "${topic}"`)
    ]);

    // Step 3: Return the combined results
    return new NextResponse(JSON.stringify({
      success: true,
      pivot: {
        left_perspective: leftPerspective,
        right_perspective: rightPerspective
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Pivot endpoint error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    return new NextResponse(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}