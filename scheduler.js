const fs = require('fs');
const path = require('path');
const scrap = require('./scrap');

let keepRunning = true;

// Function to load configuration from .js or .json file
function loadConfig(configPath) {
    const ext = path.extname(configPath);
    if (ext === '.js') {
        return require(configPath);
    } else if (ext === '.json') {
        return JSON.parse(fs.readFileSync(configPath));
    } else {
        throw new Error('Unsupported configuration file format. Use .js or .json.');
    }
}

// Function to run the scrap function for all URL-pattern pairs
async function runScrap(config, skippedUrls) {
    const { webpageUrls, downloadLocation, dbPath } = config;
    console.log('Running scrap function...');
    for (const { url, scrapingUrlPattern, filePattern, depth } of webpageUrls) {
        try {
            const scrapingUrlPatternExp = new RegExp(scrapingUrlPattern);
            const filePatternExp = new RegExp(filePattern);

            const clonedSkippedUrls = new Map();
            skippedUrls.forEach((value, key) => clonedSkippedUrls.set(key, value));

            const downloadedFiles = await scrap(url, scrapingUrlPatternExp, filePatternExp, downloadLocation, depth, clonedSkippedUrls);
            console.log('Downloaded files for', url, ':', downloadedFiles);

            downloadedFiles.forEach(fileUrl => skippedUrls.set(fileUrl, {depth: 0, downloaded: true, isFile: true, links: []}));
            fs.writeFileSync(dbPath, JSON.stringify(Array.from(skippedUrls.keys())));
        } catch (err) {
            console.error(`Error running scrap function for ${url}:`, err);
        }
    }
}

// Main function to read the config and start the scheduler
async function main(configPath) {
    const config = loadConfig(configPath);

    const { interval, runCount, dbPath } = config;
    const intervalMs = interval * 1000;

    // Read scrap.db and initialize skippedUrls
    const skippedUrls = new Map();
    const urls = fs.existsSync(dbPath) ? JSON.parse(fs.readFileSync(dbPath)) : []
    urls.forEach(url => skippedUrls.set(url, {depth: 0, downloaded: true, isFile: true, links: []}));

    let executions = 0;

    const executeAndSchedule = async () => {
        if (runCount > 0 && executions >= runCount) {
            console.log('Scheduler stopped after reaching the execution limit.');
            return;
        }

        if (!keepRunning) {
            console.log('Scheduler stopped by signal.');
            return;
        }

        await runScrap(config, skippedUrls);
        executions += 1;

        if (runCount === 0 || executions < runCount) {
            setTimeout(executeAndSchedule, intervalMs);
        }
    };

    // Initial execution
    await executeAndSchedule();
}

// Handle termination signals
process.on('SIGINT', () => {
    console.log('Received SIGINT. Shutting down...');
    keepRunning = false;
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Received SIGTERM. Shutting down...');
    keepRunning = false;
    process.exit(0);
});

// Read the config path from command line arguments
const args = process.argv.slice(2);
if (args.length < 1) {
    console.error('Usage: node scheduler.js <config file>');
    process.exit(1);
}

const configPath = args[0];
main(configPath);
