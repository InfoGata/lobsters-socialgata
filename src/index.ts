import {
  LobstersStory,
  LobstersStoryDetail,
  LobstersUser,
  buildCommentTree,
  buildFeedResponse,
  feedPath,
  lobstersUrl,
  storyToPost,
  userAvatarUrl,
} from "./lobsters";

const fallbackCorsProxy = "https://corsproxy.io/?url=";

async function lobstersFetch(path: string): Promise<Response> {
  const target = `${lobstersUrl}${path}`;
  const configured = await application.getCorsProxy();
  const proxy = configured || fallbackCorsProxy;
  const url = `${proxy}${encodeURIComponent(target)}`;
  return await application.networkRequest(url);
}

async function getStories(
  feedType: string,
  page: number
): Promise<LobstersStory[]> {
  const response = await lobstersFetch(feedPath(feedType, page));
  return await response.json();
}

async function getStoryDetail(shortId: string): Promise<LobstersStoryDetail> {
  const response = await lobstersFetch(`/s/${shortId}.json`);
  return await response.json();
}

async function getLobstersUser(username: string): Promise<LobstersUser> {
  const response = await lobstersFetch(`/~${username}.json`);
  return await response.json();
}

async function getUserStories(username: string): Promise<LobstersStory[]> {
  const response = await lobstersFetch(`/~${username}/stories.json`);
  return await response.json();
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
  const items = buildCommentTree(detail.comments || [], detail.short_id);
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

application.onPostLogin = init;
init();
