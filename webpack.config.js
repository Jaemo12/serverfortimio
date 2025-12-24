var webpack = require('webpack'),
  path = require('path'),
  fileSystem = require('fs-extra'),
  env = require('./utils/env'),
  CopyWebpackPlugin = require('copy-webpack-plugin'),
  HtmlWebpackPlugin = require('html-webpack-plugin'),
  TerserPlugin = require('terser-webpack-plugin');
var { CleanWebpackPlugin } = require('clean-webpack-plugin');

const ASSET_PATH = process.env.ASSET_PATH || '/';

var alias = {
  'react-dom': '@hot-loader/react-dom',
};

// load the secrets
var secretsPath = path.join(__dirname, 'secrets.' + env.NODE_ENV + '.js');

var fileExtensions = [
  'jpg',
  'jpeg',
  'png',
  'gif',
  'eot',
  'otf',
  'svg',
  'ttf',
  'woff',
  'woff2',
];

if (fileSystem.existsSync(secretsPath)) {
  alias['secrets'] = secretsPath;
}

var options = {
  mode: process.env.NODE_ENV || 'development',
  entry: {
    popup: path.join(__dirname, 'src', 'pages', 'Popup', 'index.jsx'),
    background: path.join(__dirname, 'src', 'pages', 'Background', 'index.js'),
    content: path.join(__dirname, 'src', 'pages', 'Content', 'index.js'),
    backgroundSimplified: path.join(__dirname, 'src', 'pages', 'Background', 'background.simplified.js'),
    // Sidepanel is NOT bundled - copied as raw JS file instead (to match 1.5.4.1)
  },
  output: {
    filename: '[name].bundle.js',
    path: path.resolve(__dirname, 'build'),
    clean: true,
    publicPath: ASSET_PATH,
  },
  module: {
    rules: [
      {
        test: /\.(css|scss)$/,
        use: [
          { loader: 'style-loader' },
          { loader: 'css-loader' },
        ],
      },
      {
        // Handle image and asset files (excluding JSON)
        test: new RegExp('.(' + fileExtensions.join('|') + ')$'),
        type: 'asset/resource',
        exclude: /node_modules/,
        generator: {
            filename: 'assets/img/[name][ext]',
        }
      },
      {
        test: /\.html$/,
        loader: 'html-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.(ts|tsx)$/,
        loader: 'ts-loader',
        exclude: /node_modules/
      },
      {
        test: /\.(js|jsx)$/,
        use: [
          { loader: 'source-map-loader' },
          { loader: 'babel-loader' },
        ],
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    alias: alias,
    extensions: fileExtensions
      .map((extension) => '.' + extension)
      .concat(['.js', '.jsx', '.ts', '.tsx', '.css']),
  },
  plugins: [
    new CleanWebpackPlugin({ verbose: false }),
    new webpack.ProgressPlugin(),
    new webpack.EnvironmentPlugin({
        NODE_ENV: process.env.NODE_ENV || 'development',
    }),
    new webpack.HotModuleReplacementPlugin(),

    new CopyWebpackPlugin({
      patterns: [
        // 1. Copy manifest.json with version injection (formatted with 3-space indent to match 1.5.4.1)
        {
          from: 'src/manifest.json',
          to: path.join(__dirname, 'build'),
          force: true,
          transform: function (content) {
            return Buffer.from(
              JSON.stringify({
                description: process.env.npm_package_description,
                version: process.env.npm_package_version,
                ...JSON.parse(content.toString()),
              }, null, 3)
            );
          },
        },

        // 2. Copy extension icons and images to build root (as referenced in manifest)
        {
          from: 'src/assets/img/TIMIOCircle128.png',
          to: path.join(__dirname, 'build', 'TIMIOCircle128.png'),
          force: true
        },
        {
          from: 'src/assets/img/Torch_Icon.png',
          to: path.join(__dirname, 'build', 'Torch_Icon.png'),
          force: true
        },
        {
          from: 'src/assets/img/Pivot_Icon.png',
          to: path.join(__dirname, 'build', 'Pivot_Icon.png'),
          force: true
        },
        {
          from: 'src/assets/img/icon-128.png',
          to: path.join(__dirname, 'build', 'icon-128.png'),
          force: true,
          noErrorOnMissing: true
        },
        {
          from: 'src/assets/img/icon-34.png',
          to: path.join(__dirname, 'build', 'icon-34.png'),
          force: true,
          noErrorOnMissing: true
        },
        {
          from: 'src/assets/img/Union.png',
          to: path.join(__dirname, 'build', 'Union.png'),
          force: true,
          noErrorOnMissing: true
        },
        {
          from: 'src/assets/img/ARROW48.png',
          to: path.join(__dirname, 'build', 'ARROW48.png'),
          force: true,
          noErrorOnMissing: true
        },
        {
          from: 'src/assets/img/Vector.png',
          to: path.join(__dirname, 'build', 'Vector.png'),
          force: true,
          noErrorOnMissing: true
        },
        {
          from: 'src/assets/img/hand.png',
          to: path.join(__dirname, 'build', 'hand.png'),
          force: true,
          noErrorOnMissing: true
        },
        {
          from: 'src/assets/img/cup.png',
          to: path.join(__dirname, 'build', 'cup.png'),
          force: true,
          noErrorOnMissing: true
        },
        {
          from: 'src/assets/img/copyIcon.png',
          to: path.join(__dirname, 'build', 'copyIcon.png'),
          force: true,
          noErrorOnMissing: true
        },
        {
          from: 'src/assets/img/close.png',
          to: path.join(__dirname, 'build', 'close.png'),
          force: true,
          noErrorOnMissing: true
        },
        {
          from: 'src/assets/img/setting.png',
          to: path.join(__dirname, 'build', 'setting.png'),
          force: true,
          noErrorOnMissing: true
        },
        {
          from: 'src/assets/img/delete.png',
          to: path.join(__dirname, 'build', 'delete.png'),
          force: true,
          noErrorOnMissing: true
        },
        {
          from: 'src/assets/img/arrow.png',
          to: path.join(__dirname, 'build', 'arrow.png'),
          force: true,
          noErrorOnMissing: true
        },
        {
          from: 'src/assets/img/paste.png',
          to: path.join(__dirname, 'build', 'paste.png'),
          force: true,
          noErrorOnMissing: true
        },
        {
          from: 'src/assets/img/loader.svg',
          to: path.join(__dirname, 'build', 'loader.svg'),
          force: true,
          noErrorOnMissing: true
        },

        // 3. Copy ALL assets/img to build/assets/img (for web_accessible_resources)
        {
          from: 'src/assets/img/',
          to: path.join(__dirname, 'build', 'assets', 'img'),
          force: true,
          noErrorOnMissing: true
        },

        // 4. Copy Lottie animation JSON files to assets/animations/
        {
          from: 'src/assets/animations/',
          to: path.join(__dirname, 'build', 'assets', 'animations'),
          force: true,
          noErrorOnMissing: true
        },

        // 5. Copy required scripts and styles for content scripts
        {
          from: path.join(__dirname, 'src', 'pages', 'sidepanel', 'Lottie.min.js'),
          to: path.join(__dirname, 'build', 'lottie.min.js'),
          force: true,
          noErrorOnMissing: true
        },
        {
          from: path.join(__dirname, 'src', 'pages', 'sidepanel', 'Lottie_Manager.js'),
          to: path.join(__dirname, 'build', 'lottie-manager.js'),
          force: true,
          noErrorOnMissing: true
        },
        {
          from: path.join(__dirname, 'src', 'pages', 'Content', 'content.styles.css'),
          to: path.join(__dirname, 'build', 'content.styles.css'),
          force: true
        },

        // 6. Copy sidepanel files (NOT bundled - raw JS, CSS, HTML to match 1.5.4.1)
        {
          from: path.join(__dirname, 'src', 'pages', 'sidepanel', 'sidepanel.js'),
          to: path.join(__dirname, 'build', 'sidepanel.js'),
          force: true
        },
        {
          from: path.join(__dirname, 'src', 'pages', 'sidepanel', 'sidepanel.css'),
          to: path.join(__dirname, 'build', 'sidepanel.css'),
          force: true
        },
        {
          from: path.join(__dirname, 'src', 'pages', 'sidepanel', 'Lottie.min.js'),
          to: path.join(__dirname, 'build', 'Lottie.min.js'),
          force: true,
          noErrorOnMissing: true
        },
        {
          from: path.join(__dirname, 'src', 'pages', 'sidepanel', 'Lottie_Manager.js'),
          to: path.join(__dirname, 'build', 'Lottie_Manager.js'),
          force: true,
          noErrorOnMissing: true
        },
      ],
    }),

    // HTML plugins for popup only
    new HtmlWebpackPlugin({
      template: path.join(__dirname, 'src', 'pages', 'Popup', 'index.html'),
      filename: 'popup.html',
      chunks: ['popup'],
      cache: false,
    }),

    // Sidepanel HTML - copy as-is without injecting bundles
    new HtmlWebpackPlugin({
      template: path.join(__dirname, 'src', 'pages', 'sidepanel', 'sidepanel.html'),
      filename: 'sidepanel.html',
      chunks: [], // Don't inject any bundles
      cache: false,
      inject: false, // Don't inject scripts
      minify: false,
    }),
  ],
  infrastructureLogging: {
    level: 'info',
  },
  watchOptions: {
    ignored: ['**/node_modules/**', '**/build/**'],
  },
};

// Development vs Production configuration
if (env.NODE_ENV === 'development') {
  options.devtool = 'cheap-module-source-map';
} else {
  // Production: enable source maps (to match 1.5.4.1 which has .map files)
  options.devtool = 'source-map';
  options.optimization = {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        extractComments: false,
        terserOptions: {
          compress: {
            drop_console: false, // Keep console logs for debugging
          },
        },
      }),
    ],
  };
}

module.exports = options;
