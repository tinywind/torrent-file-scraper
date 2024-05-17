const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const urlModule = require('url');

// Process command line arguments
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

// Function to download a webpage
function downloadWebpage(url, callback) {
  const protocol = url.startsWith('https') ? https : http;
  protocol.get(url, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      callback(null, data);
    });

  }).on('error', (err) => {
    callback(err);
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
  const uniqueDownloadPath = getUniqueFileName(downloadPath);
  const file = fs.createWriteStream(uniqueDownloadPath);
  const protocol = fileUrl.startsWith('https') ? https : http;

  protocol.get(fileUrl, (response) => {
    response.pipe(file);

    file.on('finish', () => {
      file.close();
      console.log(`Downloaded: ${fileUrl} to ${uniqueDownloadPath}`);
    });
  }).on('error', (err) => {
    fs.unlink(uniqueDownloadPath, () => {});
    console.error(`Error downloading ${fileUrl}: ${err.message}`);
  }).on('error', (err) => {
    fs.unlink(uniqueDownloadPath, (unlinkErr) => {
      if (unlinkErr) {
        console.error(`Error removing incomplete file ${uniqueDownloadPath}: ${unlinkErr.message}`);
      }
    });
    console.error(`Error downloading ${fileUrl}: ${err.message}`);
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

// Download and process the webpage
downloadWebpage(webpageUrl, (err, data) => {
  if (err) {
    console.error(`Error downloading webpage: ${err.message}`);
    return;
  }

  const links = extractLinks(data);

  links.forEach(link => {
    const { href, text } = link;
    if (filePattern.test(href) || filePattern.test(text)) {
      const parsedUrl = urlModule.parse(href);
      const fileName = path.basename(parsedUrl.pathname);
      const downloadPath = path.join(downloadLocation, fileName);

      try {
        downloadFile(href, downloadPath);
      } catch (downloadErr) {
        console.error(`Error processing download for ${href}: ${downloadErr.message}`);
      }
    }
  });
});
