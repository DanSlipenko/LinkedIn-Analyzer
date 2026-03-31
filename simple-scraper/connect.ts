import { chromium, Browser, Page } from "playwright";

export async function connectToChrome(): Promise<{ browser: Browser, activePage: Page }> {
    console.log("🔌 Connecting to existing Chrome instance...");
    let browser;
    try {
        browser = await chromium.connectOverCDP("http://localhost:9222");
    } catch (error) {
        console.error("❌ Failed to connect to Chrome. Ensure it's running with --remote-debugging-port=9222");
        process.exit(1);
    }

    const contexts = browser.contexts();
    if (contexts.length === 0) {
        console.error("❌ No browser contexts found.");
        process.exit(1);
    }
    
    const pages = contexts[0].pages();
    const linkedInPages = pages.filter((p: Page) => p.url().includes("linkedin.com"));

    if (linkedInPages.length === 0) {
        console.error("❌ No LinkedIn page found. Please open LinkedIn in your browser.");
        process.exit(1);
    }

    // If multiple LinkedIn tabs are open, pick the one with the most content (tallest scroll height)
    let activePage = linkedInPages[0];
    if (linkedInPages.length > 1) {
        const heights = await Promise.all(
            linkedInPages.map((p: Page) => p.evaluate(() => document.body.scrollHeight))
        );
        const tallestIndex = heights.indexOf(Math.max(...heights));
        activePage = linkedInPages[tallestIndex];
        console.log(`📑 Found ${linkedInPages.length} LinkedIn tabs — using tallest (${heights[tallestIndex]}px).`);
    }

    console.log(`✅ Found LinkedIn page: ${await activePage.title()}`);
    return { browser, activePage };
}
