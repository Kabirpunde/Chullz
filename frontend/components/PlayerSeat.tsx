import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface PlayerSeatProps {
  player: {
    user_id: string;
    username: string;
    avatar: string;
    avatar_color: string;
    chips: number;
    status: string;
    bet_street: number;
    seat: number;
  };
  isCurrentTurn?: boolean;
  isDealer?: boolean;
  isSB?: boolean;
  isBB?: boolean;
  isMe?: boolean;
  compact?: boolean;
}

export default function PlayerSeat({
  player, isCurrentTurn = false, isDealer = false,
  isSB = false, isBB = false, isMe = false, compact = false,
}: PlayerSeatProps) {
  const isFolded = player.status === 'folded';
  const isAllIn = player.status === 'all_in';

  return (
    <View
      testID={`player-seat-${player.seat}`}
      style={[
        styles.container,
        compact && styles.compact,
        isCurrentTurn && styles.activeTurn,
        isFolded && styles.folded,
        isMe && styles.isMe,
      ]}
    >
      {/* Avatar */}
      <View style={[
        styles.avatar,
        { backgroundColor: player.avatar_color + '30', borderColor: player.avatar_color },
        isCurrentTurn && { borderColor: '#ffb800', borderWidth: 2 },
      ]}>
        <Text style={[styles.avatarText, compact && styles.avatarTextSm]}>
          {player.avatar}
        </Text>
        {isCurrentTurn && <View style={styles.turnRing} />}
      </View>

      {/* Info */}
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, compact && styles.nameSm, isFolded && styles.foldedText]}
            numberOfLines={1}>
            {player.username}
            {isMe ? ' (You)' : ''}
          </Text>
          {isDealer && <View style={styles.badge}><Text style={styles.badgeD}>D</Text></View>}
          {isSB && <View style={[styles.badge, { backgroundColor: '#3b82f640' }]}><Text style={styles.badgeSB}>SB</Text></View>}
          {isBB && <View style={[styles.badge, { backgroundColor: '#f59e0b40' }]}><Text style={styles.badgeBB}>BB</Text></View>}
          {isAllIn && <View style={[styles.badge, { backgroundColor: '#ef444440' }]}><Text style={styles.badgeAI}>ALL IN</Text></View>}
        </View>
        <Text style={[styles.chips, compact && styles.chipsSm]}>
          🪙 {player.chips.toLocaleString()}
        </Text>
      </View>

      {/* Current bet */}
      {player.bet_street > 0 && (
        <View style={styles.betBadge} testID={`player-bet-${player.seat}`}>
          <Text style={styles.betText}>{player.bet_street.toLocaleString()}</Text>
        </View>
      )}

      {/* Fold overlay */}
      {isFolded && (
        <View style={styles.foldOverlay}>
          <Text style={styles.foldOverlayText}>FOLD</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#131a2a', borderRadius: 14,
    borderWidth: 1, borderColor: '#1e293b',
    padding: 8, position: 'relative', overflow: 'hidden',
  },
  compact: { padding: 5, borderRadius: 10, gap: 6 },
  activeTurn: {
    borderColor: '#ffb800',
    shadowColor: '#ffb800', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6, shadowRadius: 8, elevation: 8,
  },
  folded: { opacity: 0.5 },
  isMe: { borderColor: '#00f0ff33' },

  avatar: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 22 },
  avatarTextSm: { fontSize: 16 },
  turnRing: {
    position: 'absolute', inset: -3,
    borderRadius: 25, borderWidth: 2, borderColor: '#ffb800',
  },

  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  name: { fontSize: 13, fontWeight: '700', color: '#ffffff' },
  nameSm: { fontSize: 11 },
  foldedText: { color: '#64748b' },
  chips: { fontSize: 12, color: '#ffb800', fontWeight: '600', marginTop: 1 },
  chipsSm: { fontSize: 10 },

  badge: {
    backgroundColor: '#1e293b', borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  badgeD: { fontSize: 9, fontWeight: '900', color: '#ffffff' },
  badgeSB: { fontSize: 8, fontWeight: '900', color: '#3b82f6' },
  badgeBB: { fontSize: 8, fontWeight: '900', color: '#f59e0b' },
  badgeAI: { fontSize: 8, fontWeight: '900', color: '#ef4444' },

  betBadge: {
    backgroundColor: '#ffb80022', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: '#ffb80044',
  },
  betText: { fontSize: 11, fontWeight: '700', color: '#ffb800' },

  foldOverlay: {
    position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 14, alignItems: 'center', justifyContent: 'center',
  },
  foldOverlayText: { fontSize: 12, fontWeight: '900', color: '#ef4444', letterSpacing: 2 },
});
