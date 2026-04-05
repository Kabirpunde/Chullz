import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Dimensions, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';

const { width, height } = Dimensions.get('window');
const TABLE_W = width - 32;
const TABLE_H = TABLE_W * 0.58;

const EMPTY_SEATS = [
  { label: 'Seat 1', top: -30, left: TABLE_W * 0.12 },
  { label: 'Seat 2', top: -30, left: TABLE_W * 0.5 - 28 },
  { label: 'Seat 3', top: -30, right: TABLE_W * 0.12 },
  { label: 'Seat 4', bottom: -30, right: TABLE_W * 0.12 },
  { label: 'Seat 5', bottom: -30, left: TABLE_W * 0.12 },
];

const COMMUNITY_CARDS = ['', '', '', '', ''];

export default function PokerTable() {
  const { user } = useAuth();
  const router = useRouter();
  const [actionSelected, setActionSelected] = useState<string | null>(null);

  if (!user) return null;

  return (
    <SafeAreaView style={styles.container} testID="poker-table-screen">
      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          testID="back-to-lobby-btn"
          style={styles.backBtn}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={20} color="#ffffff" />
          <Text style={styles.backBtnText}>Lobby</Text>
        </TouchableOpacity>
        <View style={styles.gameInfo}>
          <Text style={styles.gameInfoText}>Texas Hold'em</Text>
          <Text style={styles.blindsText}>Blinds: 25/50</Text>
        </View>
        <View style={styles.topRight}>
          <TouchableOpacity testID="table-menu-btn" style={styles.iconBtn}>
            <Ionicons name="menu" size={22} color="#ffffff" />
          </TouchableOpacity>
          <TouchableOpacity testID="table-chat-btn" style={styles.iconBtn}>
            <Ionicons name="chatbubble-ellipses-outline" size={20} color="#00f0ff" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Table Container */}
        <View style={styles.tableWrapper}>
          {/* Glow behind table */}
          <View style={styles.tableGlow} />

          {/* Poker Table */}
          <View style={styles.table}>
            {/* Felt inner */}
            <View style={styles.tableFelt}>
              {/* Game Info Text */}
              <View style={styles.tableCenterInfo}>
                <Text style={styles.tableCenterTitle}>♠ POKER CLUB ♠</Text>
                <Text style={styles.tableCenterSub}>Waiting for players...</Text>
              </View>

              {/* Community Cards */}
              <View style={styles.communityCards} testID="community-cards-area">
                {COMMUNITY_CARDS.map((_, i) => (
                  <View key={i} testID={`community-card-${i}`} style={styles.communityCard}>
                    <Text style={styles.communityCardText}>?</Text>
                  </View>
                ))}
              </View>

              {/* Pot */}
              <View style={styles.potArea}>
                <Text style={styles.potLabel}>POT</Text>
                <Text style={styles.potValue}>0 🪙</Text>
              </View>
            </View>

            {/* Dealer Button */}
            <View style={[styles.dealerBtn, { top: TABLE_H * 0.3, right: TABLE_W * 0.28 }]}>
              <Text style={styles.dealerBtnText}>D</Text>
            </View>

            {/* Empty Seats around table */}
            {EMPTY_SEATS.map((seat, i) => (
              <View key={i} testID={`seat-${i + 1}`} style={[styles.emptySeat, seat as any]}>
                <View style={styles.emptySeatCircle}>
                  <Text style={styles.emptySeatIcon}>+</Text>
                </View>
                <Text style={styles.emptySeatLabel}>{seat.label}</Text>
              </View>
            ))}
          </View>

          {/* Current Player (bottom center) */}
          <View style={styles.currentPlayer} testID="current-player-seat">
            <View style={[styles.currentPlayerAvatar, { backgroundColor: user.avatar_color + '30', borderColor: user.avatar_color }]}>
              <Text style={styles.currentPlayerEmoji}>{user.avatar}</Text>
            </View>
            <View style={styles.currentPlayerInfo}>
              <Text style={styles.currentPlayerName}>{user.username}</Text>
              <Text style={styles.currentPlayerChips}>🪙 {user.chips.toLocaleString()}</Text>
            </View>
            {/* Hole Cards */}
            <View style={styles.holeCards}>
              <View style={[styles.holeCard, { transform: [{ rotate: '-8deg' }] }]}>
                <Text style={styles.holeCardBack}>🂠</Text>
              </View>
              <View style={[styles.holeCard, { transform: [{ rotate: '8deg' }] }]}>
                <Text style={styles.holeCardBack}>🂠</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Coming Soon Banner */}
        <View style={styles.comingSoonBanner} testID="coming-soon-banner">
          <Ionicons name="time-outline" size={16} color="#ffb800" />
          <Text style={styles.comingSoonText}>Game logic coming soon — Table shell preview</Text>
        </View>
      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.actionBar} testID="action-bar">
        <TouchableOpacity
          testID="fold-btn"
          style={[styles.actionBtn, styles.foldBtn, actionSelected === 'fold' && styles.actionBtnActive]}
          onPress={() => setActionSelected('fold')}
          activeOpacity={0.8}
        >
          <Text style={[styles.actionBtnText, { color: '#ef4444' }]}>FOLD</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="check-btn"
          style={[styles.actionBtn, styles.checkBtn, actionSelected === 'check' && styles.actionBtnActive]}
          onPress={() => setActionSelected('check')}
          activeOpacity={0.8}
        >
          <Text style={[styles.actionBtnText, { color: '#ffffff' }]}>CHECK</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="raise-btn"
          style={[styles.actionBtn, styles.raiseBtn, actionSelected === 'raise' && styles.actionBtnActive]}
          onPress={() => setActionSelected('raise')}
          activeOpacity={0.8}
        >
          <Text style={[styles.actionBtnText, { color: '#0a0f1a' }]}>RAISE</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060b14' },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: '#0a0f1a',
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4 },
  backBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '600' },
  gameInfo: { alignItems: 'center' },
  gameInfoText: { fontSize: 14, fontWeight: '800', color: '#ffffff' },
  blindsText: { fontSize: 11, color: '#64748b' },
  topRight: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#131a2a', alignItems: 'center', justifyContent: 'center',
  },

  scrollContent: { alignItems: 'center', paddingVertical: 20 },

  tableWrapper: { width: TABLE_W, alignItems: 'center', marginBottom: 16 },

  tableGlow: {
    position: 'absolute',
    width: TABLE_W - 20, height: TABLE_H + 40,
    borderRadius: (TABLE_W - 20) / 2,
    backgroundColor: 'transparent',
    shadowColor: '#00f0ff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 30,
    elevation: 20,
  },

  table: {
    width: TABLE_W,
    height: TABLE_H,
    borderRadius: TABLE_W / 2,
    borderWidth: 14,
    borderColor: '#1a1a2e',
    overflow: 'visible',
    position: 'relative',
  },

  tableFelt: {
    flex: 1,
    backgroundColor: '#0e7a3e',
    borderRadius: TABLE_W / 2 - 6,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  tableCenterInfo: { alignItems: 'center', marginBottom: 8 },
  tableCenterTitle: { fontSize: 10, color: 'rgba(255,255,255,0.25)', fontWeight: '800', letterSpacing: 2 },
  tableCenterSub: { fontSize: 9, color: 'rgba(255,255,255,0.2)', letterSpacing: 1 },

  communityCards: { flexDirection: 'row', gap: 4, marginBottom: 6 },
  communityCard: {
    width: 32, height: 44, borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  communityCardText: { color: 'rgba(255,255,255,0.3)', fontSize: 14 },

  potArea: { alignItems: 'center' },
  potLabel: { fontSize: 8, color: 'rgba(255,255,255,0.3)', letterSpacing: 2 },
  potValue: { fontSize: 11, color: '#ffb800', fontWeight: '700' },

  dealerBtn: {
    position: 'absolute', width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#131a2a',
  },
  dealerBtnText: { fontSize: 11, fontWeight: '900', color: '#0a0f1a' },

  emptySeat: {
    position: 'absolute', alignItems: 'center', zIndex: 10,
  },
  emptySeatCircle: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#131a2a',
    borderWidth: 2, borderColor: '#1e293b',
    borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  emptySeatIcon: { fontSize: 22, color: '#334155' },
  emptySeatLabel: { fontSize: 8, color: '#334155', marginTop: 2 },

  currentPlayer: {
    marginTop: 20, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#131a2a', borderRadius: 20, padding: 12,
    borderWidth: 1, borderColor: '#1e293b',
    width: TABLE_W * 0.8,
    gap: 12,
  },
  currentPlayerAvatar: {
    width: 52, height: 52, borderRadius: 26, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  currentPlayerEmoji: { fontSize: 26 },
  currentPlayerInfo: { flex: 1 },
  currentPlayerName: { fontSize: 14, fontWeight: '800', color: '#ffffff' },
  currentPlayerChips: { fontSize: 12, color: '#ffb800', marginTop: 2 },
  holeCards: { flexDirection: 'row', gap: -12 },
  holeCard: {
    width: 36, height: 50, borderRadius: 4,
    backgroundColor: '#1e40af',
    borderWidth: 1, borderColor: '#3b82f6',
    alignItems: 'center', justifyContent: 'center',
  },
  holeCardBack: { fontSize: 28, color: '#ffffff' },

  comingSoonBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#ffb80015', borderRadius: 12,
    borderWidth: 1, borderColor: '#ffb80030',
    paddingHorizontal: 16, paddingVertical: 10,
    marginHorizontal: 16,
  },
  comingSoonText: { fontSize: 12, color: '#ffb800', fontWeight: '600' },

  actionBar: {
    flexDirection: 'row', gap: 8, padding: 12,
    backgroundColor: '#0a0f1acc',
    borderTopWidth: 1, borderTopColor: '#1e293b',
  },
  actionBtn: {
    flex: 1, paddingVertical: 16, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  actionBtnActive: { opacity: 0.7 },
  foldBtn: { backgroundColor: '#131a2a', borderColor: '#ef444444' },
  checkBtn: { backgroundColor: '#131a2a', borderColor: '#33415544' },
  raiseBtn: { backgroundColor: '#ffb800', borderColor: '#ffb800' },
  actionBtnText: { fontSize: 14, fontWeight: '900', letterSpacing: 1 },
});
