// Emotional weather: purely visual palette per mood key (keys match engine.js `moods`).
export const WEATHER = {
  '有点 emo': { label: 'emo', icon: '☁', a: '#2f5bd3', b: '#1b2f7a', ink: '#8fb0ff' },
  '超兴奋': { label: '兴奋', icon: '⚡', a: '#ff6a3d', b: '#d8342b', ink: '#ffae8a' },
  '甜甜的': { label: '甜蜜', icon: '♡', a: '#e46fd0', b: '#8b5cf6', ink: '#f6a6e6' },
  '好无聊': { label: '无聊', icon: '〰', a: '#6f9a86', b: '#51625a', ink: '#a9cbb9' },
  '有点焦虑': { label: '焦虑', icon: '≈', a: '#47d1d6', b: '#2d8ca6', ink: '#98eef0' },
  '想哭一场': { label: '想哭', icon: '☂', a: '#7f9dc4', b: '#4b5f86', ink: '#b8cbe6' },
  '有点愤怒': { label: '愤怒', icon: '✹', a: '#b3263a', b: '#6e1426', ink: '#f08a98' },
  '想笑一下': { label: '想笑', icon: '☀', a: '#ffd23f', b: '#f59e0b', ink: '#ffe38a' },
  '独自安静': { label: '独自安静', icon: '☾', a: '#4f46e5', b: '#2e2a8a', ink: '#a5a1ff' },
  '想被吓到': { label: '害怕', icon: '✦', a: '#6d28d9', b: '#3b1066', ink: '#c39bff' },
};

export const NEUTRAL = { label: '放映中', icon: '✧', a: '#9b6cf0', b: '#d9a441', ink: '#d3b8ff' };

export const weatherFor = (mode, mood) => (mode === 'mood' && WEATHER[mood]) || NEUTRAL;

export function applyWeather(w) {
  try {
    const root = document.documentElement.style;
    root.setProperty('--mood-a', w.a);
    root.setProperty('--mood-b', w.b);
    root.setProperty('--mood-ink', w.ink);
  } catch {
    /* ignore */
  }
}

export function applyTheme(theme) {
  try {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f6f2fb' : '#0e0f13');
  } catch {
    /* ignore */
  }
}
