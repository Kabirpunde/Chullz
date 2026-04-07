import React from 'react';
import { cardRank, cardSuit } from '../utils/handEvaluator';

interface CardProps {
  card?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  selected?: boolean;
  assigned?: boolean;
  faceDown?: boolean;
  dimmed?: boolean;
}

const SIZES = {
  xs: { w: 30, h: 42, rank: 11, suit: 11, radius: 4 },
  sm: { w: 38, h: 54, rank: 14, suit: 14, radius: 5 },
  md: { w: 52, h: 72, rank: 18, suit: 20, radius: 7 },
  lg: { w: 66, h: 92, rank: 24, suit: 26, radius: 9 },
};

const SUIT_COLORS: Record<string, string> = {
  h: '#dc2626',
  d: '#1d4ed8',
  c: '#16a34a',
  s: '#111827',
};

export default function PlayingCard({
  card, size = 'md', selected = false, assigned = false,
  faceDown = false, dimmed = false,
}: CardProps) {
  const s = SIZES[size];
  const showBack = faceDown || !card;

  const baseStyle: React.CSSProperties = {
    width: s.w,
    height: s.h,
    borderRadius: s.radius,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    position: 'relative',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
    opacity: dimmed ? 0.3 : 1,
  };

  if (showBack) {
    return (
      <div style={{
        ...baseStyle,
        background: 'linear-gradient(135deg, #1e3a8a, #1e40af)',
        border: selected ? '2.5px solid #00f0ff' : '1px solid #1e40af',
        boxShadow: selected ? '0 0 12px #00f0ff80' : 'none',
        transform: selected ? 'translateY(-5px)' : 'none',
      }}>
        <span style={{ fontSize: s.rank, color: '#93c5fd' }}>🂠</span>
      </div>
    );
  }

  const suitChar = card[1];
  const color = SUIT_COLORS[suitChar] ?? '#111827';
  const rank = cardRank(card);
  const suitSym = cardSuit(card);

  return (
    <div
      className={size === 'md' || size === 'lg' ? 'playing-card' : ''}
      style={{
        ...baseStyle,
        background: '#ffffff',
        border: selected ? '2.5px solid #00f0ff' : assigned ? '2px solid #22c55e' : '1px solid #e5e7eb',
        boxShadow: selected ? '0 0 12px #00f0ff80' : 'none',
        transform: selected ? 'translateY(-6px)' : 'none',
      }}
    >
      <span style={{
        fontSize: s.rank,
        fontWeight: 900,
        color,
        lineHeight: 1,
        letterSpacing: '-0.5px',
      }}>{rank}</span>
      <span style={{
        fontSize: s.suit,
        color,
        lineHeight: 1,
        marginTop: -2,
      }}>{suitSym}</span>
    </div>
  );
}
