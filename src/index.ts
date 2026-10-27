import {
  LobstersStory,
  LobstersStoryDetail,
  LobstersUser,
  buildCommentTree,
  buildFeedResponse,
  feedPath,
  isBotChallenge,
  lobstersUrl,
  parseSearchResults,
  searchPath,
  storyToPost,
  userAvatarUrl,
} from "./lobsters";

// Our own worker (libraries/cloudflare/cloudcors, wrangler.lobsters.toml),
// allowlisted to lobste.rs only. corsproxy.io used to be the fallback but now
// answers 401 to every request without an API key.
const fallbackCorsProxy = "https://cloudcors-lobsters.audio-pwa.workers.dev/?url=";

/**
 * lobste.rs sends no CORS headers, so a browser fetch needs a proxy. The
 * extension, Electron and the native shells aren't bound by CORS, so they go
 * straight to the site.
 */
async function lobstersFetch(path: string): Promise<Response> {
  const target = `${lobstersUrl}${path}`;
  if (await application.isNetworkRequestCorsDisabled()) {
    return await application.networkRequest(target);
  }
  const configured = await application.getCorsProxy();
  const proxy = configured || fallbackCorsProxy;
  const url = `${proxy}${encodeURIComponent(target)}`;
  return await application.networkRequest(url);
}

/**
 * A failing proxy answers 200-or-4xx with its own JSON error body, which parses
 * fine and only blows up later as "x.map is not a function". Fail here instead,
 * naming the request.
 */
async function lobstersJson<T>(path: string): Promise<T> {
  const response = await lobstersFetch(path);
  if (!response.ok) {
    throw new Error(
      `Lobsters request failed: ${path} returned ${response.status} ${response.statusText}`
    );
  }
  return (await response.json()) as T;
}

async function getStories(
  feedType: string,
  page: number
): Promise<LobstersStory[]> {
  return await lobstersJson<LobstersStory[]>(feedPath(feedType, page));
}

async function getStoryDetail(shortId: string): Promise<LobstersStoryDetail> {
  return await lobstersJson<LobstersStoryDetail>(`/s/${shortId}.json`);
}

async function getLobstersUser(username: string): Promise<LobstersUser> {
  return await lobstersJson<LobstersUser>(`/~${username}.json`);
}

async function getUserStories(username: string): Promise<LobstersStory[]> {
  return await lobstersJson<LobstersStory[]>(`/~${username}/stories.json`);
}

async function getSearchDocument(
  query: string,
  page: number
): Promise<Document> {
  const path = searchPath(query, page);
  const response = await lobstersFetch(path);
  if (!response.ok) {
    throw new Error(
      `Lobsters search failed: ${path} returned ${response.status} ${response.statusText}`
    );
  }
  const html = await response.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  // The host solves the check in a page on lobste.rs (see `enableSearch`). When
  // that page couldn't -- InfoGata extension 1.5.0 and older never load /search
  // themselves -- the challenge comes back instead, as a 200 that would parse
  // as no results. A tab that has loaded /search holds the cookie that passes.
  if (isBotChallenge(doc)) {
    throw new Error(
      "Lobsters' bot check blocked the search. Open https://lobste.rs/search in a browser tab once, then try again."
    );
  }
  return doc;
}

const getFeed = async (request?: GetFeedRequest): Promise<GetFeedResponse> => {
  const currentPage = Number(request?.pageInfo?.page ?? 1);
  const feedTypeId = request?.feedTypeId ?? "hottest";
  const stories = await getStories(feedTypeId, currentPage);
  return buildFeedResponse(stories, currentPage, feedTypeId);
};

const getComments = async (
  request: GetCommentsRequest
): Promise<GetCommentsResponse> => {
  const detail = await getStoryDetail(request.apiId as string);
  const post = storyToPost(detail);
  const items = buildCommentTree(
    Array.isArray(detail.comments) ? detail.comments : [],
    detail.short_id
  );
  return { post, items };
};

const getUser = async (request: GetUserRequest): Promise<GetUserResponse> => {
  const [user, stories] = await Promise.all([
    getLobstersUser(request.apiId),
    getUserStories(request.apiId).catch(() => [] as LobstersStory[]),
  ]);
  const items = stories.map(storyToPost);
  return {
    user: {
      apiId: user.username,
      name: user.username,
      avatar: userAvatarUrl(user.avatar_url),
    },
    items,
  };
};

const search = async (request: SearchRequest): Promise<SearchResponse> => {
  const currentPage = Number(request.pageInfo?.page ?? 1);
  const doc = await getSearchDocument(request.query, currentPage);
  return parseSearchResults(doc, currentPage);
};

const changeTheme = (theme: Theme) => {
  localStorage.setItem("vite-ui-theme", theme);
};

const init = async () => {
  const theme = await application.getTheme();
  changeTheme(theme);
};

application.onGetFeed = getFeed;
application.onGetComments = getComments;
application.onGetUser = getUser;
application.onGetPlatformType = async () => "forum";

application.onChangeTheme = async (theme: Theme) => {
  changeTheme(theme);
};

/**
 * lobste.rs puts /search, and only /search, behind Anubis, which challenges
 * every browser user agent and our proxy worker alike. Only a real page on the
 * site can solve it, and only the extension, the desktop build and Android can
 * make requests from one (`pageContextRequests` in the manifest). Anywhere else
 * search could only fail, so it isn't offered.
 */
const enableSearch = async () => {
  let available = false;
  try {
    available = await application.isPageContextAvailable();
  } catch {
    // A host from before the method existed has no page context either.
  }
  application.onSearch = available ? search : undefined;
};

application.onPostLogin = init;
init();
enableSearch();
