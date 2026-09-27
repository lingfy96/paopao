/**
 * The only App operations the model may request. Anything outside this table — including
 * destructive work like deleting blacklist entries or clearing history — is refused here and
 * never reaches the App. Low risk actions run immediately; `confirm` actions only prefill an
 * existing UI so the user still presses the button.
 */
export const ALLOWED_ACTIONS = {
  rerollMovie: { risk: 'low', params: {} },
  setMood: { risk: 'low', params: { mood: 'mood' } },
  addWatchlist: { risk: 'low', params: { movieId: 'movieId' } },
  removeWatchlist: { risk: 'low', params: { movieId: 'movieId' } },
  openMovie: { risk: 'low', params: { movieId: 'movieId' } },
  openCheckin: { risk: 'low', params: { movieId: 'movieId?' } },
  openBlacklistAdd: { risk: 'confirm', params: { type: 'blacklistType', name: 'name' } },
};

export const ACTION_LABEL = {
  rerollMovie: '再来一张', setMood: '设置心情', addWatchlist: '加入想看', removeWatchlist: '取消想看',
  openMovie: '打开详情', openCheckin: '打开打卡', openBlacklistAdd: '添加到黑名单',
};

const BLACKLIST_TYPES = ['actor', 'genre', 'title'];

function checkValue(kind, value, options) {
  const optional = kind.endsWith('?');
  const type = optional ? kind.slice(0, -1) : kind;
  if (value === undefined || value === null) return optional ? { ok: true, value: undefined } : { ok: false };
  if (type === 'movieId') {
    const id = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
    if (!Number.isInteger(id) || !options.movieIds?.includes(id)) return { ok: false };
    return { ok: true, value: id };
  }
  if (type === 'mood') {
    if (typeof value !== 'string' || !options.moods?.includes(value)) return { ok: false };
    return { ok: true, value };
  }
  if (type === 'blacklistType') {
    if (!BLACKLIST_TYPES.includes(value)) return { ok: false };
    return { ok: true, value };
  }
  if (type === 'name') {
    if (typeof value !== 'string' || !value.trim()) return { ok: false };
    return { ok: true, value: value.trim().slice(0, 100) };
  }
  return { ok: false };
}

/**
 * @returns {{ok: true, action: {name: string, params: object, risk: string}} | {ok: false, reason: string}}
 */
export function validateAction(raw, options = {}) {
  if (!raw || typeof raw !== 'object' || typeof raw.name !== 'string') return { ok: false, reason: 'malformed' };
  // Own-property only: a name like `__proto__` must not resolve through the prototype chain.
  if (!Object.hasOwn(ALLOWED_ACTIONS, raw.name)) return { ok: false, reason: 'not-allowed' };
  const spec = ALLOWED_ACTIONS[raw.name];
  const source = raw.params && typeof raw.params === 'object' && !Array.isArray(raw.params) ? raw.params : {};
  const params = {};
  for (const [key, kind] of Object.entries(spec.params)) {
    const result = checkValue(kind, source[key], options);
    if (!result.ok) return { ok: false, reason: `bad-param:${key}` };
    if (result.value !== undefined) params[key] = result.value;
  }
  return { ok: true, action: { name: raw.name, params, risk: spec.risk } };
}

export default { ALLOWED_ACTIONS, ACTION_LABEL, validateAction };
