// 故事蛋 (story egg): grows from opening boxes, daily streaks and feeding, then hatches a sea creature.

export const HATCH_XP = 6;

export const SPECIES = [
  { id: 'fish', name: '泡泡鱼', rarity: '常见', weight: 46, action: '吐泡泡' },
  { id: 'jelly', name: '月光水母', rarity: '少见', weight: 26, action: '发光' },
  { id: 'dolphin', name: '跃浪海豚', rarity: '稀有', weight: 15, action: '摆尾' },
  { id: 'octopus', name: '八爪章鱼', rarity: '史诗', weight: 9, action: '转圈' },
  { id: 'whale', name: '深海鲸', rarity: '隐藏', weight: 4, action: '喷大泡泡' },
];
export const speciesById = Object.fromEntries(SPECIES.map((s) => [s.id, s]));

export const defaultEgg = () => ({ food: 0, xp: 0, streak: 0, lastDay: '', opens: 0, luck: 0, creatures: [] });

const dayKey = (d = new Date()) => d.toLocaleDateString('en-CA');
const yesterdayOf = (today) => {
  const d = new Date(today + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  return dayKey(d);
};

/** Accepts the legacy `pet` shape ({food,xp}) or a partial/corrupt egg. */
export function normalizeEgg(raw, legacyPet) {
  const e = defaultEgg();
  const src = raw && typeof raw === 'object' ? raw : legacyPet && typeof legacyPet === 'object' ? legacyPet : {};
  for (const k of ['food', 'xp', 'streak', 'opens', 'luck']) if (Number.isFinite(src[k]) && src[k] >= 0) e[k] = src[k];
  if (typeof src.lastDay === 'string') e.lastDay = src.lastDay;
  if (Array.isArray(src.creatures)) e.creatures = src.creatures.filter((c) => c && speciesById[c.species]);
  return e;
}

export function pickSpecies(luck = 0, rng = Math.random) {
  const boost = Math.min(3, luck);
  const weights = SPECIES.map((s, i) => s.weight * (i === 0 ? 1 : 1 + boost * 0.35 * i));
  let r = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < SPECIES.length; i++) {
    r -= weights[i];
    if (r < 0) return SPECIES[i].id;
  }
  return SPECIES[0].id;
}

function hatch(egg, rng) {
  let e = egg;
  const born = [];
  while (e.xp >= HATCH_XP) {
    const species = pickSpecies(e.luck, rng);
    const creature = { id: `${Date.now().toString(36)}-${Math.floor(rng() * 1e6).toString(36)}`, species, bornAt: new Date().toISOString() };
    born.push(creature);
    e = { ...e, xp: e.xp - HATCH_XP, luck: 0, creatures: [...e.creatures, creature].slice(-24) };
  }
  return { egg: e, born };
}

/** One box opened. SSR pulls and streaks add luck toward rarer creatures. */
export function onOpen(egg, { couple = false, rarity = 'R', today = dayKey() } = {}, rng = Math.random) {
  let streak = egg.streak;
  let bonus = 0;
  if (egg.lastDay !== today) {
    streak = egg.lastDay === yesterdayOf(today) ? streak + 1 : 1;
    if (streak >= 2) bonus = 1;
  }
  const luck = egg.luck + (rarity === 'SSR' ? 1 : 0) + (bonus ? 0.5 : 0);
  return hatch(
    { ...egg, opens: egg.opens + 1, food: egg.food + (couple ? 2 : 1), xp: egg.xp + 1 + bonus, streak, lastDay: today, luck },
    rng,
  );
}

export function feed(egg, rng = Math.random) {
  if (egg.food <= 0) return { egg, born: [] };
  return hatch({ ...egg, food: egg.food - 1, xp: egg.xp + 1 }, rng);
}

export const eggStage = (xp) => (xp >= HATCH_XP - 1 ? 'wiggle' : xp >= Math.ceil(HATCH_XP / 2) ? 'crack' : 'egg');
