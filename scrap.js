const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const urlModule = require('url');
const v8 = require('v8');

const MB = 1024 * 1024;

// Function to download a webpage
function downloadWebpage(url, maxDataSize = 5 * MB) {
  return new Promise((resolve, reject) => {
    try {
      const protocol = url.startsWith('https') ? https : http;
      protocol.get(url, {
        // rejectUnauthorized: false,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
          Accept: `text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7`,
        }
      }, (res) => {
        let data = [];
        let dataSize = 0;
        res.on('data', (chunk) => {
          data.push(chunk);
          dataSize += chunk.length;
          if (dataSize > maxDataSize) {
            res.destroy();
            reject('Data size exceeds limit');
          }
        });
        res.on('end', () => {
          if (dataSize <= maxDataSize) {
            resolve({
              statusCode: res.statusCode,
              url,
              headers: res.headers,
              body: Buffer.concat(data)
            });
          } else {
            reject('Data size exceeds limit');
          }
          res.destroy();
        });
      }).on('error', (err) => reject(err));
    } catch (err) {
      return reject(err);
    }
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

async function saveFile(httpResponse, downloadPath) {
  return new Promise(async (resolve, reject) => {
    try {
      const {headers, body} = httpResponse;
      const contentDisposition = headers['content-disposition'];
      let filename = '';
      if (contentDisposition) {
        const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
        const matches = filenameRegex.exec(contentDisposition);
        if (matches != null && matches[1]) {
          filename = matches[1].replace(/['"]/g, '');
        }
      }

      if (!filename) filename = decodeURIComponent(path.basename(urlModule.parse(httpResponse.url).pathname));
      if (!filename) return reject('no file')

      const uniqueDownloadPath = filename ? getUniqueFileName(path.join(downloadPath, filename)) : getUniqueFileName(downloadPath);
      console.log(`Saving file to ${uniqueDownloadPath}`);

      await fs.writeFileSync(uniqueDownloadPath, body);
      resolve(uniqueDownloadPath);
    } catch (err) {
      reject(err);
    }
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

function getActualUrl(urlString) {
  try {
    const url = new URL(urlString);
    return url.origin + url.pathname + url.search;
  } catch (error) {
    console.error('Invalid URL:', urlString);
    return null;
  }
}

async function scrap(webpageUrl, scrapingUrlPattern, filePattern, downloadLocation, depth, visitedUrls = new Map()) {
  return new Promise(async (resolve, reject) => {
    setTimeout(async () => {
      webpageUrl = getActualUrl(webpageUrl);

      const info = visitedUrls.get(webpageUrl) || {depth: depth - 1, downloaded: false, isFile: false, links: []};
      if (depth < 0 || (info.depth !== undefined && info.depth >= depth) || info.isFile) return resolve([]);
      visitedUrls.set(webpageUrl, info);
      info.depth = depth;

      if (!info.downloaded) {
        info.downloaded = true;

        console.log(`Downloading webpage(${depth}): ${webpageUrl}`);
        const response/* : Response */ = await downloadWebpage(webpageUrl).catch(err => console.error(`Error downloading webpage: ${webpageUrl}`, err));

        if (!response || !response.statusCode || response.statusCode >= 300 || !response.body || !response.body.length) return resolve([]);
        info.links = extractLinks(response.body).map(e => e.href);
        response.body = null;
      }

      const downloadedFiles = new Set();
      for (let href of info.links) {
        if (!href.startsWith('http://') && !href.startsWith('https://')) href = urlModule.resolve(webpageUrl, href);
        if (!href.startsWith('http://') && !href.startsWith('https://')) continue;
        href = href.replace(/&amp;/g, '&');

        if ((!visitedUrls.get(href) || !visitedUrls.get(href).downloaded) && (filePattern.test(href))) {
          console.log(`Saving file: ${href}`);
          try {
            const response = await downloadWebpage(href, 100 * MB).catch(err => console.error(`Error downloading webpage: ${href}`, err));
            if (response.statusCode >= 300 || !response.body || !response.body.length) continue;
            await saveFile(response, downloadLocation).catch(err => console.error(`Error downloading file: ${href}`, err));
            downloadedFiles.add(href);
            visitedUrls.set(href, {depth: 0, downloaded: true, isFile: true, links: []});
          } catch (downloadErr) {
            console.error(`Error processing download for ${href}: ${downloadErr}`);
          }
        }

        if (depth <= 0) continue;
        if (scrapingUrlPattern && !scrapingUrlPattern.test(href)) continue;
        (await scrap(href, scrapingUrlPattern, filePattern, downloadLocation, depth - 1, visitedUrls))?.forEach(file => downloadedFiles.add(file));
      }

      return resolve(downloadedFiles);
    }, 10);
  });
}

// Export the scrap function
module.exports = scrap;

// Process command line arguments and run the scrap function if executed directly
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.error('Usage: node scrap.js <webpage URL> <scrapingUrl RegExp pattern> <file RegExp pattern> <local download location:optional, defaults to current folder>');
    process.exit(1);
  }

  const webpageUrl = args[0];
  let scrapingUrlPattern, filePattern;
  try {
    scrapingUrlPattern = new RegExp(args[1]);
  } catch (e) {
    console.error('Invalid regular expression pattern:', args[1]);
    process.exit(1);
  }
  try {
    filePattern = new RegExp(args[2]);
  } catch (e) {
    console.error('Invalid regular expression pattern:', args[2]);
    process.exit(1);
  }
  const downloadLocation = args[3] || '.';
  const depth = args[4] || 1;

  // Ensure download location exists
  if (!fs.existsSync(downloadLocation)) {
    fs.mkdirSync(downloadLocation, { recursive: true });
  }

  scrap(webpageUrl, scrapingUrlPattern, filePattern, downloadLocation, depth).then(downloadedFiles => {
    console.log('Downloaded files:', downloadedFiles);
  });
}
