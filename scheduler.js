const fs = require('fs');
const path = require('path');
const scrap = require('./scrap');

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
    for (const { url, pattern } of webpageUrls) {
        try {
            const filePattern = new RegExp(pattern);
            const downloadedFiles = await scrap(url, filePattern, downloadLocation, skippedUrls);
            console.log('Downloaded files for', url, ':', downloadedFiles);

            // Update skippedUrls and write to db
            downloadedFiles.forEach(fileUrl => skippedUrls.add(fileUrl));
            fs.writeFileSync(dbPath, JSON.stringify(Array.from(skippedUrls), null, 2));
        } catch (err) {
            console.error(`Error running scrap function for ${url}:`, err);
        }
    }
}

// Main function to read the config and start the scheduler
function main(configPath) {
    const config = loadConfig(configPath);

    const { interval, runCount, dbPath } = config;
    const intervalMs = interval * 1000;

    // Read scrap.db and initialize skippedUrls
    const skippedUrls = new Set(fs.existsSync(dbPath) ? JSON.parse(fs.readFileSync(dbPath)) : []);

    let executions = 0;

    const executeAndSchedule = async () => {
        if (runCount > 0 && executions >= runCount) {
            console.log('Scheduler stopped after reaching the execution limit.');
            return;
        }

        await runScrap(config, skippedUrls);
        executions += 1;

        if (runCount === 0 || executions < runCount) {
            setTimeout(executeAndSchedule, intervalMs);
        }
    };

    // Initial execution
    executeAndSchedule();
}

// Read the config path from command line arguments
const args = process.argv.slice(2);
if (args.length < 1) {
    console.error('Usage: node scheduler.js <config file>');
    process.exit(1);
}

const configPath = args[0];
main(configPath);
