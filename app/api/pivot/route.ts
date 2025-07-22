import { NextResponse } from 'next/server';

export const config = {
    runtime: 'edge',
};

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

// Free APIs - Add these to your environment variables
const BRAVE_API_KEY = process.env.BRAVE_API_KEY; // Free: 2000 queries/month
const NEWSAPI_KEY = process.env.NEWSAPI_KEY; // Free: 500/month (backup)
const GNEWS_API_KEY = process.env.GNEWS_API_KEY; // Free: 100/day (backup)

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
    content: string;
    url: string;
}

interface BraveNewsResult {
    title: string;
    url: string;
    description: string;
    age?: string;
    thumbnail?: {
        src: string;
    };
    meta_url?: {
        netloc: string;
    };
}

interface NewsAPIResult {
    title: string;
    url: string;
    description: string;
    urlToImage?: string;
    publishedAt: string;
    source: {
        name: string;
    };
}

interface GNewsResult {
    title: string;
    url: string;
    description: string;
    image?: string;
    publishedAt: string;
    source: {
        name: string;
    };
}

interface ProcessedArticle {
    title: string;
    url: string;
    pubDate: string;
    authorsByline: string | null;
    imageUrl: string | null;
    description: string;
    source: {
        domain: string;
        name: string;
    };
    score: number;
}

async function searchWithBrave(query: string, originalDomain: string): Promise<ProcessedArticle[]> {
    if (!BRAVE_API_KEY) {
        throw new Error('Brave API key not configured');
    }

    try {
        // Construct URL with search parameters
        const url = new URL('https://api.search.brave.com/res/v1/news/search');
        url.searchParams.append('q', query);
        url.searchParams.append('count', '10');
        url.searchParams.append('freshness', 'pw'); // Past week
        url.searchParams.append('text_decorations', 'false');

        const braveResponse = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                'X-Subscription-Token': BRAVE_API_KEY,
                'Accept': 'application/json',
            },
        });

        if (!braveResponse.ok) {
            throw new Error(`Brave API error: ${braveResponse.status}`);
        }

        const data = await braveResponse.json();
        console.log('Brave search results:', data);

        if (!data.results || !Array.isArray(data.results)) {
            return [];
        }

        return data.results
            .filter((result: BraveNewsResult) => {
                try {
                    const resultDomain = new URL(result.url).hostname.replace('www.', '');
                    return resultDomain !== originalDomain;
                } catch {
                    return false;
                }
            })
            .map((result: BraveNewsResult): ProcessedArticle => {
                const domain = (() => {
                    try {
                        return new URL(result.url).hostname.replace('www.', '');
                    } catch {
                        return result.meta_url?.netloc || 'unknown.com';
                    }
                })();

                const sourceName = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);

                // Get image URL
                let imageUrl: string | null = null;
                if (result.thumbnail?.src) {
                    imageUrl = result.thumbnail.src;
                } else {
                    // Fallback to Microlink
                    imageUrl = `https://api.microlink.io/?url=${encodeURIComponent(result.url)}&meta=false&embed=image.url`;
                }

                return {
                    title: result.title || 'No title',
                    url: result.url,
                    pubDate: result.age || new Date().toISOString(),
                    authorsByline: null,
                    imageUrl: imageUrl,
                    description: result.description || '',
                    source: {
                        domain: domain,
                        name: sourceName
                    },
                    score: 0.8 // High score for Brave results
                };
            });

    } catch (error) {
        console.error('Brave search failed:', error);
        return [];
    }
}

async function searchWithNewsAPI(query: string, originalDomain: string): Promise<ProcessedArticle[]> {
    if (!NEWSAPI_KEY) {
        console.log('NewsAPI key not available, skipping');
        return [];
    }

    try {
        const url = new URL('https://newsapi.org/v2/everything');
        url.searchParams.append('q', query);
        url.searchParams.append('sortBy', 'relevancy');
        url.searchParams.append('language', 'en');
        url.searchParams.append('pageSize', '5');
        url.searchParams.append('apiKey', NEWSAPI_KEY);

        const response = await fetch(url.toString());
        
        if (!response.ok) {
            throw new Error(`NewsAPI error: ${response.status}`);
        }

        const data = await response.json();

        if (!data.articles || !Array.isArray(data.articles)) {
            return [];
        }

        return data.articles
            .filter((article: NewsAPIResult) => {
                try {
                    const resultDomain = new URL(article.url).hostname.replace('www.', '');
                    return resultDomain !== originalDomain;
                } catch {
                    return false;
                }
            })
            .map((article: NewsAPIResult): ProcessedArticle => {
                const domain = (() => {
                    try {
                        return new URL(article.url).hostname.replace('www.', '');
                    } catch {
                        return 'unknown.com';
                    }
                })();

                let imageUrl: string | null = null;
                if (article.urlToImage) {
                    imageUrl = article.urlToImage;
                } else {
                    imageUrl = `https://api.microlink.io/?url=${encodeURIComponent(article.url)}&meta=false&embed=image.url`;
                }

                return {
                    title: article.title || 'No title',
                    url: article.url,
                    pubDate: article.publishedAt || new Date().toISOString(),
                    authorsByline: null,
                    imageUrl: imageUrl,
                    description: article.description || '',
                    source: {
                        domain: domain,
                        name: article.source.name || domain
                    },
                    score: 0.6 // Lower score for NewsAPI
                };
            });

    } catch (error) {
        console.error('NewsAPI search failed:', error);
        return [];
    }
}

