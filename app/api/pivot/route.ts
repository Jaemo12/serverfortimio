import { NextResponse } from 'next/server';

export const config = {
  runtime: 'edge',
}

// Access all necessary API keys from environment variables
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;

const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
};

export async function OPTIONS() {
    return new NextResponse(null, { status: 200, headers: corsHeaders });
}

interface RequestBody {
  content?: string;
  url?: string;
}

export async function POST(req: Request) {
  const startTime = Date.now();
  
  try {
    const { content: url }: RequestBody = await req.json();

    if (!url || !url.trim()) {
      throw new Error('URL (sent as content) is required');
    }

    if (!PERPLEXITY_API_KEY || !CLAUDE_API_KEY) {
        throw new Error('An API key for Perplexity or Claude is not configured on the server.');
    }
    
    // --- STEP 1: Using the model name you provided ---
    const searchPrompt = `Please find 3-4 articles with opposing viewpoints to the article at this URL: ${url}. For each one, just list the title and the full URL on a new line.`;
    
    const searchResponse = await fetch(PERPLEXITY_API_URL, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`, 
        'accept': 'application/json', 
        'content-type': 'application/json' 
      },
      body: JSON.stringify({
        model: "sonar-reasoning-pro", // Using the model name you requested
        messages: [{ role: "user", content: searchPrompt }],
      }),
    });

    if (!searchResponse.ok) {
        const errorText = await searchResponse.text();
        throw new Error(`Search step (Perplexity) failed with status ${searchResponse.status}: ${errorText}`);
    }
    const searchData = await searchResponse.json();
    const plainTextListOfArticles = searchData.choices[0].message.content;

    // --- STEP 2: Formatting the response with Claude ---
    const formatPrompt = `You are a data formatting expert. Your only job is to extract information from the provided text and convert it into a perfect, clean JSON array. Each object in the array must have two keys: "title" (a string) and "url" (a string).

EXAMPLE:
INPUT TEXT:
Some Title 1
https://www.example.com/article1
Another Title 2
https://www.example.com/article2

DESIRED JSON OUTPUT:
[
  {"title": "Some Title 1", "url": "https://www.example.com/article1"},
  {"title": "Another Title 2", "url": "https://www.example.com/article2"}
]

Now, perform this exact task on the following text. Do not add any commentary or explanation. Only output the JSON.

REAL TEXT:
${plainTextListOfArticles}`;

    const formatResponse = await fetch(CLAUDE_API_URL, {
        method: 'POST',
        headers: {
            'x-api-key': CLAUDE_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            model: "claude-3-haiku-20240307",
            max_tokens: 2048,
            messages: [{ role: "user", content: formatPrompt }],
            temperature: 0.0,
        }),
    });
    
    if (!formatResponse.ok) {
        const errorText = await formatResponse.text();
        throw new Error(`Formatting step (Claude) failed with status ${formatResponse.status}: ${errorText}`);
    }
    const formatData = await formatResponse.json();
    const rawJsonResult = formatData.content[0].text;
    
    const jsonMatch = rawJsonResult.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
    if (!jsonMatch) {
      throw new Error("The formatting AI returned data in an unexpected format.");
    }
    
    const finalJsonString = jsonMatch[0];

    return new NextResponse(JSON.stringify({
      success: true,
      result: finalJsonString,
      processingTime: Date.now() - startTime
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});

  } catch (error) {
    console.error('Pivot endpoint error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    return new NextResponse(JSON.stringify({
      success: false,
      error: errorMessage,
      processingTime: Date.now() - startTime
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  }
}