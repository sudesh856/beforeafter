const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add support for file extensions
config.resolver.assetExts.push(
  // Images
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  // Fonts
  '.ttf',
  '.otf',
  // Audio
  '.mp3',
  '.wav',
  '.m4a',
  // Video
  '.mp4',
  '.mov',
  '.avi',
  // Data files
  '.json',
  '.txt'
);

// Add support for source extensions
config.resolver.sourceExts.push('jsx', 'js', 'ts', 'tsx', 'json');

// Configure transformer
config.transformer.minifierConfig = {
  keep_fnames: true,
  mangle: {
    keep_fnames: true,
  },
};

module.exports = config;
