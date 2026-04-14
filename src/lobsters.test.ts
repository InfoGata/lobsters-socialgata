import { describe, expect, it } from "vitest";
import {
  LobstersComment,
  LobstersStory,
  buildCommentTree,
  buildFeedResponse,
  commentToPost,
  feedPath,
  storyToPost,
  userAvatarUrl,
} from "./lobsters";

const sampleStory: LobstersStory = {
  short_id: "abc123",
  short_id_url: "https://lobste.rs/s/abc123",
  created_at: "2026-04-11T16:00:27.000-05:00",
  title: "A Story",
  url: "https://example.com/story",
  score: 42,
  flags: 0,
  comment_count: 7,
  description: "<p>hello</p>",
  description_plain: "hello",
  submitter_user: "alice",
  user_is_author: false,
  tags: ["rust"],
  comments_url: "https://lobste.rs/s/abc123/a_story",
};

const makeComment = (
  short_id: string,
  parent_comment: string | null,
  overrides: Partial<LobstersComment> = {}
): LobstersComment => ({
  short_id,
  short_id_url: `https://lobste.rs/c/${short_id}`,
  url: `https://lobste.rs/s/abc123/a_story#c_${short_id}`,
  created_at: "2026-04-11T17:00:00.000-05:00",
  is_deleted: false,
  is_moderated: false,
  score: 1,
  flags: 0,
  parent_comment,
  comment: `<p>${short_id} body</p>`,
  comment_plain: `${short_id} body`,
  depth: 0,
  commenting_user: "bob",
  ...overrides,
});

describe("feedPath", () => {
  it("uses /hottest.json for hottest page 1", () => {
    expect(feedPath("hottest", 1)).toBe("/hottest.json");
  });

  it("uses /page/N.json for hottest pages > 1", () => {
    expect(feedPath("hottest", 2)).toBe("/page/2.json");
    expect(feedPath("hottest", 5)).toBe("/page/5.json");
  });

  it("uses /newest.json for newest page 1", () => {
    expect(feedPath("newest", 1)).toBe("/newest.json");
  });

  it("uses /newest/page/N.json for newest pages > 1", () => {
    expect(feedPath("newest", 3)).toBe("/newest/page/3.json");
  });

  it("defaults unknown feed types to hottest", () => {
    expect(feedPath("anything-else", 1)).toBe("/hottest.json");
    expect(feedPath("anything-else", 2)).toBe("/page/2.json");
  });

  it("treats page 0 and negative pages as page 1", () => {
    expect(feedPath("hottest", 0)).toBe("/hottest.json");
    expect(feedPath("newest", -1)).toBe("/newest.json");
  });
});

describe("storyToPost", () => {
  it("maps all canonical story fields", () => {
    const post = storyToPost(sampleStory);
    expect(post).toEqual({
      apiId: "abc123",
      title: "A Story",
      publishedDate: new Date("2026-04-11T16:00:27.000-05:00").toISOString(),
      url: "https://example.com/story",
      body: "<p>hello</p>",
      authorName: "alice",
      authorApiId: "alice",
      originalUrl: "https://lobste.rs/s/abc123",
      score: 42,
      numOfComments: 7,
    });
  });

  it("falls back to constructed originalUrl when short_id_url is missing", () => {
    const post = storyToPost({ ...sampleStory, short_id_url: "" });
    expect(post.originalUrl).toBe("https://lobste.rs/s/abc123");
  });

  it("normalizes publishedDate to ISO 8601 (UTC)", () => {
    const post = storyToPost(sampleStory);
    expect(post.publishedDate).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });
});

describe("commentToPost", () => {
  it("maps a comment with no parent to a root post", () => {
    const post = commentToPost(makeComment("c1", null), "abc123");
    expect(post.apiId).toBe("c1");
    expect(post.body).toBe("<p>c1 body</p>");
    expect(post.authorName).toBe("bob");
    expect(post.authorApiId).toBe("bob");
    expect(post.parentId).toBeUndefined();
    expect(post.comments).toEqual([]);
  });

  it("maps a comment with a parent and exposes parentId", () => {
    const post = commentToPost(makeComment("c2", "c1"), "abc123");
    expect(post.parentId).toBe("c1");
  });

  it("falls back to a constructed originalUrl when comment.url is missing", () => {
    const post = commentToPost(
      makeComment("c1", null, { url: "" }),
      "abc123"
    );
    expect(post.originalUrl).toBe(
      "https://lobste.rs/s/abc123/_/comments/c1"
    );
  });
});

