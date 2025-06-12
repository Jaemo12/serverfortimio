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


// --- HELPER FUNCTIONS FOR THE NEW STRATEGY ---

// Step 1: Use Claude Haiku to quickly analyze the article text and extract its core topic.
async function getArticleTopic(content: string): Promise<string> {
    const analysisPrompt = `Analyze the following article text and identify its main subject in a short, neutral phrase of 5-10 words. Example output: "US inflation and federal interest rate policy".\n\nARTICLE TEXT:\n${content}`;
    const response = await fetch(CLAUDE_API_URL, {
        method: 'POST',
        headers: { 'x-api-key': CLAUDE_API_KEY!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
            model: 'claude-3-haiku-20240307',
            max_tokens: 50,
            messages: [{ role: 'user', content: analysisPrompt }],
            temperature: 0.1,
        }),
    });
    if (!response.ok) throw new Error('Step 1 (Analysis) failed');
    const data = await response.json();
    return data.content[0].text;
}

// Step 2: Use Perplexity to perform a simple, fast keyword search.
async function performSearch(query: string): Promise<string> {
    const response = await fetch(PERPLEXITY_API_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${PERPLEXITY_API_KEY!}`, 'accept': 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: "llama-3.1-sonar-small-32k-online", // Using the fast online model
        messages: [{ role: "user", content: `Find one or two relevant articles for the query: "${query}". For each, list its title and full URL on a new line.` }],
        max_tokens: 1024,
      }),
    });
    if (!response.ok) return ""; // Fail gracefully if one search fails
    const data = await response.json();
    return data.choices[0].message.content;
}

// Step 3: Use Claude Haiku to reliably format the combined text into clean JSON.
async function formatResultsAsJson(text: string): Promise<string> {
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
${text}`;

    const response = await fetch(CLAUDE_API_URL, {
        method: 'POST',
        headers: { 'x-api-key': CLAUDE_API_KEY!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
            model: "claude-3-haiku-20240307",
            max_tokens: 2048,
            messages: [{ role: "user", content: formatPrompt }],
            temperature: 0.0,
        }),
    });
    if (!response.ok) throw new Error('Step 3 (Formatting) failed');
    const data = await response.json();
    const rawJsonResult = data.content[0].text;
    const jsonMatch = rawJsonResult.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
    if (!jsonMatch) throw new Error("The formatting AI returned data in an unexpected format.");
    return jsonMatch[0];
}


// --- MAIN API ROUTE ---
export async function POST(req: Request) {
  const startTime = Date.now();
  
  try {
    // This API route now requires the full text content of the article
    const { content }: RequestBody = await req.json();
    if (!content || content.trim() === '') { throw new Error('Article content is required'); }
    if (!PERPLEXITY_API_KEY || !CLAUDE_API_KEY) { throw new Error('API keys are not configured'); }

    // --- EXECUTE THE 3-STEP STRATEGY ---
    
    // 1. ANALYZE: Get the topic from the article text.
    const truncatedContent = content.substring(0, 4000); // Use a portion of the text for analysis
    const topic = await getArticleTopic(truncatedContent);

    // 2. SEARCH: Create simple search queries and run them in parallel.
    const searchQueries = [
        `criticism of "${topic}"`,
        `arguments against "${topic}"`,
        `support for "${topic}"`,
        `positive perspective on "${topic}"`
    ];
    const searchPromises = searchQueries.map(query => performSearch(query));
    const searchResults = await Promise.all(searchPromises);
    const combinedPlainText = searchResults.join('\n');

    // 3. FORMAT: Take the messy search results and format them into clean JSON.
    const finalJsonString = await formatResultsAsJson(combinedPlainText);

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