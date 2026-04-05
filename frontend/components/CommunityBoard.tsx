import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import PlayingCard from './PlayingCard';

interface BoardState {
  board_id: number;
  flop: string[];
  turn: string;
  river: string;
}

interface CommunityBoardProps {
  board: BoardState;
  round: string;
  highlight?: boolean;
  winnerDescription?: string;
  compact?: boolean;
}

const ROUND_ORDER = ['preflop', 'flop', 'turn', 'river', 'assignment', 'showdown'];

export default function CommunityBoard({
  board, round, highlight = false, winnerDescription, compact = false,
}: CommunityBoardProps) {
  const cardSize = compact ? 'xs' : 'sm';
  const roundIdx = ROUND_ORDER.indexOf(round);
  const showFlop = roundIdx >= 1 && board.flop.length > 0;
  const showTurn = roundIdx >= 2 && board.turn;
  const showRiver = roundIdx >= 3 && board.river;

  const cards: (string | null)[] = [
    showFlop ? board.flop[0] : null,
    showFlop ? board.flop[1] : null,
    showFlop ? board.flop[2] : null,
    showTurn ? board.turn : null,
    showRiver ? board.river : null,
  ];

  const boardColors = ['#3b82f6', '#22c55e', '#f59e0b'];
  const borderColor = boardColors[(board.board_id - 1) % 3];

  return (
    <View
      testID={`board-${board.board_id}`}
      style={[styles.container, compact && styles.compactContainer,
              highlight && { borderColor, borderWidth: 2 }]}
    >
      <Text style={[styles.label, { color: borderColor }]}>
        Board {board.board_id}
      </Text>
      <View style={styles.cards}>
        {cards.map((card, i) => (
          <View key={i} style={compact ? styles.cardSlotSm : styles.cardSlot}>
            {card ? (
              <PlayingCard card={card} size={cardSize} />
            ) : (
              <View style={[
                styles.emptyCard,
                compact ? styles.emptyCardSm : styles.emptyCardMd,
              ]}>
                <Text style={styles.emptyText}>?</Text>
              </View>
            )}
          </View>
        ))}
      </View>
      {winnerDescription && (
        <View style={[styles.winnerBadge, { backgroundColor: borderColor + '22', borderColor }]}>
          <Text style={[styles.winnerText, { color: borderColor }]} numberOfLines={1}>
            🏆 {winnerDescription}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0e7a3e',
    borderRadius: 12, padding: 8,
    borderWidth: 1, borderColor: '#1e4d2b',
    alignItems: 'center',
  },
  compactContainer: { padding: 5, borderRadius: 8 },
  label: {
    fontSize: 10, fontWeight: '900', letterSpacing: 1.5,
    marginBottom: 6, textTransform: 'uppercase',
  },
  cards: { flexDirection: 'row', gap: 3, alignItems: 'center' },
  cardSlot: { marginHorizontal: 1 },
  cardSlotSm: { marginHorizontal: 0.5 },
  emptyCard: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  emptyCardMd: { width: 36, height: 50 },
  emptyCardSm: { width: 28, height: 38 },
  emptyText: { color: 'rgba(255,255,255,0.3)', fontSize: 14 },
  winnerBadge: {
    marginTop: 6, borderRadius: 8, borderWidth: 1,
    paddingHorizontal: 8, paddingVertical: 3,
    maxWidth: '100%',
  },
  winnerText: { fontSize: 10, fontWeight: '700' },
});