async function searchWithGNews(query: string, originalDomain: string): Promise<ProcessedArticle[]> {
    if (!GNEWS_API_KEY) {
        console.log('GNews API key not available, skipping');
        return [];
    }

    try {
        const url = new URL('https://gnews.io/api/v4/search');
        url.searchParams.append('q', query);
        url.searchParams.append('lang', 'en');
        url.searchParams.append('country', 'us');
        url.searchParams.append('max', '5');
        url.searchParams.append('apikey', GNEWS_API_KEY);

        const response = await fetch(url.toString());
        
        if (!response.ok) {
            throw new Error(`GNews API error: ${response.status}`);
        }

        const data = await response.json();

        if (!data.articles || !Array.isArray(data.articles)) {
            return [];
        }

        return data.articles
            .filter((article: GNewsResult) => {
                try {
                    const resultDomain = new URL(article.url).hostname.replace('www.', '');
                    return resultDomain !== originalDomain;
                } catch {
                    return false;
                }
            })
            .map((article: GNewsResult): ProcessedArticle => {
                const domain = (() => {
                    try {
                        return new URL(article.url).hostname.replace('www.', '');
                    } catch {
                        return 'unknown.com';
                    }
                })();

                let imageUrl: string | null = null;
                if (article.image) {
                    imageUrl = article.image;
                } else {
                    imageUrl = `https://api.microlink.io/?url=${encodeURIComponent(article.url)}&meta=false&embed=image.url`;
                }

                return {
                    title: article.title || 'No title',
                    url: article.url,
                    pubDate: article.publishedAt || new Date().toISOString(),
                    authorsByline: null,
                    imageUrl: imageUrl,
                    description: article.description || '',
                    source: {
                        domain: domain,
                        name: article.source.name || domain
                    },
                    score: 0.7 // Medium score for GNews
                };
            });

    } catch (error) {
        console.error('GNews search failed:', error);
        return [];
    }
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

        if (!CLAUDE_API_KEY) {
            throw new Error('Claude API key is not configured on the server.');
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
                model: "claude-sonnet-4-20250514", // Updated to Claude Sonnet 4
                max_tokens: 500,
                messages: [{ role: "user", content: analysisPrompt }],
                temperature: 0.5,
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
            throw new Error("Claude returned unparseable JSON for analysis. Raw response: " + rawJsonResult.substring(0, 200));
        }

        const { core_subject: mainTopic, opposing_terms: opposingKeywords } = parsedAnalysisData;

        if (!mainTopic) {
            throw new Error("Could not extract main topic from Claude's analysis.");
        }

        console.log("Extracted Main Topic (Core Subject):", mainTopic);
        console.log("Suggested Opposing Keywords:", opposingKeywords);

        // --- STEP 2: Search using multiple free APIs ---
        const originalDomain = new URL(originalArticleUrl).hostname.replace('www.', '');

        // Create search queries
        const searchQueries = [];
        if (opposingKeywords && opposingKeywords.length > 0) {
            searchQueries.push(`${mainTopic} ${opposingKeywords.slice(0, 2).join(' ')}`);
            searchQueries.push(`${mainTopic} criticism debate controversy`);
        }
        searchQueries.push(`${mainTopic} alternative viewpoint different perspective`);

        console.log("Search queries:", searchQueries);

        // Search with multiple APIs in parallel
        let allArticles: ProcessedArticle[] = [];

        for (const query of searchQueries.slice(0, 2)) {
            try {
                // Try Brave first (best free API)
                const braveResults = await searchWithBrave(query, originalDomain);
                allArticles = allArticles.concat(braveResults);

                // If Brave doesn't return enough results, try backups
                if (braveResults.length < 3) {
                    const newsApiResults = await searchWithNewsAPI(query, originalDomain);
                    allArticles = allArticles.concat(newsApiResults);

                    if (braveResults.length + newsApiResults.length < 3) {
                        const gNewsResults = await searchWithGNews(query, originalDomain);
                        allArticles = allArticles.concat(gNewsResults);
                    }
                }

                // Small delay between queries
                await new Promise(resolve => setTimeout(resolve, 200));

            } catch (error) {
                console.error(`Error with search for query "${query}":`, error);
                continue;
            }
        }

        // Remove duplicates and sort by relevance score
        const uniqueArticles = allArticles
            .filter((article, index, self) =>
                index === self.findIndex(a => a.url === article.url)
            )
            .sort((a, b) => (b.score || 0) - (a.score || 0))
            .slice(0, 4); // Limit to top 4 articles

        console.log(`Found ${uniqueArticles.length} unique relevant articles`);
        console.log(`Articles with images: ${uniqueArticles.filter(a => a.imageUrl).length}`);

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

    } catch (error) {
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
