import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { beforeAll, describe, expect, it } from "vitest";
import { SEARCH_RESULTS_PER_PAGE, parseSearchResults, searchPath } from "./lobsters";

/**
 * Search results are scraped from the HTML page, so these run against a real
 * capture of `/search?q=rust&what=stories`. If lobste.rs changes its templates
 * the parser fails here rather than silently returning an empty feed in the app.
 *
 * The capture used `order=newest` even though the plugin asks for `relevance`:
 * ordering does not change the markup, and the newest page happens to carry the
 * edge cases worth pinning — a negative score, a "no comments" story, and both
 * stories with and without a description.
 */
const fixture = readFileSync(
  fileURLToPath(new URL("./fixtures/search-stories.html", import.meta.url)),
  "utf8"
);

const parse = (html: string, page: number) =>
  parseSearchResults(new JSDOM(html).window.document, page);

describe("searchPath", () => {
  it("builds a stories search url ordered by relevance", () => {
    const path = searchPath("rust lifetimes", 1);
    const params = new URLSearchParams(path.split("?")[1]);
    expect(path.startsWith("/search?")).toBe(true);
    expect(params.get("q")).toBe("rust lifetimes");
    expect(params.get("what")).toBe("stories");
    expect(params.get("order")).toBe("relevance");
    expect(params.get("page")).toBe("1");
  });

  it("clamps pages below 1", () => {
    expect(new URLSearchParams(searchPath("rust", 0).split("?")[1]).get("page")).toBe("1");
  });

  it("encodes characters that would break the query string", () => {
    expect(searchPath("a&b=c", 1)).toContain("q=a%26b%3Dc");
  });
});

describe("parseSearchResults", () => {
  let response: SearchResponse;

  beforeAll(() => {
    response = parse(fixture, 1);
  });

  it("finds every result on the page", () => {
    expect(response.items).toHaveLength(SEARCH_RESULTS_PER_PAGE);
  });

  it("maps a story to a Post", () => {
    const post = response.items[0];
    expect(post).toMatchObject({
      apiId: "cmrfrj",
      title: "some software talks i like",
      url: "https://char.lt/blog/2026/08/talks-i-like/",
      authorName: "hugoarnal",
      authorApiId: "hugoarnal",
      originalUrl: "https://lobste.rs/s/cmrfrj/some_software_talks_i_like",
      score: 67,
      numOfComments: 15,
      number: 1,
    });
    expect(post.publishedDate).toBe("2026-08-08T13:48:36.000Z");
  });

  it("carries the description across when a story has one", () => {
    const post = response.items.find((p) => p.apiId === "cmrfrj");
    expect(post?.body).toBe("Not tagged as video but contains mostly links to videos");
  });

  it("leaves body undefined for link-only stories", () => {
    const linkOnly = response.items.filter((p) => p.body === undefined);
    expect(linkOnly.length).toBeGreaterThan(0);
  });

  it("gives every result an author, title and id", () => {
    for (const post of response.items) {
      expect(post.apiId).toBeTruthy();
      expect(post.title).toBeTruthy();
      expect(post.authorName).toBeTruthy();
      expect(post.originalUrl).toMatch(/^https:\/\/lobste\.rs\/s\//);
    }
  });

  it("reads negative scores", () => {
    const scores = response.items.map((p) => p.score);
    expect(scores).toContain(-1);
  });

  it("reads 'no comments' as zero", () => {
    const scores = response.items.map((p) => p.numOfComments);
    expect(scores).toContain(0);
  });

  it("numbers results continuously across pages", () => {
    const page3 = parse(fixture, 3);
    expect(page3.items[0].number).toBe(2 * SEARCH_RESULTS_PER_PAGE + 1);
  });

  it("offers a next page while the server still lists one", () => {
    expect(response.pageInfo).toMatchObject({ page: 1, nextPage: 2 });
    expect(response.pageInfo?.prevPage).toBeUndefined();
  });

  it("exposes a prev page beyond the first", () => {
    expect(parse(fixture, 2).pageInfo?.prevPage).toBe(1);
  });

  it("stops paging at the last page the server offers", () => {
    // The fixture's pagination tops out at 20.
    expect(parse(fixture, 20).pageInfo?.nextPage).toBeUndefined();
  });

  it("returns nothing and offers no next page when there are no results", () => {
    const empty = parse("<html><body><p>0 results</p></body></html>", 1);
    expect(empty.items).toEqual([]);
    expect(empty.pageInfo?.nextPage).toBeUndefined();
  });

  it("skips a result missing the pieces a Post needs", () => {
    const partial = parse(
      '<html><body><li data-shortid="aaa111"></li></body></html>',
      1
    );
    expect(partial.items).toEqual([]);
  });
});