describe("buildCommentTree", () => {
  it("returns an empty array for no comments", () => {
    expect(buildCommentTree([], "abc123")).toEqual([]);
  });

  it("returns a flat list when no comments have parents", () => {
    const flat = [makeComment("c1", null), makeComment("c2", null)];
    const tree = buildCommentTree(flat, "abc123");
    expect(tree).toHaveLength(2);
    expect(tree.map((p) => p.apiId)).toEqual(["c1", "c2"]);
    expect(tree[0].comments).toEqual([]);
  });

  it("nests children under their parents", () => {
    const flat = [
      makeComment("c1", null),
      makeComment("c2", "c1"),
      makeComment("c3", "c2"),
      makeComment("c4", "c1"),
      makeComment("c5", null),
    ];
    const tree = buildCommentTree(flat, "abc123");
    expect(tree.map((p) => p.apiId)).toEqual(["c1", "c5"]);

    const c1 = tree[0];
    expect(c1.comments?.map((p) => p.apiId)).toEqual(["c2", "c4"]);

    const c2 = c1.comments![0];
    expect(c2.comments?.map((p) => p.apiId)).toEqual(["c3"]);
    expect(c2.comments![0].comments).toEqual([]);
  });

  it("preserves source order of siblings", () => {
    const flat = [
      makeComment("root", null),
      makeComment("z", "root"),
      makeComment("a", "root"),
      makeComment("m", "root"),
    ];
    const tree = buildCommentTree(flat, "abc123");
    expect(tree[0].comments?.map((p) => p.apiId)).toEqual(["z", "a", "m"]);
  });

  it("treats orphaned comments (parent not in list) as roots", () => {
    const flat = [makeComment("c1", "missing-parent")];
    const tree = buildCommentTree(flat, "abc123");
    expect(tree).toHaveLength(1);
    expect(tree[0].apiId).toBe("c1");
  });
});

describe("userAvatarUrl", () => {
  it("returns undefined when no avatar is provided", () => {
    expect(userAvatarUrl(undefined)).toBeUndefined();
    expect(userAvatarUrl("")).toBeUndefined();
  });

  it("prefixes relative paths with the lobsters origin", () => {
    expect(userAvatarUrl("/avatars/alice-100.png")).toBe(
      "https://lobste.rs/avatars/alice-100.png"
    );
  });

  it("leaves absolute URLs untouched", () => {
    expect(userAvatarUrl("https://cdn.example.com/a.png")).toBe(
      "https://cdn.example.com/a.png"
    );
  });
});

describe("buildFeedResponse", () => {
  const stories: LobstersStory[] = Array.from({ length: 25 }, (_, i) => ({
    ...sampleStory,
    short_id: `s${i}`,
    title: `Story ${i}`,
  }));

  it("maps every story and assigns 1-based numbers on page 1", () => {
    const res = buildFeedResponse(stories, 1, "hottest");
    expect(res.items).toHaveLength(25);
    expect(res.items[0].number).toBe(1);
    expect(res.items[24].number).toBe(25);
  });

  it("offsets numbering correctly on later pages", () => {
    const res = buildFeedResponse(stories, 3, "hottest");
    expect(res.items[0].number).toBe(51);
    expect(res.items[24].number).toBe(75);
  });

  it("provides nextPage when the page is full", () => {
    const res = buildFeedResponse(stories, 1, "hottest");
    expect(res.pageInfo?.nextPage).toBe(2);
    expect(res.pageInfo?.prevPage).toBeUndefined();
  });

  it("omits nextPage when the page is short", () => {
    const res = buildFeedResponse(stories.slice(0, 10), 1, "hottest");
    expect(res.pageInfo?.nextPage).toBeUndefined();
  });

  it("provides prevPage on pages > 1", () => {
    const res = buildFeedResponse(stories, 2, "newest");
    expect(res.pageInfo?.prevPage).toBe(1);
    expect(res.pageInfo?.page).toBe(2);
  });

  it("echoes the requested feedTypeId and exposes both feed types", () => {
    const res = buildFeedResponse(stories, 1, "newest");
    expect(res.feedTypeId).toBe("newest");
    expect(res.feedTypes?.map((f) => f.id)).toEqual(["hottest", "newest"]);
  });
});
