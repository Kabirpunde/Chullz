import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { cardRank, cardSuit, isRed } from '../utils/handEvaluator';

interface CardProps {
  card?: string;          // e.g. "Ah", null = face-down
  size?: 'xs' | 'sm' | 'md' | 'lg';
  selected?: boolean;
  assigned?: boolean;
  faceDown?: boolean;
  dimmed?: boolean;
}

const SIZES = {
  xs: { w: 28, h: 38, rank: 10, suit: 10, radius: 4 },
  sm: { w: 36, h: 50, rank: 13, suit: 13, radius: 5 },
  md: { w: 46, h: 64, rank: 17, suit: 16, radius: 6 },
  lg: { w: 60, h: 84, rank: 22, suit: 20, radius: 8 },
};

export default function PlayingCard({
  card, size = 'md', selected = false, assigned = false,
  faceDown = false, dimmed = false,
}: CardProps) {
  const s = SIZES[size];
  const showBack = faceDown || !card;
  const red = card ? isRed(card) : false;
  const rank = card ? cardRank(card) : '';
  const suit = card ? cardSuit(card) : '';

  if (showBack) {
    return (
      <View style={[styles.card, { width: s.w, height: s.h, borderRadius: s.radius },
        styles.cardBack, selected && styles.selected, dimmed && styles.dimmed]}>
        <Text style={[styles.backPattern, { fontSize: s.rank }]}>🂠</Text>
      </View>
    );
  }

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
      <Text style={[styles.corner, { fontSize: s.rank, color: red ? '#dc2626' : '#111827' }]}>
        {rank}
      </Text>
      <Text style={[styles.suitCenter, { fontSize: s.suit, color: red ? '#dc2626' : '#111827' }]}>
        {suit}
      </Text>
      <Text style={[styles.cornerBottom, { fontSize: s.rank, color: red ? '#dc2626' : '#111827' }]}>
        {rank}
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
    position: 'relative',
  },
  cardBack: {
    backgroundColor: '#1e3a8a',
    borderColor: '#1e40af',
  },
  backPattern: { color: '#93c5fd' },
  corner: {
    position: 'absolute', top: 2, left: 4,
    fontWeight: '900', lineHeight: 14,
  },
  cornerBottom: {
    position: 'absolute', bottom: 2, right: 4,
    fontWeight: '900', lineHeight: 14,
    transform: [{ rotate: '180deg' }],
  },
  suitCenter: { fontWeight: '700' },
  selected: {
    borderColor: '#00f0ff',
    borderWidth: 2,
    shadowColor: '#00f0ff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 8,
    transform: [{ translateY: -4 }],
  },
  assigned: {
    borderColor: '#22c55e',
    borderWidth: 2,
    opacity: 0.85,
  },
  dimmed: { opacity: 0.35 },
});
