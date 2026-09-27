/**
 * Privacy minimisation for the assistant: the request only carries the fields the current
 * question actually needs. The whole persisted profile, the full history and unrelated
 * blacklist entries never leave the device.
 */
const PAGE_LABEL = {
  '/': '首页 · 准备开盒', '/result': '开盒结果页', '/library': '片库', '/me': '我的放映室',
  '/profile': '观影画像与黑名单', '/couple': '两人默契', '/memories': '纪念墙', '/history': '开盒足迹',
  '/mood': '选择心情', '/mbti': '选择人格', '/aquarium': '故事蛋水族箱', '/share': '分享卡',
};

const RECOMMEND_HINT = /(推荐|看什么|换一部|换一张|再来|挑|选片|有没有|类似|片单|想看点|来点|适合|轻松|刺激|治愈|恐怖|喜剧|悬疑|科幻|爱情|分钟|小时|时长|高分)/;
const MOVIE_HINT = /(这部|这张|它|为什么|剧透|介绍|评分|好看|值得|适合现在)/;
const BLACKLIST_HINT = /(黑名单|不想看|不要看|避开|屏蔽|讨厌)/;
const PROFILE_HINT = /(偏好|口味|画像|我喜欢|我最近|类型分布|看太多)/;

const slim = (movie) => movie && {
  id: movie.id, title: movie.title, year: movie.year || undefined,
  rating: typeof movie.rating === 'number' && movie.rating > 0 ? movie.rating : undefined,
  tags: Array.isArray(movie.tags) ? movie.tags.slice(0, 4) : undefined,
  duration: movie.duration || undefined, type: movie.type || undefined,
  platform: movie.platform || undefined,
};

const prune = (object) => Object.fromEntries(Object.entries(object).filter(
  ([, value]) => value !== undefined && value !== '' && !(Array.isArray(value) && !value.length),
));

/**
 * @param {string} question the message the user is about to send
 * @param {object} snapshot live App state supplied by the caller (never read from storage here)
 */
export function buildPaopaoContext(question = '', snapshot = {}) {
  const text = String(question || '');
  const wantsMovie = MOVIE_HINT.test(text) || snapshot.page === '/result';
  const wantsRecommend = RECOMMEND_HINT.test(text) || (!text && snapshot.page === '/');
  const context = {
    page: PAGE_LABEL[snapshot.page] || '应用内',
    mode: snapshot.mode === 'mood' ? '按心情' : snapshot.mode === 'mbti' ? '按人格' : snapshot.mode === 'random' ? '随缘' : undefined,
    mood: snapshot.mode === 'mood' ? snapshot.mood || undefined : undefined,
    mbti: snapshot.mode === 'mbti' ? snapshot.mbti || undefined : undefined,
  };
  if (wantsMovie && snapshot.currentMovie) {
    const movie = snapshot.currentMovie;
    context.currentMovie = prune({
      ...slim(movie),
      synopsis: typeof movie.synopsis === 'string' ? movie.synopsis.slice(0, 160) : undefined,
      reason: typeof movie.reason === 'string' ? movie.reason.slice(0, 160) : undefined,
      inWatchlist: snapshot.currentInWatchlist === true ? true : undefined,
    });
  }
  if (wantsRecommend && Array.isArray(snapshot.candidates) && snapshot.candidates.length) {
    context.candidates = snapshot.candidates.slice(0, 12).map((movie) => prune(slim(movie)));
  }
  if ((BLACKLIST_HINT.test(text) || snapshot.page === '/profile') && Array.isArray(snapshot.blacklist) && snapshot.blacklist.length) {
    context.blacklist = snapshot.blacklist.slice(0, 12).map((entry) => `${entry.type}:${entry.name}`);
  }
  if (PROFILE_HINT.test(text) || snapshot.page === '/profile' || snapshot.page === '/me') {
    if (Array.isArray(snapshot.likedTags) && snapshot.likedTags.length) context.likedTags = snapshot.likedTags.slice(0, 8);
    if (Array.isArray(snapshot.recentTags) && snapshot.recentTags.length) context.recentTags = snapshot.recentTags.slice(0, 6);
  }
  return prune(context);
}

/** Quick chips follow the page, and never offer an action that is already done. */
export function quickPrompts(snapshot = {}) {
  const page = snapshot.page;
  if (page === '/result' && snapshot.currentMovie) {
    return ['为什么推荐它？', '无剧透介绍一下', '适合现在的我吗？', '换个更轻松的',
      '有没有类似的？', snapshot.currentInWatchlist ? '帮我取消想看' : '帮我加入想看'];
  }
  if (page === '/profile') return ['我的看片偏好是什么？', '我是不是看太多悬疑了？', '帮我调一调看片口味', '为什么我总避开这些类型？'];
  if (page === '/me') return ['我最近偏什么类型？', '我的看片偏好是什么？', '这周适合看点什么？'];
  if (page === '/library') return ['帮我从片库里挑一部', '有没有 90 分钟以内的？', '想看点治愈的', '高分悬疑推荐'];
  return ['今晚看什么？', '我有点累', '给我来点刺激的', '90 分钟以内', '想看点治愈的'];
}

export default { buildPaopaoContext, quickPrompts };
