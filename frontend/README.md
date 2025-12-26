# TIMIO News Chrome Extension

A Chrome extension that helps users detect bias in news articles and discover different perspectives on the same story.

## Features

- **Torch (Bias Detection)**: AI-powered analysis that identifies potential bias in news articles, including assessment of source diversity, framing, and factual gaps.
- **Pivot (Read Different Views)**: Discover related articles from different sources to get multiple perspectives on the same story.
- **Side Panel**: Quick access to TIMIO features while browsing any news article.
- **Floating Action Button**: Easy-to-use interface that appears on supported news sites.

## Development Setup

### Prerequisites

- Node.js (v16 or higher)
- npm
- Google Chrome browser

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd Timio_Chrome_Extension
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the extension:
   ```bash
   npm run build
   ```

### Loading the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `build` folder from this project

### Development Workflow

1. Make changes to source files in the `src/` directory
2. Rebuild the extension:
   ```bash
   npm run build
   ```
3. Go to `chrome://extensions/` and click the refresh icon on the TIMIO extension
4. Test your changes on a news article

### Project Structure

```
src/
├── manifest.json          # Chrome extension manifest
├── pages/
│   ├── Background/        # Service worker scripts
│   ├── Content/           # Content scripts (injected into pages)
│   ├── Popup/             # Extension popup UI
│   └── sidepanel/         # Side panel UI
└── assets/
    └── img/               # Images and icons
```

### Key Files

- `src/pages/Background/background.simplified.js` - Main background service worker
- `src/pages/Content/index.js` - Content script for article analysis
- `src/pages/Content/content.styles.css` - Styles for injected UI
- `webpack.config.js` - Build configuration

## Testing

1. Load the extension in Chrome (see above)
2. Navigate to a news article (e.g., from Washington Post, NY Times, etc.)
3. Click the TIMIO floating button or use the side panel
4. Test both "Bias Detection" and "Read Different Views" features

## Build for Production

```bash
npm run build
```

The production-ready extension will be in the `build/` folder.
