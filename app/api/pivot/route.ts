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

export async function OPTIONS(req: Request) {
    return new NextResponse(null, {
        status: 200,
        headers: corsHeaders,
    });
}

interface RequestBody {
  content?: string;
  title?: string;
}

// This interface defines the structured data for a single article
interface PivotArticle {
    title: string;
    url: string;
    source_name: string;
    summary: string;
}

// This interface uses PivotArticle and defines the entire expected response
interface PivotResponse {
    left_perspective: PivotArticle;
    right_perspective: PivotArticle;
}

export async function POST(req: Request) {
  if (!PERPLEXITY_API_KEY) {
    return new NextResponse(JSON.stringify({ success: false, error: 'Perplexity API key not configured on server.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const { content }: RequestBody = await req.json();

    if (!content || content.trim() === '') {
      return new NextResponse(JSON.stringify({ success: false, error: 'Content is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const truncatedContent = content.substring(0, 4000);

    const systemPrompt = `You are an expert political analyst and research assistant. Your task is to analyze the provided article text, identify its core topic, and then find two other articles on the same topic from different points of view. Respond with ONLY a single, minified JSON object with no other text, explanations, or markdown. The JSON object must have the structure: {"left_perspective": {"title": "Article Title", "url": "...", "source_name": "...", "summary": "..."}, "right_perspective": {"title": "Article Title", "url": "...", "source_name": "...", "summary": "..."}}`;

    const response = await fetch(PERPLEXITY_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3-sonar-large-32k-online',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Here is the article text:\n\n---\n\n${truncatedContent}` }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Perplexity API Error:', errorText);
      throw new Error(`Perplexity API failed with status ${response.status}`);
    }

    const data = await response.json();
    const resultText = data.choices[0].message.content;

    let pivotData: PivotResponse;
    try {
        // Here we parse the text and assert its type to PivotResponse
        pivotData = JSON.parse(resultText) as PivotResponse;
    } catch { // The unused 'parseError' variable is removed here
        console.error("Failed to parse JSON from Perplexity response:", resultText);
        throw new Error("The analysis service returned an invalid format.");
    }

    return new NextResponse(JSON.stringify({
      success: true,
      pivot: pivotData,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Pivot endpoint error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    return new NextResponse(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}