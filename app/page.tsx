'use client';

import { useState } from 'react';

// A simple component to render the markdown-like response
const ResultDisplay = ({ content }: { content: string }) => {
  const sections = content.split('**').filter(Boolean); // Split by ** and remove empty strings
  return (
    <div className="space-y-4">
      {sections.map((section, index) => {
        if (index % 2 === 0) {
          // This is the title (e.g., "Main Arguments:")
          return <h3 key={index} className="text-lg font-semibold text-white">{section.trim()}</h3>;
        } else {
          // This is the content that follows the title
          return <div key={index} className="pl-4 text-gray-300 whitespace-pre-wrap">{section.trim()}</div>;
        }
      })}
    </div>
  );
};

export default function HomePage() {
  const [content, setContent] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (apiEndpoint: '/api/summarize' | '/api/insights') => {
    if (!content.trim()) {
      setError('Please paste some article content first.');
      return;
    }
    setIsLoading(true);
    setResult(null);
    setError(null);

    try {
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'An unknown error occurred.');
      }

      setResult(data.result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center p-8 sm:p-12 md:p-24 bg-gray-900 text-white">
      <div className="z-10 w-full max-w-4xl items-center justify-between text-sm lg:flex mb-8">
        <h1 className="text-4xl font-bold text-center w-full">Claude API Interface</h1>
      </div>

      <div className="w-full max-w-4xl">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Paste the article content here..."
          className="w-full h-64 p-4 rounded-lg bg-gray-800 border border-gray-600 focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
          disabled={isLoading}
        />
        <div className="flex justify-center gap-4 mt-4">
          <button
            onClick={() => handleSubmit('/api/summarize')}
            disabled={isLoading}
            className="px-6 py-2 bg-blue-600 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-500 transition-colors"
          >
            {isLoading ? 'Processing...' : 'Get Summary'}
          </button>
          <button
            onClick={() => handleSubmit('/api/insights')}
            disabled={isLoading}
            className="px-6 py-2 bg-green-600 rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-500 transition-colors"
          >
            {isLoading ? 'Processing...' : 'Get Insights'}
          </button>
        </div>

        {error && (
          <div className="mt-6 p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-300">
            <strong>Error:</strong> {error}
          </div>
        )}

        {result && (
          <div className="mt-6 p-6 bg-gray-800/80 border border-gray-700 rounded-lg">
            <h2 className="text-2xl font-bold mb-4">Result</h2>
            {/* Simple check to see if we should use special formatting for insights */}
            {result.includes('**') ? <ResultDisplay content={result} /> : <div className="whitespace-pre-wrap">{result}</div>}
          </div>
        )}
      </div>
    </main>
  );
}