export const lobstersUrl = "https://lobste.rs";

export interface LobstersStory {
  short_id: string;
  short_id_url: string;
  created_at: string;
  title: string;
  url: string;
  score: number;
  flags: number;
  comment_count: number;
  description: string;
  description_plain: string;
  submitter_user: string;
  user_is_author: boolean;
  tags: string[];
  comments_url: string;
}

export interface LobstersComment {
  short_id: string;
  short_id_url: string;
  url: string;
  created_at: string;
  last_edited_at?: string;
  is_deleted: boolean;
  is_moderated: boolean;
  score: number;
  flags: number;
  parent_comment: string | null;
  comment: string;
  comment_plain: string;
  depth: number;
  commenting_user: string;
}

export interface LobstersStoryDetail extends LobstersStory {
  comments: LobstersComment[];
}

export interface LobstersUser {
  username: string;
  created_at: string;
  is_admin: boolean;
  is_moderator: boolean;
  karma: number;
  about: string;
  avatar_url: string;
  invited_by_user?: string;
  github_username?: string;
}

export const feedPath = (feedType: string, page: number): string => {
  if (feedType === "newest") {
    return page <= 1 ? "/newest.json" : `/newest/page/${page}.json`;
  }
  return page <= 1 ? "/hottest.json" : `/page/${page}.json`;
};

export const storyToPost = (story: LobstersStory): Post => {
  return {
    apiId: story.short_id,
    title: story.title,
    publishedDate: new Date(story.created_at).toISOString(),
    url: story.url,
    body: story.description,
    authorName: story.submitter_user,
    authorApiId: story.submitter_user,
    originalUrl: story.short_id_url || `${lobstersUrl}/s/${story.short_id}`,
    score: story.score,
    numOfComments: story.comment_count,
  };
};

export const commentToPost = (
  comment: LobstersComment,
  storyShortId: string
): Post => {
  return {
    apiId: comment.short_id,
    body: comment.comment,
    publishedDate: new Date(comment.created_at).toISOString(),
    authorName: comment.commenting_user,
    authorApiId: comment.commenting_user,
    originalUrl:
      comment.url ||
      `${lobstersUrl}/s/${storyShortId}/_/comments/${comment.short_id}`,
    score: comment.score,
    parentId: comment.parent_comment ?? undefined,
    comments: [],
  };
};

export const buildCommentTree = (
  flatComments: LobstersComment[],
  storyShortId: string
): Post[] => {
  const postById = new Map<string, Post>();
  for (const c of flatComments) {
    postById.set(c.short_id, commentToPost(c, storyShortId));
  }
  const roots: Post[] = [];
  for (const c of flatComments) {
    const post = postById.get(c.short_id)!;
    if (c.parent_comment && postById.has(c.parent_comment)) {
      const parent = postById.get(c.parent_comment)!;
      (parent.comments ||= []).push(post);
    } else {
      roots.push(post);
    }
  }
  return roots;
};

export const userAvatarUrl = (avatarUrl: string | undefined): string | undefined => {
  if (!avatarUrl) return undefined;
  return avatarUrl.startsWith("http") ? avatarUrl : `${lobstersUrl}${avatarUrl}`;
};

/**
 * Search is the one Lobsters view with no `.json` representation — `/search.json`
 * answers "400 Unpermitted query or form parameter" — so results have to come out
 * of the HTML page. Everything a Post needs is in the markup, so no per-story
 * hydration is required.
 */
export const SEARCH_RESULTS_PER_PAGE = 20;

/**
 * `order=relevance` rather than `newest`: Lobsters matches loosely across tags
 * and descriptions, so ordering by date returns recent stories barely related to
 * the query — a search for "rust" comes back looking like the hottest feed.
 */
export const searchPath = (query: string, page: number): string => {
  const params = new URLSearchParams({
    q: query,
    what: "stories",
    order: "relevance",
    page: String(Math.max(1, page)),
  });
  return `/search?${params.toString()}`;
};

const absoluteUrl = (href: string | null | undefined): string | undefined => {
  if (!href) return undefined;
  return href.startsWith("http") ? href : `${lobstersUrl}${href}`;
};

const text = (el: Element | null): string => el?.textContent?.trim() ?? "";

/** "15 comments" / "1 comment" / "no comments" */
const parseCommentCount = (label: string): number => {
  const match = label.match(/\d+/);
  return match ? Number(match[0]) : 0;
};

const parseSearchStory = (el: Element): Post | undefined => {
  const apiId = el.getAttribute("data-shortid");
  const link = el.querySelector(".link a.u-url");
  if (!apiId || !link) return undefined;

  // The byline holds two links to the same profile — an avatar and the name.
  // Only the second carries text.
  const author = [...el.querySelectorAll('.byline a[href^="/~"]')]
    .map(text)
    .find(Boolean);
  const commentsLink = el.querySelector('.comments_label a[href^="/s/"]');
  const description = el.querySelector("a.description_present");
  // `datetime` carries no timezone; the unix stamp beside it is unambiguous.
  const unix = el.querySelector("time")?.getAttribute("data-at-unix");

  return {
    apiId,
    title: text(link),
    url: absoluteUrl(link.getAttribute("href")),
    body: description?.getAttribute("title") ?? undefined,
    authorName: author,
    authorApiId: author,
    originalUrl: absoluteUrl(commentsLink?.getAttribute("href")),
    score: Number(text(el.querySelector(".voters .upvoter"))) || 0,
    numOfComments: parseCommentCount(text(commentsLink)),
    publishedDate: unix
      ? new Date(Number(unix) * 1000).toISOString()
      : undefined,
  };
};

/**
 * `nextPage` comes from the page links the server rendered rather than from a
 * full result count: Lobsters caps search paging, so "20 results on this page"
 * does not imply another one exists.
 */
const maxSearchPage = (doc: Document): number => {
  const pages = [...doc.querySelectorAll('a[href*="page="]')]
    .map((a) => Number(new URLSearchParams(
      (a.getAttribute("href") ?? "").split("?")[1] ?? ""
    ).get("page")))
    .filter((page) => Number.isFinite(page) && page > 0);
  return pages.length ? Math.max(...pages) : 1;
};

export const parseSearchResults = (
  doc: Document,
  currentPage: number
): SearchResponse => {
  const items = [...doc.querySelectorAll("li[data-shortid]")]
    .map(parseSearchStory)
    .filter((post): post is Post => !!post);
  items.forEach((item, index) => {
    item.number = (currentPage - 1) * SEARCH_RESULTS_PER_PAGE + index + 1;
  });
  return {
    items,
    pageInfo: {
      page: currentPage,
      nextPage:
        items.length && currentPage < maxSearchPage(doc)
          ? currentPage + 1
          : undefined,
      prevPage: currentPage > 1 ? currentPage - 1 : undefined,
    },
  };
};

export const buildFeedResponse = (
  stories: LobstersStory[],
  currentPage: number,
  feedTypeId: string
): GetFeedResponse => {
  const storiesPerPage = 25;
  if (!Array.isArray(stories)) {
    throw new Error("Lobsters returned an unexpected feed payload");
  }
  const items = stories.map(storyToPost);
  items.forEach((item, index) => {
    item.number = (currentPage - 1) * storiesPerPage + index + 1;
  });
  return {
    items,
    pageInfo: {
      page: currentPage,
      nextPage: items.length >= storiesPerPage ? currentPage + 1 : undefined,
      prevPage: currentPage > 1 ? currentPage - 1 : undefined,
    },
    feedTypeId,
    feedTypes: [
      { displayName: "Hottest", id: "hottest" },
      { displayName: "Newest", id: "newest" },
    ],
  };
};
