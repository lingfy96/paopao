/**
 * Paopao's own lines. Event driven and entirely local: a character greeting must never
 * spend an AI request. `pickLine` enforces per line cooldowns so the bubble stays rare.
 */
export const LINES = [
  { id: 'idle-1', category: 'idle', trigger: 'idle', text: '今晚的好故事，藏在下一张卡里。', cooldown: 240000, weight: 3 },
  { id: 'idle-2', category: 'idle', trigger: 'idle', text: '我在这儿，想聊电影随时叫我。', cooldown: 300000, weight: 2 },
  { id: 'idle-3', category: 'idle', trigger: 'idle', text: '有时候，喜剧真的比糖甜。', cooldown: 300000, weight: 1 },
  { id: 'open-1', category: 'preOpen', trigger: 'open:ready', text: '深呼吸，准备开盒。', cooldown: 90000, weight: 3 },
  { id: 'open-2', category: 'preOpen', trigger: 'open:ready', text: '这一颗，我有点想偷看。', cooldown: 120000, weight: 2 },
  { id: 'mood-happy', category: 'mood', trigger: 'mood:selected', mood: '想笑一下', text: '那就挑一部，笑到忘记时间。', cooldown: 60000, weight: 2 },
  { id: 'mood-sweet', category: 'mood', trigger: 'mood:selected', mood: '甜甜的', text: '甜的故事，我这儿有不少。', cooldown: 60000, weight: 2 },
  { id: 'mood-emo', category: 'mood', trigger: 'mood:selected', mood: '有点 emo', text: '心情多云？那就挑一部轻一点的。', cooldown: 60000, weight: 2 },
  { id: 'mood-cry', category: 'mood', trigger: 'mood:selected', mood: '想哭一场', text: '哭完会舒服一点，我陪着你。', cooldown: 60000, weight: 2 },
  { id: 'mood-scared', category: 'mood', trigger: 'mood:selected', mood: '想被吓到', text: '灯要不要留一盏？', cooldown: 60000, weight: 2 },
  { id: 'mood-quiet', category: 'mood', trigger: 'mood:selected', mood: '独自安静', text: '安静的夜晚，适合慢一点的电影。', cooldown: 60000, weight: 2 },
  { id: 'mood-anxious', category: 'mood', trigger: 'mood:selected', mood: '有点焦虑', text: '先松一口气，我们慢慢挑。', cooldown: 60000, weight: 2 },
  { id: 'mood-any', category: 'mood', trigger: 'mood:selected', text: '记住这个心情了。', cooldown: 45000, weight: 1 },
  { id: 'movie-1', category: 'movie', trigger: 'movie:revealed', text: '想知道为什么是它吗？', cooldown: 100000, weight: 4, ask: '为什么推荐这部？' },
  { id: 'movie-2', category: 'movie', trigger: 'movie:revealed', text: '要我无剧透讲讲这部吗？', cooldown: 150000, weight: 2, ask: '无剧透介绍一下这部' },
  { id: 'movie-3', category: 'movie', trigger: 'movie:revealed', text: '这张，配今晚刚好。', cooldown: 180000, weight: 1 },
  { id: 'ssr-1', category: 'movie', trigger: 'movie:ssr', text: '哇，这张很少见。', cooldown: 60000, weight: 3 },
  { id: 'watch-1', category: 'success', trigger: 'watchlist:added', text: '存好了，别忘记看。', cooldown: 45000, weight: 2 },
  { id: 'checkin-1', category: 'success', trigger: 'checkin:success', text: '又一张票根，真好。', cooldown: 45000, weight: 2 },
  { id: 'black-1', category: 'success', trigger: 'blacklist:tear', text: '好，以后不再给你它。', cooldown: 45000, weight: 2 },
  { id: 'return-1', category: 'return', trigger: 'session:return', text: '你回来啦，今晚想看什么？', cooldown: 600000, weight: 3 },
  { id: 'return-2', category: 'return', trigger: 'session:return', text: '想送你一朵花，爆米花。', cooldown: 900000, weight: 1 },
  { id: 'yawn-1', category: 'idle', trigger: 'idle:long', text: '我打个哈欠，你慢慢挑。', cooldown: 300000, weight: 1 },
];

const DEFAULT_COOLDOWN = 60000;

/**
 * Deterministic when `rng` is supplied. Returns null when everything is still cooling down,
 * which is the normal case: the bubble should be a surprise, not a ticker.
 */
export function pickLine(trigger, { mood = '', now = 0, seen = new Map(), rng = Math.random } = {}) {
  const exact = LINES.filter((line) => line.trigger === trigger && line.mood === mood);
  const generic = LINES.filter((line) => line.trigger === trigger && !line.mood);
  const available = (exact.length ? exact : generic).filter(
    (line) => now - (seen.get(line.id) ?? -Infinity) >= (line.cooldown ?? DEFAULT_COOLDOWN),
  );
  if (!available.length) return null;
  const total = available.reduce((sum, line) => sum + (line.weight || 1), 0);
  let ticket = rng() * total;
  for (const line of available) {
    ticket -= line.weight || 1;
    if (ticket <= 0) return line;
  }
  return available[available.length - 1];
}

export default { LINES, pickLine };
