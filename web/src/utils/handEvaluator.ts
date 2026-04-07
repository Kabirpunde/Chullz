// Client-side hand evaluator - ported from the Expo app

const RANK_VAL: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};
const RANK_SHORT: Record<number, string> = {
  2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A',1:'A',
};
const RANK_DISP: Record<number, string> = {
  2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'Jack',12:'Queen',13:'King',14:'Ace',1:'Ace',
};

function rv(card: string): number { return RANK_VAL[card[0]] ?? 0; }
function suit(card: string): string { return card[1]; }

export function cardRank(card: string): string { return RANK_SHORT[rv(card)] ?? card[0]; }
export function cardSuit(card: string): string {
  const s = suit(card);
  return s === 'h' ? '♥' : s === 'd' ? '♦' : s === 'c' ? '♣' : '♠';
}
export function isRed(card: string): boolean { return card[1] === 'h' || card[1] === 'd'; }

function poly(lst: number[]): number {
  return lst.reduce((acc, v, i) => acc + v * Math.pow(15, lst.length - 1 - i), 0);
}

function eval5(cards: string[]): number {
  let vals = cards.map(rv).sort((a, b) => b - a);
  const suits = cards.map(suit);
  const isFlush = new Set(suits).size === 1;
  const unique = [...new Set(vals)].sort((a, b) => a - b);
  let isStraight = unique.length === 5 && unique[4] - unique[0] === 4;
  const isWheel = new Set(vals).size === 5 && vals[0] === 14 && [2,3,4,5].every(v => vals.includes(v));
  if (isWheel) { isStraight = true; vals = [5,4,3,2,1]; }
  const cnt: Record<number,number> = {};
  vals.forEach(v => { cnt[v] = (cnt[v] ?? 0) + 1; });
  const groups = Object.entries(cnt)
    .sort(([av,ac],[bv,bc]) => +bc !== +ac ? +bc - +ac : +bv - +av);
  const gv = groups.map(([v]) => parseInt(v));
  const gc = groups.map(([,c]) => +c);
  if (isStraight && isFlush) return 8_000_000_000 + poly(vals);
  if (gc[0] === 4) return 7_000_000_000 + poly(gv);
  if (gc[0] === 3 && gc[1] === 2) return 6_000_000_000 + poly(gv);
  if (isFlush) return 5_000_000_000 + poly(vals);
  if (isStraight) return 4_000_000_000 + poly(vals);
  if (gc[0] === 3) return 3_000_000_000 + poly(gv);
  if (gc[0] === 2 && gc[1] === 2) return 2_000_000_000 + poly(gv);
  if (gc[0] === 2) return 1_000_000_000 + poly(gv);
  return poly(vals);
}

function desc5(cards: string[]): string {
  let vals = cards.map(rv).sort((a, b) => b - a);
  const suits = cards.map(suit);
  const isFlush = new Set(suits).size === 1;
  const unique = [...new Set(vals)].sort((a, b) => a - b);
  let isStraight = unique.length === 5 && unique[4] - unique[0] === 4;
  const isWheel = new Set(vals).size === 5 && vals[0] === 14 && [2,3,4,5].every(v => vals.includes(v));
  if (isWheel) { isStraight = true; vals = [5,4,3,2,1]; }
  const cnt: Record<number,number> = {};
  vals.forEach(v => { cnt[v] = (cnt[v] ?? 0) + 1; });
  const groups = Object.entries(cnt).sort(([av,ac],[bv,bc]) => { const dc = +bc - +ac; return dc !== 0 ? dc : +bv - +av; });
  const gv = groups.map(([v]) => parseInt(v));
  const gc = groups.map(([,c]) => +c);
  const rn = (v: number) => RANK_DISP[v] ?? String(v);
  if (isStraight && isFlush) { if (vals[0] === 14 && vals[1] === 13) return 'Royal Flush'; return `Straight Flush, ${rn(vals[0])} high`; }
  if (gc[0] === 4) return `Four of a Kind, ${rn(gv[0])}s`;
  if (gc[0] === 3 && gc[1] === 2) return `Full House, ${rn(gv[0])}s full of ${rn(gv[1])}s`;
  if (isFlush) return `Flush, ${rn(vals[0])} high`;
  if (isStraight) return `Straight, ${rn(vals[0])} high`;
  if (gc[0] === 3) return `Three of a Kind, ${rn(gv[0])}s`;
  if (gc[0] === 2 && gc[1] === 2) return `Two Pair, ${rn(gv[0])}s and ${rn(gv[1])}s`;
  if (gc[0] === 2) return `Pair of ${rn(gv[0])}s`;
  return `High Card ${rn(vals[0])}`;
}

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  return [...combinations(rest, k - 1).map(c => [first, ...c]), ...combinations(rest, k)];
}

export interface HandResult { score: number; description: string; best5: string[]; }

export function bestHand(allCards: string[]): HandResult {
  if (allCards.length < 5) return { score: 0, description: 'Incomplete', best5: allCards };
  let best: HandResult = { score: -1, description: '', best5: [] };
  for (const combo of combinations(allCards, 5)) {
    const sc = eval5(combo);
    if (sc > best.score) best = { score: sc, description: desc5(combo), best5: combo };
  }
  return best;
}

export function handPreview(holeCards: string[], communityCards: string[]): HandResult | null {
  if (holeCards.length !== 2) return null;
  const all = [...holeCards, ...communityCards];
  if (all.length < 5) return null;
  return bestHand(all);
}
