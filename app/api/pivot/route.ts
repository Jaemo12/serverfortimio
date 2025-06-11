import { NextResponse } from 'next/server';

export const config = {
  runtime: 'edge',
}

// Securely access the API key from environment variables
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';

interface RequestBody {
  content?: string;
  title?: string;
}

// This interface defines the structured data we want Perplexity to return
interface PivotArticle {
    title: string;
    url: string;
    source_name: string;
    summary: string;
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

    // Truncate content to stay within reasonable token limits
    const truncatedContent = content.substring(0, 4000);

    // This detailed prompt instructs Perplexity to act as a research assistant
    // and return a structured JSON object.
    const systemPrompt = `You are an expert political analyst and research assistant. Your task is to analyze the provided article text, identify its core topic, and then find two other articles on the same topic from different points of view.

    1.  **Analyze the article:** Read the user's provided text to understand the main subject matter.
    2.  **Find a left-leaning perspective:** Search the web to find a news article or opinion piece that covers the same topic from a progressive or left-leaning viewpoint.
    3.  **Find a right-leaning perspective:** Search the web to find a news article or opinion piece that covers the same topic from a conservative or right-leaning viewpoint.
    4.  **Format the output:** Respond with ONLY a single, minified JSON object. Do not include any other text, explanations, or markdown formatting. The JSON object must have the following structure:
        {
          "left_perspective": {
            "title": "Article Title",
            "url": "https://example.com/left-article",
            "source_name": "Source Name (e.g., The Guardian)",
            "summary": "A brief, neutral summary of the article's main points."
          },
          "right_perspective": {
            "title": "Article Title",
            "url": "https://example.com/right-article",
            "source_name": "Source Name (e.g., The Wall Street Journal)",
            "summary": "A brief, neutral summary of the article's main points."
          }
        }
    `;

    const response = await fetch(PERPLEXITY_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3-sonar-large-32k-online', // A powerful model with web access
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Here is the article text:\n\n---\n\n${truncatedContent}` }
        ],
        // The API might not support a dedicated JSON mode, so we rely on the prompt.
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Perplexity API Error:', errorText);
      throw new Error(`Perplexity API failed with status ${response.status}`);
    }

    const data = await response.json();
    const resultText = data.choices[0].message.content;

    // Try to parse the string content into a JSON object
    let pivotData;
    try {
        pivotData = JSON.parse(resultText);
    } catch (parseError) {
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