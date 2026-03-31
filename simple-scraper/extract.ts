import { Page } from "playwright";
import { LinkedInPost } from "../notion";

export async function extractPosts(activePage: Page): Promise<LinkedInPost[]> {
  console.log("🔍 Scraping visible posts...");

  const evaluateFn = `(() => {
        // Profile activity page uses li containers; main feed uses div containers
        const liContainers = Array.from(document.querySelectorAll('li.profile-creator-shared-feed-update__container'));
        const divContainers = Array.from(document.querySelectorAll('.feed-shared-update-v2:not(.profile-creator-shared-feed-update__container *)'));
        
        // Prefer li containers if present (profile activity page), else fall back to div containers (main feed)
        const useListItems = liContainers.length > 0;
        const postWrappers = useListItems ? liContainers : divContainers;

        console.log('[extract] liContainers:', liContainers.length, 'divContainers:', divContainers.length, 'using:', useListItems ? 'li' : 'div');

        const extracted = [];
        
        for (const outerWrapper of postWrappers) {
            // On profile activity page: real content is inside the inner feed-shared-update-v2
            const postWrapper = useListItems 
                ? (outerWrapper.querySelector('.feed-shared-update-v2') || outerWrapper)
                : outerWrapper;

            const getText = (selector) => {
                const el = postWrapper.querySelector(selector);
                return el ? el.innerText.trim() : "";
            };

            // Author
            let authorName = getText('.update-components-actor__title') || getText('.update-components-actor__name');
            if (!authorName) {
                const heading = postWrapper.querySelector('h3, .text-view-model');
                if (heading) authorName = heading.innerText.trim();
            }
            if (!authorName) continue;

            const authorHeadline = getText('.update-components-actor__description');
            const dateTextRaw = getText('.update-components-actor__sub-description');
            const dateText = dateTextRaw ? dateTextRaw.split("•")[0].trim() : "";
            
            // Content — try multiple selectors
            const contentNode = postWrapper.querySelector(
                '.update-components-text, .feed-shared-update-v2__description, .feed-shared-update-v2__commentary'
            );
            const content = contentNode ? contentNode.innerText.trim() : "";
            
            // Stats via aria-label (most reliable on profile activity pages)
            const parseAriaNumber = (ariaLabel) => {
                if (!ariaLabel) return 0;
                // e.g. "Nikola Kotláriková and 418 others" or "332 comments"
                const match = ariaLabel.replace(/,/g, "").match(/\\d+/);
                return match ? parseInt(match[0], 10) : 0;
            };

            const parseTextNumber = (text) => {
                if (!text) return 0;
                const match = text.replace(/,/g, "").match(/\\d+/);
                return match ? parseInt(match[0], 10) : 0;
            };

            // Likes: try aria-label first, then visible text
            const likesBtn = postWrapper.querySelector('.social-details-social-counts__count-value, .social-details-social-counts__reactions-count');
            const likes = likesBtn 
                ? parseAriaNumber(likesBtn.getAttribute('aria-label') || likesBtn.innerText)
                : 0;

            // Comments: find button whose aria-label contains "comment"
            const commentBtns = Array.from(postWrapper.querySelectorAll('button.social-details-social-counts__btn, .social-details-social-counts__comments'));
            const commentBtn = commentBtns.find(el => (el.getAttribute('aria-label') || el.innerText || '').toLowerCase().includes('comment'));
            const comments = commentBtn 
                ? parseAriaNumber(commentBtn.getAttribute('aria-label') || commentBtn.innerText) 
                : parseTextNumber(getText('.social-details-social-counts__comments'));

            // Reposts
            const repostLi = Array.from(postWrapper.querySelectorAll('.social-details-social-counts__item, li button'))
                .find(el => el.innerText.toLowerCase().includes("repost"));
            const reposts = repostLi ? parseTextNumber(repostLi.innerText) : 0;
            
            // Post URL — try the inner div's data-urn first, then the outer li
            const urnEl = postWrapper.closest('[data-urn]') || postWrapper.querySelector('[data-urn]') || outerWrapper.querySelector('[data-urn]');
            const dataUrn = urnEl ? urnEl.getAttribute('data-urn') : null;
            const postUrl = dataUrn 
                ? \`https://www.linkedin.com/feed/update/\${dataUrn}/\`
                : (() => {
                    const links = Array.from(postWrapper.querySelectorAll('a[href]'));
                    const postLink = links.find(a => a.href.includes('/posts/') || a.href.includes('/activity/'));
                    return postLink ? postLink.href.split('?')[0] : "";
                })();

            // Profile URL
            const authorProfileEl = postWrapper.querySelector('a.update-components-actor__image, a.update-components-actor__meta-link');
            const authorProfileUrl = authorProfileEl ? authorProfileEl.href.split('?')[0] : "";
            
            // Image
            const imgNodes = Array.from(postWrapper.querySelectorAll('.update-components-image__image, .ivm-view-attr__img--centered'));
            const contentImg = imgNodes.find(img => 
                !img.classList.contains('update-components-actor__avatar-image') && 
                !img.classList.contains('EntityPhoto-circle-0')
            );
            const imageUrl = contentImg ? contentImg.src : null;

            extracted.push({
                authorName,
                authorHeadline,
                authorProfileUrl,
                content,
                postUrl,
                date: dateText,
                isRepost: false,
                repostedFrom: null,
                repostAuthorUrl: null,
                likes,
                comments,
                reposts,
                imageUrl
            });
        }
        return extracted;
    })()`;

  const posts = (await activePage.evaluate(evaluateFn)) as LinkedInPost[];
  console.log(`📄 Found ${posts.length} posts on the page.`);

  // Deduplicate posts
  const uniquePostsMap = new Map();
  for (const p of posts) {
    const id = p.postUrl || `${p.authorName}-${p.content.substring(0, 20)}`;
    if (p.authorName && !uniquePostsMap.has(id)) {
      uniquePostsMap.set(id, p);
    }
  }
  const uniquePosts = Array.from(uniquePostsMap.values()) as LinkedInPost[];
  console.log(`📄 Reduced to ${uniquePosts.length} unique posts.`);
  return uniquePosts;
}
