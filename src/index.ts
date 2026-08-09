import {
  LobstersStory,
  LobstersStoryDetail,
  LobstersUser,
  buildCommentTree,
  buildFeedResponse,
  feedPath,
  lobstersUrl,
  parseSearchResults,
  searchPath,
  storyToPost,
  userAvatarUrl,
} from "./lobsters";

const fallbackCorsProxy = "https://corsproxy.io/?url=";

/**
 * lobste.rs sends no CORS headers, so a browser fetch needs a proxy. The
 * extension, Electron and the native shells aren't bound by CORS and issue the
 * request from a context the proxy's free tier rejects anyway (no localhost
 * origin), so they must go straight to the site.
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
  return new DOMParser().parseFromString(html, "text/html");
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
application.onSearch = search;
application.onGetPlatformType = async () => "forum";

application.onChangeTheme = async (theme: Theme) => {
  changeTheme(theme);
};

application.onPostLogin = init;
init();
