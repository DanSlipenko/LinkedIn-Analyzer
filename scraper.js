"use strict";
var __awaiter =
  (this && this.__awaiter) ||
  function (thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P ? value : (
          new P(function (resolve) {
            resolve(value);
          })
        );
    }
    return new (P || (P = Promise))(function (resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator["throw"](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  };
Object.defineProperty(exports, "__esModule", { value: true });
const playwright_1 = require("playwright");
const notion_1 = require("./notion");
// Known selectors (may need adjustment based on LinkedIn updates)
const SELECTORS = {
  postContainer: ".feed-shared-update-v2",
  authorName: ".update-components-actor__name span[dir='ltr']",
  authorHeadline: ".update-components-actor__description",
  authorProfileLink: ".update-components-actor__container-link",
  postContent: ".update-components-text",
  postDate: ".update-components-actor__sub-description-t-black--light span[aria-hidden='true']",
  postLink: ".update-components-actor__sub-description-t-black--light a", // Often wrapped around the date
  likesCount: ".social-details-social-counts__reactions-count",
  commentsCount: ".social-details-social-counts__comments",
  repostsCount: ".social-details-social-counts__reposts",
  imageElement: ".update-components-image__image",
  repostIndicator: ".update-components-header__text-view", // If this exists, it's a repost
};
(() =>
  __awaiter(void 0, void 0, void 0, function* () {
    console.log("🔌 Connecting to existing Chrome instance...");
    let browser;
    try {
      browser = yield playwright_1.chromium.connectOverCDP("http://localhost:9222");
    } catch (error) {
      console.error("❌ Failed to connect to Chrome.");
      console.error('Make sure you started Chrome with: open -a "Google Chrome" --args --remote-debugging-port=9222');
      process.exit(1);
    }
    if (!browser) {
      console.error("❌ Failed to establish browser connection.");
      process.exit(1);
    }
    const context = browser.contexts()[0];
    const pages = context.pages();
    // Find the LinkedIn page
    const page = pages.find((p) => p.url().includes("linkedin.com"));
    if (!page) {
      console.error("❌ No LinkedIn page found. Please open LinkedIn in your browser first.");
      process.exit(1);
    }
    const activePage = page; // alias to ensure TS knows it's not undefined
    console.log(`✅ Found LinkedIn page: ${yield activePage.title()}`);
    console.log("🔍 Scraping visible posts..."); // pass evaluate function as a string to avoid tsx/esbuild injecting `__name` references
    const evaluateFn = `(() => {
    const actionBars = Array.from(document.querySelectorAll('div')).filter(div => {
       const text = div.innerText || "";
       return text.includes("Like") && text.includes("Comment") && text.includes("Repost");
    });
    
    const bottomActionBars = actionBars.filter(parent => {
       return !actionBars.some(child => parent !== child && parent.contains(child));
    });

    const extractedPosts = [];
    
    for (const actionBar of bottomActionBars) {
       let postWrapper = actionBar.closest('div[data-urn]') || actionBar.closest('.feed-shared-update-v2');
       if (!postWrapper) {
          let current = actionBar;
          let levels = 0;
          while (current && current.innerText.length < 200 && levels < 10) {
             current = current.parentElement;
             levels++;
          }
          postWrapper = current;
       }
       
       if (postWrapper) {
         const getText = (selector) => {
            const el = postWrapper.querySelector(selector);
            return el ? el.innerText.trim() : "";
         };

         const authorName = getText('.update-components-actor__title') || "Unknown";
         const authorHeadline = getText('.update-components-actor__description');
         const dateTextRaw = getText('.update-components-actor__sub-description');
         const dateText = dateTextRaw ? dateTextRaw.split("•")[0].trim() : "Unknown Date";
         
         // Fix for missing content: grab exact container
         const contentNode = postWrapper.querySelector('.update-components-text, .feed-shared-update-v2__commentary, .feed-shared-update-v2__description');
         let content = contentNode ? contentNode.innerText.trim() : "";
         
         const authorProfileEl = postWrapper.querySelector('a.update-components-actor__image, a.update-components-actor__meta-link');
         const authorProfileUrl = authorProfileEl ? authorProfileEl.href.split('?')[0] : "";
         
         const postUrl = postWrapper.getAttribute('data-urn') 
            ? \`https://www.linkedin.com/feed/update/\${postWrapper.getAttribute('data-urn')}/\`
            : "";
         
         const repostIndicator = postWrapper.querySelector('.update-components-header__text-view');
         const isRepost = repostIndicator ? repostIndicator.innerText.includes("reposted this") : false;
         let repostedFrom = null;
         if (isRepost) {
             const match = repostIndicator.innerText.match(/(.+?) reposted this/);
             if (match) repostedFrom = match[1].trim();
         }

         const parseNumberRaw = (text) => {
             if (!text) return 0;
             const match = text.replace(/,/g, "").match(/\\d+/);
             return match ? parseInt(match[0], 10) : 0;
         };
         
         const likes = parseNumberRaw(getText('.social-details-social-counts__reactions-count'));
         const comments = parseNumberRaw(getText('.social-details-social-counts__comments'));
         const reposts = parseNumberRaw(getText('.social-details-social-counts__item:nth-child(2)')); // robust enough
         
         const imgNodes = Array.from(postWrapper.querySelectorAll('.update-components-image__image, .ivm-view-attr__img--centered'));
         // Filter out avatar images 
         const contentImg = imgNodes.find(img => !img.classList.contains('update-components-actor__avatar-image') && !img.classList.contains('EntityPhoto-circle-0'));
         const imageUrl = contentImg ? contentImg.src : null;

         extractedPosts.push({
            authorName,
            authorHeadline,
            authorProfileUrl,
            content,
            postUrl,
            date: dateText,
            isRepost,
            repostedFrom,
            repostAuthorUrl: null,
            likes,
            comments,
            reposts,
            imageUrl
         });
       }    
    }
    
    return extractedPosts;
  })()`;
    const posts = yield activePage.evaluate(evaluateFn);
    console.log(`📄 Found ${posts.length} posts on the page.`);
    const results = [];
    if (posts.length === 0) {
      console.log("⚠️ No posts found. LinkedIn DOM might have changed or you might need to scroll down gently.");
    }
    // Deduplicate results by content or link since feed can have duplicates
    const uniquePostsMap = new Map();
    for (const p of posts) {
      const id = p.postUrl || `${p.authorName}-${p.content.substring(0, 20)}`;
      if (p.authorName && !uniquePostsMap.has(id)) {
        // basic validation
        uniquePostsMap.set(id, p);
      }
    }
    const uniquePosts = Array.from(uniquePostsMap.values());
    console.log(`📄 Reduced to ${uniquePosts.length} unique/valid posts.`);
    // Process posts and push to Notion (limit to 5 for testing)
    const limit = Math.min(uniquePosts.length, 5);
    for (let i = 0; i < limit; i++) {
      const post = uniquePosts[i];
      if (!post.postUrl) {
        console.log(`⚠️ Post by ${post.authorName} missing post URL. Skip deduplication check against Notion.`);
      } else {
        console.log(`➡️ Checking if already exists: Post by ${post.authorName}`);
        const exists = yield (0, notion_1.checkIfPostExists)(post.postUrl);
        if (exists) {
          console.log(`⏩ Skipping (Already in Notion): Post by ${post.authorName}`);
          continue;
        }
      }
      console.log(`✅ Saving new post by ${post.authorName}...`);
      try {
        yield (0, notion_1.addPostToNotion)(post);
        results.push(post);
        // Rate limiting
        yield new Promise((r) => setTimeout(r, 400));
      } catch (err) {
        console.log(`❌ Failed to save post by ${post.authorName}: ${err.message}`);
      }
    }
    console.log("\n🎉 FINAL RESULTS:\n");
    console.log(`Successfully added ${results.length} new posts to Notion.`);
    console.log("👋 Done.");
  }))();
