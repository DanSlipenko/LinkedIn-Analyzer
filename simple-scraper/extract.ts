import { Page } from "playwright";
import { LinkedInPost } from "../notion";

export async function extractPosts(activePage: Page): Promise<LinkedInPost[]> {
  console.log("🔍 Scraping visible posts...");

  // Forward browser console logs to Node so we can debug selector hits
  activePage.on("console", (msg) => {
    if (msg.text().startsWith("[extract]")) {
      console.log("[browser]", msg.text());
    }
  });

  // Wait for at least one post article to appear (up to 15s)
  try {
    await activePage.waitForSelector(
      '[role="article"][data-urn], .feed-shared-update-v2[data-urn]',
      { timeout: 15000 }
    );
  } catch {
    console.warn("⚠️  Timed out waiting for posts — attempting anyway.");
  }

  // Use a plain-JS string so tsx/esbuild helpers are never injected into the
  // browser context (avoids the "__name is not defined" Playwright error).
  const script = /* js */ `
    (function () {
      var articlePosts = Array.from(document.querySelectorAll('[role="article"][data-urn]'));

      var liContainers = articlePosts.length === 0
        ? Array.from(document.querySelectorAll('li.profile-creator-shared-feed-update__container'))
        : [];

      var divContainers = articlePosts.length === 0 && liContainers.length === 0
        ? Array.from(document.querySelectorAll('.feed-shared-update-v2:not(.profile-creator-shared-feed-update__container *)'))
        : [];

      var useListItems = liContainers.length > 0;
      var postWrappers = articlePosts.length > 0 ? articlePosts
        : useListItems ? liContainers
        : divContainers;

      console.log('[extract] articlePosts:' + articlePosts.length +
        ' li:' + liContainers.length +
        ' div:' + divContainers.length +
        ' total-articles-on-page:' + document.querySelectorAll('[role="article"]').length);

      function getText(root, selector) {
        var el = root.querySelector(selector);
        return el ? (el.innerText || '').trim() : '';
      }

      function parseNumber(str) {
        if (!str) return 0;
        var match = str.replace(/,/g, '').match(/\\d+/);
        return match ? parseInt(match[0], 10) : 0;
      }

      var extracted = [];

      for (var i = 0; i < postWrappers.length; i++) {
        var outerWrapper = postWrappers[i];

        // article[data-urn] elements ARE the post wrapper already.
        // For old li-based layout, look inside for .feed-shared-update-v2.
        var postWrapper = articlePosts.length > 0
          ? outerWrapper
          : useListItems
            ? (outerWrapper.querySelector('.feed-shared-update-v2') || outerWrapper)
            : outerWrapper;

        // Author
        var authorName = getText(postWrapper, '.update-components-actor__title')
          || getText(postWrapper, '.update-components-actor__name');
        if (!authorName) {
          var heading = postWrapper.querySelector('h3, .text-view-model');
          if (heading) authorName = (heading.innerText || '').trim();
        }
        if (!authorName) continue;

        var authorHeadline = getText(postWrapper, '.update-components-actor__description');
        var dateRaw = getText(postWrapper, '.update-components-actor__sub-description');
        var dateText = dateRaw ? dateRaw.split('•')[0].trim() : '';

        // Content
        var contentNode = postWrapper.querySelector(
          '.update-components-text, .feed-shared-update-v2__description, .feed-shared-update-v2__commentary'
        );
        var content = contentNode ? (contentNode.innerText || '').trim() : '';

        // Likes — the reactions summary button has aria-label="N reactions"
        var likesBtn = postWrapper.querySelector('button[data-reaction-details]');
        var likes = likesBtn
          ? parseNumber(likesBtn.getAttribute('aria-label') || getText(postWrapper, '.social-details-social-counts__reactions-count'))
          : 0;

        // Comments
        var commentBtns = Array.from(postWrapper.querySelectorAll(
          'button.social-details-social-counts__btn, .social-details-social-counts__comments button'
        ));
        var commentBtn = null;
        for (var c = 0; c < commentBtns.length; c++) {
          var lbl = (commentBtns[c].getAttribute('aria-label') || commentBtns[c].innerText || '').toLowerCase();
          if (lbl.includes('comment')) { commentBtn = commentBtns[c]; break; }
        }
        var comments = commentBtn
          ? parseNumber(commentBtn.getAttribute('aria-label') || commentBtn.innerText)
          : parseNumber(getText(postWrapper, '.social-details-social-counts__comments'));

        // Reposts
        var repostEls = Array.from(postWrapper.querySelectorAll(
          '.social-details-social-counts__item button, li button'
        ));
        var repostEl = null;
        for (var r = 0; r < repostEls.length; r++) {
          if ((repostEls[r].innerText || '').toLowerCase().includes('repost')) {
            repostEl = repostEls[r]; break;
          }
        }
        var reposts = repostEl ? parseNumber(repostEl.innerText) : 0;

        // Post URL via data-urn
        var urnEl = postWrapper.closest('[data-urn]')
          || postWrapper.querySelector('[data-urn]')
          || outerWrapper.querySelector('[data-urn]');
        var dataUrn = urnEl ? urnEl.getAttribute('data-urn') : null;
        var postUrl = dataUrn
          ? 'https://www.linkedin.com/feed/update/' + dataUrn + '/'
          : (function () {
              var links = Array.from(postWrapper.querySelectorAll('a[href]'));
              for (var l = 0; l < links.length; l++) {
                if (links[l].href.includes('/posts/') || links[l].href.includes('/activity/')) {
                  return links[l].href.split('?')[0];
                }
              }
              return '';
            })();

        // Author profile URL
        var actorLink = postWrapper.querySelector(
          'a.update-components-actor__image, a.update-components-actor__meta-link'
        );
        var authorProfileUrl = actorLink ? actorLink.href.split('?')[0] : '';

        // Image
        var imgNodes = Array.from(postWrapper.querySelectorAll(
          '.update-components-image__image, .ivm-view-attr__img--centered'
        ));
        var contentImg = null;
        for (var img = 0; img < imgNodes.length; img++) {
          var cl = imgNodes[img].classList;
          if (!cl.contains('update-components-actor__avatar-image') &&
              !cl.contains('EntityPhoto-circle-0') &&
              !cl.contains('EntityPhoto-circle-3')) {
            contentImg = imgNodes[img]; break;
          }
        }
        var imageUrl = contentImg ? contentImg.src : null;

        extracted.push({
          authorName: authorName,
          authorHeadline: authorHeadline,
          authorProfileUrl: authorProfileUrl,
          content: content,
          postUrl: postUrl,
          date: dateText,
          isRepost: false,
          repostedFrom: null,
          repostAuthorUrl: null,
          likes: likes,
          comments: comments,
          reposts: reposts,
          imageUrl: imageUrl
        });
      }

      return extracted;
    })()
  `;

  const posts = (await activePage.evaluate(script)) as LinkedInPost[];
  console.log(`📄 Found ${posts.length} posts on the page.`);

  // Deduplicate
  const uniquePostsMap = new Map<string, LinkedInPost>();
  for (const p of posts) {
    const id = p.postUrl || `${p.authorName}-${p.content.substring(0, 20)}`;
    if (p.authorName && !uniquePostsMap.has(id)) {
      uniquePostsMap.set(id, p);
    }
  }
  const uniquePosts = Array.from(uniquePostsMap.values());
  console.log(`📄 Reduced to ${uniquePosts.length} unique posts.`);
  return uniquePosts;
}
