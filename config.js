module.exports = {
    webpageUrls: [
        {
            "url": "YOUR_FIRST_WEBPAGE_URL",
            "scrapingUrlPattern": "YOUR_FIRST_SCRAPE_URL",
            "filePattern": "YOUR_FIRST_FILE_PATTERN",
            "depth": 2
        },
        {
            "url": "YOUR_SECOND_WEBPAGE_URL",
            "scrapingUrlPattern": "YOUR_SECOND_SCRAPE_URL",
            "filePattern": "YOUR_SECOND_FILE_PATTERN",
            "depth": 2
        }
    ],
    downloadLocation: 'YOUR_DOWNLOAD_LOCATION',
    interval: 3600,
    runCount: 0,
    dbPath: "YOUR_DB_PATH/scrap.db",
};
