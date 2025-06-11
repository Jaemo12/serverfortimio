import { NextResponse } from 'next/server';

export const config = {
  runtime: 'edge',
}

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';

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
  content?: string; // Keep content for UI compatibility, but we'll prioritize URL
  url?: string;
}

export async function POST(req: Request) {
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, { status: 200, headers: corsHeaders });
  }
  
  const startTime = Date.now();
  
  try {
    const { content: url }: RequestBody = await req.json();

    if (!url || !url.trim()) {
      return new NextResponse(JSON.stringify({ success: false, error: 'URL (sent as content) is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!PERPLEXITY_API_KEY) {
      return new NextResponse(JSON.stringify({ success: false, error: 'PERPLEXITY_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const prompt = "For the article at the following URL, please provide a list of at least 7 articles that present opposing viewpoints. For each article, give me the title and the direct URL. Please format the entire response as a single, clean JSON array of objects, where each object has a 'title' and 'url' key. Do not include any other text or explanation before or after the JSON array.";

    console.log(`Processing Perplexity request for opposing views on URL: ${url}`);

    const response = await fetch(PERPLEXITY_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'accept': 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: "llama-3.1-sonar-small-128k-online",
        messages: [
            { role: "system", content: "You are an AI assistant that returns data in a structured JSON format." },
            { role: "user", content: `${prompt}\n\nURL: ${url}` }
        ],
        temperature: 0.1
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Perplexity API error:', errorText);
      throw new Error(`Perplexity API failed with status ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const result = data.choices[0].message.content;
    
    const processingTime = Date.now() - startTime;
    console.log(`Perplexity opposing views request completed in ${processingTime}ms`);

    return new NextResponse(JSON.stringify({
      success: true,
      result: result,
      processingTime: processingTime
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});

  } catch (error) {
    console.error('Pivot (Perplexity) endpoint error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    return new NextResponse(JSON.stringify({
      success: false,
      error: errorMessage,
      processingTime: Date.now() - startTime
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  }
}