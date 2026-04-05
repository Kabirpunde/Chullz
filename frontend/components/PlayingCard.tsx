import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { cardRank, cardSuit } from '../utils/handEvaluator';

interface CardProps {
  card?: string;
  size?: 'tiny' | 'xs' | 'sm' | 'md' | 'lg';
  selected?: boolean;
  assigned?: boolean;
  faceDown?: boolean;
  dimmed?: boolean;
}

const SIZES = {
  tiny: { w: 22, h: 30, rank: 9,  suit: 9,  radius: 3 },
  xs:   { w: 30, h: 40, rank: 12, suit: 12, radius: 4 },
  sm:   { w: 38, h: 52, rank: 14, suit: 15, radius: 5 },
  md:   { w: 50, h: 68, rank: 18, suit: 20, radius: 6 },
  lg:   { w: 64, h: 88, rank: 24, suit: 26, radius: 8 },
};

// Suit colours as requested: diamonds=blue, clubs=green, spades=dark, hearts=red
const SUIT_COLORS: Record<string, string> = {
  h: '#dc2626', // hearts   — red
  d: '#1d4ed8', // diamonds — blue
  c: '#16a34a', // clubs    — green
  s: '#111827', // spades   — dark
};

export default function PlayingCard({
  card, size = 'md', selected = false, assigned = false,
  faceDown = false, dimmed = false,
}: CardProps) {
  const s = SIZES[size];
  const showBack = faceDown || !card;

  if (showBack) {
    return (
      <View style={[
        styles.card, { width: s.w, height: s.h, borderRadius: s.radius },
        styles.cardBack,
        selected && styles.selected,
        dimmed && styles.dimmed,
      ]}>
        <Text style={[styles.backText, { fontSize: s.rank }]}>🂠</Text>
      </View>
    );
  }

  const suitChar = card[1];
  const color = SUIT_COLORS[suitChar] ?? '#111827';
  const rank = cardRank(card);
  const suitSym = cardSuit(card);

  return (
    <View
      testID={`card-${card}`}
      style={[
        styles.card, { width: s.w, height: s.h, borderRadius: s.radius },
        selected && styles.selected,
        assigned && styles.assigned,
        dimmed && styles.dimmed,
      ]}
    >
      <Text style={[styles.rankText, { fontSize: s.rank, color }]} numberOfLines={1}>
        {rank}
      </Text>
      <Text style={[styles.suitText, { fontSize: s.suit, color }]}>
        {suitSym}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
  },
  cardBack: {
    backgroundColor: '#1e3a8a',
    borderColor: '#1e40af',
  },
  backText: { color: '#93c5fd' },
  rankText: {
    fontWeight: '900',
    lineHeight: undefined,
    includeFontPadding: false,
  },
  suitText: {
    fontWeight: '700',
    lineHeight: undefined,
    includeFontPadding: false,
    marginTop: -2,
  },
  selected: {
    borderColor: '#00f0ff',
    borderWidth: 2.5,
    shadowColor: '#00f0ff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 8,
    elevation: 10,
    transform: [{ translateY: -5 }],
  },
  assigned: {
    borderColor: '#22c55e',
    borderWidth: 2,
    opacity: 0.9,
  },
  dimmed: { opacity: 0.3 },
});
