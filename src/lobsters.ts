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

export const buildFeedResponse = (
  stories: LobstersStory[],
  currentPage: number,
  feedTypeId: string
): GetFeedResponse => {
  const storiesPerPage = 25;
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
