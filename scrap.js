const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const urlModule = require('url');

// Function to download a webpage
function downloadWebpage(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        resolve(data);
      });

    }).on('error', (err) => {
      reject(err);
    });
  });
}

// Function to generate a unique file name if a file with the same name already exists
function getUniqueFileName(downloadPath) {
  if (!fs.existsSync(downloadPath)) {
    return downloadPath;
  }

  const parsedPath = path.parse(downloadPath);
  let counter = 1;
  let newPath;

  if (parsedPath.ext) {
    newPath = path.join(parsedPath.dir, `${parsedPath.name} (${counter})${parsedPath.ext}`);
  } else {
    newPath = path.join(parsedPath.dir, `${parsedPath.name} (${counter})`);
  }

  while (fs.existsSync(newPath)) {
    counter++;
    if (parsedPath.ext) {
      newPath = path.join(parsedPath.dir, `${parsedPath.name} (${counter})${parsedPath.ext}`);
    } else {
      newPath = path.join(parsedPath.dir, `${parsedPath.name} (${counter})`);
    }
  }

  return newPath;
}

// Function to download a file
function downloadFile(fileUrl, downloadPath) {
  return new Promise((resolve, reject) => {
    const uniqueDownloadPath = getUniqueFileName(downloadPath);
    const file = fs.createWriteStream(uniqueDownloadPath);
    const protocol = fileUrl.startsWith('https') ? https : http;

    protocol.get(fileUrl, (response) => {
      response.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log(`Downloaded: ${fileUrl} to ${uniqueDownloadPath}`);
        resolve(fileUrl);
      });
    }).on('error', (err) => {
      fs.unlink(uniqueDownloadPath, () => {});
      reject(`Error downloading ${fileUrl}: ${err.message}`);
    });
  });
}

// Function to extract links from HTML using regex
function extractLinks(html) {
  const linkRegex = /<a\s+([^>]*)href="([^"]*)"([^>]*)>([\s\S]*?)<\/a>/gi;
  const links = [];
  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[2];
    const text = match[4].replace(/<[^>]*>/g, '').trim(); // Remove inner HTML tags and trim whitespace
    links.push({ href, text });
  }

  return links;
}

async function scrap(webpageUrl, filePattern, downloadLocation, skippedUrls = new Set()) {
  const downloadedFiles = [];

  try {
    const data = await downloadWebpage(webpageUrl);
    const links = extractLinks(data);

    for (const link of links) {
      const { href, text } = link;
      if ((filePattern.test(href) || filePattern.test(text)) && !skippedUrls.has(href)) {
        const parsedUrl = urlModule.parse(href);
        const fileName = path.basename(parsedUrl.pathname);
        const downloadPath = path.join(downloadLocation, fileName);

        try {
          const fileUrl = await downloadFile(href, downloadPath);
          downloadedFiles.push(fileUrl);
        } catch (downloadErr) {
          console.error(`Error processing download for ${href}: ${downloadErr}`);
        }
      }
    }
  } catch (err) {
    console.error(`Error downloading webpage: ${err.message}`);
  }

  return downloadedFiles;
}

// Export the scrap function
module.exports = scrap;

// Process command line arguments and run the scrap function if executed directly
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: node scrap.js <webpage URL> <file RegExp pattern> <local download location:optional, defaults to current folder>');
    process.exit(1);
  }

  const webpageUrl = args[0];
  let filePattern;
  try {
    filePattern = new RegExp(args[1]);
  } catch (e) {
    console.error('Invalid regular expression pattern:', args[1]);
    process.exit(1);
  }
  const downloadLocation = args[2] || '.';

  // Ensure download location exists
  if (!fs.existsSync(downloadLocation)) {
    fs.mkdirSync(downloadLocation, { recursive: true });
  }

  scrap(webpageUrl, filePattern, downloadLocation).then(downloadedFiles => {
    console.log('Downloaded files:', downloadedFiles);
  });
}
