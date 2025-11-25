#!/usr/bin/env node

/**
 * Colorado Holiday Markets - WordPress Embed Builder
 * 
 * This script combines index.html, styles.css, and script.js into a single
 * self-contained HTML file optimized for WordPress Custom HTML blocks.
 * 
 * Usage: node build.js
 * 
 * Output: colorado-holiday-markets-embed.html
 */

const fs = require('fs');
const path = require('path');

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    blue: '\x1b[34m',
    yellow: '\x1b[33m',
    red: '\x1b[31m'
};

const log = {
    success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
    info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
    warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
    error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`)
};

// Minify CSS
function minifyCSS(css) {
    return css
        // Remove comments
        .replace(/\/\*[\s\S]*?\*\//g, '')
        // Remove whitespace around selectors and properties
        .replace(/\s+/g, ' ')
        .replace(/\s*([{}:;,>+~])\s*/g, '$1')
        // Remove trailing semicolons in rules
        .replace(/;}/g, '}')
        // Remove leading/trailing whitespace
        .trim();
}

// Minify JavaScript
function minifyJS(js) {
    // Remove single-line comments (but NOT // in URLs)
    const lines = js.split('\n');
    const cleanedLines = lines.map(line => {
        // Only remove comments that are actual comments (check if line has http)
        if (line.includes('//') && !line.includes('http')) {
            return line.split('//')[0];
        }
        return line;
    });
    js = cleanedLines.join('\n');
    
    // Remove multi-line comments
    js = js.replace(/\/\*[\s\S]*?\*\//g, '');
    
    // Remove extra whitespace but preserve structure
    js = js.replace(/[ \t]+/g, ' ');  // Multiple spaces to single space
    js = js.replace(/\n\s*/g, ' ');  // Newlines to space
    
    // Remove spaces around operators (safe ones)
    js = js.replace(/ *([{};,=()[\]]) */g, '$1');
    js = js.replace(/([a-zA-Z0-9_])\s+function\s+/g, '$1 function ');
    
    // Add line breaks for readability
    js = js.replace(/;(?=[a-zA-Z])/g, ';\n');
    
    return js.trim();
}

function build() {
    try {
        log.info('Starting build process...\n');

        // Read source files
        log.info('Reading source files...');
        const htmlPath = path.join(__dirname, 'index.html');
        const cssPath = path.join(__dirname, 'styles.css');
        const jsPath = path.join(__dirname, 'script.js');

        if (!fs.existsSync(htmlPath)) throw new Error(`${htmlPath} not found`);
        if (!fs.existsSync(cssPath)) throw new Error(`${cssPath} not found`);
        if (!fs.existsSync(jsPath)) throw new Error(`${jsPath} not found`);

        const htmlContent = fs.readFileSync(htmlPath, 'utf8');
        const cssContent = fs.readFileSync(cssPath, 'utf8');
        const jsContent = fs.readFileSync(jsPath, 'utf8');

        log.success('Source files read');

        // Extract the body content from HTML (remove html, head, external scripts/links)
        log.info('Processing HTML...');
        let bodyContent = htmlContent
            .match(/<body[^>]*>([\s\S]*)<\/body>/i)[1]
            // Remove script tags that load external libraries
            .replace(/<script[^>]*src=[^>]*><\/script>/gi, '')
            // Remove link tags
            .replace(/<link[^>]*>/gi, '')
            .trim();

        log.success('HTML processed');

        // Minify CSS
        log.info('Minifying CSS...');
        const minifiedCSS = minifyCSS(cssContent);
        const cssSize = cssContent.length;
        const minCSSize = minifiedCSS.length;
        log.success(`CSS minified (${cssSize} → ${minCSSize} bytes, ${Math.round(100 - (minCSSize/cssSize)*100)}% reduction)`);

        // Minify JavaScript
        log.info('Minifying JavaScript...');
        const minifiedJS = minifyJS(jsContent);
        const jsSize = jsContent.length;
        const minJsSize = minifiedJS.length;
        log.success(`JavaScript minified (${jsSize} → ${minJsSize} bytes, ${Math.round(100 - (minJsSize/jsSize)*100)}% reduction)`);

        // Build the final HTML
        log.info('Combining into single file...');
        const finalHTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Colorado Holiday Markets</title>
    <style>
${minifiedCSS}
    </style>
    <!-- Leaflet CSS -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" />
    <!-- Leaflet Marker Clustering CSS -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.4.1/MarkerCluster.css" />
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.4.1/MarkerCluster.Default.css" />
</head>
<body>
${bodyContent}
    <!-- Leaflet JS -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"><\/script>
    <!-- Leaflet Marker Clustering JS -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.4.1/leaflet.markercluster.js"><\/script>
    <!-- App Script -->
    <script>
${minifiedJS}
    <\/script>
</body>
</html>`;

        // Write output file
        const outputPath = path.join(__dirname, 'colorado-holiday-markets-embed.html');
        fs.writeFileSync(outputPath, finalHTML, 'utf8');
        
        const finalSize = finalHTML.length;
        log.success(`Combined file created (${finalSize} bytes)`);

        // Calculate total reduction
        const originalTotal = cssSize + jsSize;
        const finalTotal = minCSSize + minJsSize;
        const reduction = Math.round(100 - (finalTotal/originalTotal)*100);

        log.info(`\n📦 Build Summary:`);
        log.success(`Output: ${outputPath}`);
        log.success(`Total size: ${finalSize} bytes`);
        log.success(`Overall compression: ${reduction}%`);
        log.success(`Ready for WordPress!\n`);

        // Instructions
        console.log(`${colors.blue}📋 WordPress Installation Instructions:${colors.reset}`);
        console.log(`1. Copy the entire content of: ${outputPath}`);
        console.log(`2. In WordPress, go to a page/post and add a "Custom HTML" block`);
        console.log(`3. Paste the entire file content into the block`);
        console.log(`4. Publish the page\n`);

    } catch (error) {
        log.error(`Build failed: ${error.message}`);
        process.exit(1);
    }
}

// Run the build
build();