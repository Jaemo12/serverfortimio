import { NextResponse } from 'next/server';

export const config = {
    runtime: 'edge',
};

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const TAVILY_API_URL = 'https://api.tavily.com/search';

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
    content: string; // The clean_text of the original article
    url: string;     // The URL of the original article
}

interface TavilyResult {
    title?: string;
    url: string;
    published_date?: string;
    content?: string;
    score?: number;
}

interface ProcessedArticle {
    title: string;
    url: string;
    pubDate: string;
    authorsByline: null;
    imageUrl: null;
    description: string;
    source: {
        domain: string;
        name: string;
    };
    tavilyScore: number;
}

export async function POST(req: Request) {
    const startTime = Date.now();

    try {
        const { content: originalArticleContent, url: originalArticleUrl }: RequestBody = await req.json();

        if (!originalArticleUrl || !originalArticleUrl.trim()) {
            throw new Error('Original article URL is required');
        }
        if (!originalArticleContent || originalArticleContent.trim().length === 0) {
            throw new Error('Original article content is required for analysis.');
        }

        if (!TAVILY_API_KEY || !CLAUDE_API_KEY) {
            throw new Error('An API key for Tavily or Claude is not configured on the server.');
        }

        // --- STEP 1: Use Claude to extract the main topic & generate opposing keywords ---
        const analysisPrompt = `You are an expert article analyzer. Your task is to identify the core subject of an article and then generate keywords that represent opposing viewpoints for a news search.

Analyze the following article content:
${originalArticleContent.substring(0, 4000)}

Based on this, identify:
1. The core subject of the article (as a concise phrase, max 10 words). This will be the main search term.
2. Generate 3-5 *short, commonly used* keywords or phrases that capture a *direct opposing viewpoint* or a strong counter-argument to the article's core subject/stance. These should be terms that a journalist or commentator with an opposite view might use.

Provide the output as a JSON object with the following keys: "core_subject" (string) and "opposing_terms" (array of strings). Your response MUST be valid JSON and contain ONLY the JSON object. Do not include any other text, preamble, or markdown formatting (e.g., no \`\`\`json).`;

        const analysisResponse = await fetch(CLAUDE_API_URL, {
            method: 'POST',
            headers: {
                'x-api-key': CLAUDE_API_KEY,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                model: "claude-3-haiku-20240307",
                max_tokens: 500,
                messages: [{ role: "user", content: analysisPrompt }],
                temperature: 0.1,
            }),
        });

        if (!analysisResponse.ok) {
            const errorText = await analysisResponse.text();
            console.error('Claude API error response:', errorText);
            throw new Error(`Claude analysis step failed with status ${analysisResponse.status}: ${errorText}`);
        }

        const data = await analysisResponse.json();
        const rawJsonResult = data.content[0].text;

        let parsedAnalysisData;
        try {
            parsedAnalysisData = JSON.parse(rawJsonResult);
        } catch (parseError) {
            console.error("Failed to parse Claude's raw JSON output:", rawJsonResult, parseError);
            // Use 'parseError' for logging, but don't define 'e' if it's not used elsewhere.
            throw new Error("Claude returned unparseable JSON for analysis. Raw response: " + rawJsonResult.substring(0, 200));
        }

        const { core_subject: mainTopic, opposing_terms: opposingKeywords } = parsedAnalysisData;

        if (!mainTopic) {
            throw new Error("Could not extract main topic from Claude's analysis.");
        }
        if (!opposingKeywords || !Array.isArray(opposingKeywords) || opposingKeywords.length === 0) {
            console.warn("Claude did not return valid opposing keywords. Proceeding with topic only.");
        }

        console.log("Extracted Main Topic (Core Subject):", mainTopic);
        console.log("Suggested Opposing Keywords:", opposingKeywords);

        // --- STEP 2: Use Tavily AI to search for opposing viewpoints ---
        const originalDomain = new URL(originalArticleUrl).hostname.replace('www.', '');

        // Create search queries for Tavily
        // CHANGE 1: Changed 'let' to 'const' for 'searchQueries' as it's not reassigned.
        const searchQueries = [];

        // Primary search with opposing terms
        if (opposingKeywords && opposingKeywords.length > 0) {
            searchQueries.push(`${mainTopic} ${opposingKeywords.slice(0, 2).join(' ')}`);
            searchQueries.push(`${mainTopic} criticism debate controversy`);
        }

        // Alternative perspective search
        searchQueries.push(`${mainTopic} alternative viewpoint different perspective`);
        searchQueries.push(`${mainTopic} opposing opinion counter argument`);

        console.log("Tavily search queries:", searchQueries);

        // Perform multiple Tavily searches to get diverse results
        let allArticles: ProcessedArticle[] = [];

        for (const query of searchQueries.slice(0, 2)) { // Limit to 2 searches to avoid rate limits
            try {
                const tavilyResponse = await fetch(TAVILY_API_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        api_key: TAVILY_API_KEY,
                        query: query,
                        search_depth: "basic", // or "advanced" for more thorough search
                        include_images: false,
                        include_answer: false,
                        max_results: 5,
                        include_domains: [
                            "bbc.com", "cnn.com", "reuters.com", "apnews.com",
                            "npr.org", "politico.com", "wsj.com", "nytimes.com",
                            "washingtonpost.com", "foxnews.com", "theguardian.com",
                            "usatoday.com", "abcnews.go.com", "cbsnews.com", "nbcnews.com"
                        ],
                        exclude_domains: [originalDomain], // Exclude the original article's domain
                        include_raw_content: false // Set to true if you need full content
                    })
                });

                if (!tavilyResponse.ok) {
                    const errorText = await tavilyResponse.text();
                    console.error(`Tavily API error for query "${query}":`, errorText);
                    continue; // Skip this query and try the next one
                }

                const tavilyResult = await tavilyResponse.json();
                console.log(`Tavily results for query "${query}":`, tavilyResult);

                if (tavilyResult.results && Array.isArray(tavilyResult.results)) {
                    const articlesFromQuery = tavilyResult.results
                        .filter((result: TavilyResult) => {
                            // Filter out articles from the original domain
                            try {
                                const resultDomain = new URL(result.url).hostname.replace('www.', '');
                                return resultDomain !== originalDomain;
                            } catch (errorFiltering) { // CHANGE 2: Renamed 'e' to 'errorFiltering' for clarity/use
                                // The variable 'errorFiltering' is used within this catch block for logging if needed,
                                // but we're returning false directly here, so ESLint might still complain if not used explicitly.
                                // It's better to explicitly ignore if not used, or use it.
                                console.warn("Error parsing URL for filtering:", result.url, errorFiltering); // Example of using it
                                return false;
                            }
                        })
                        .map((result: TavilyResult): ProcessedArticle => ({
                            title: result.title || 'No title',
                            url: result.url,
                            pubDate: result.published_date || new Date().toISOString(),
                            authorsByline: null,
                            imageUrl: null,
                            description: result.content ? result.content.substring(0, 200) + '...' : '',
                            source: {
                                domain: (() => {
                                    try {
                                        return new URL(result.url).hostname.replace('www.', '');
                                    } catch (errorDomain) { // CHANGE 3: Renamed 'e' to 'errorDomain'
                                        console.warn("Error extracting domain from URL:", result.url, errorDomain);
                                        return 'Unknown Domain';
                                    }
                                })(),
                                name: (() => {
                                    try {
                                        const domain = new URL(result.url).hostname.replace('www.', '');
                                        return domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
                                    } catch (errorName) { // CHANGE 4: Renamed 'e' to 'errorName'
                                        console.warn("Error extracting source name from URL:", result.url, errorName);
                                        return 'Unknown Source';
                                    }
                                })()
                            },
                            tavilyScore: result.score || 0 // Tavily's relevance score
                        }));

                    allArticles = allArticles.concat(articlesFromQuery);
                }

                // Small delay between requests to be respectful
                await new Promise(resolve => setTimeout(resolve, 100));

            } catch (error) { // This 'error' is used in console.error, so it's fine.
                console.error(`Error with Tavily search for query "${query}":`, error);
                continue;
            }
        }

        // Remove duplicates and sort by relevance score
        const uniqueArticles = allArticles
            .filter((article, index, self) =>
                index === self.findIndex(a => a.url === article.url)
            )
            .sort((a, b) => (b.tavilyScore || 0) - (a.tavilyScore || 0))
            .slice(0, 4); // Limit to top 4 articles

        console.log(`Found ${uniqueArticles.length} unique relevant articles from Tavily`);

        // If no articles found, provide a fallback
        if (uniqueArticles.length === 0) {
            return new NextResponse(JSON.stringify({
                success: true,
                result: [],
                searchQuery: searchQueries.join(' | '),
                mainTopic: mainTopic,
                opposingKeywords: opposingKeywords,
                message: "No opposing viewpoint articles found for this topic.",
                processingTime: Date.now() - startTime
            }), {
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json'
                }
            });
        }

        return new NextResponse(JSON.stringify({
            success: true,
            result: uniqueArticles,
            searchQuery: searchQueries.join(' | '),
            mainTopic: mainTopic,
            opposingKeywords: opposingKeywords,
            totalArticlesFound: allArticles.length,
            processingTime: Date.now() - startTime
        }), {
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
            }
        });

    } catch (error) { // This 'error' is used in console.error and to extract errorMessage.
        console.error('Pivot endpoint error:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';

        return new NextResponse(JSON.stringify({
            success: false,
            error: errorMessage,
            processingTime: Date.now() - startTime
        }), {
            status: 500,
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
            }
        });
    }
}