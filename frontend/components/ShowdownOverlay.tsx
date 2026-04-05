import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Dimensions,
} from 'react-native';
import PlayingCard from './PlayingCard';

const { height } = Dimensions.get('window');

interface PublicPlayer {
  user_id: string;
  username: string;
  avatar: string;
  avatar_color: string;
  chips: number;
  status: string;
}
interface BoardState { board_id: number; flop: string[]; turn: string; river: string; }
interface ShowdownResult {
  player_results: Record<string, Record<string, any>>;
  board_winners: Record<string, string[]>;
  points: Record<string, number>;
  chips_won: Record<string, number>;
  pot: number;
  uncontested?: boolean;
  winner_username?: string;
  hole_cards_revealed: Record<string, string[]>;
  player_statuses: Record<string, string>;
}
interface ShowdownOverlayProps {
  visible: boolean;
  result: ShowdownResult | null;
  boards: BoardState[];
  players: PublicPlayer[];
  myUserId: string;
  onClose: () => void;
}

const BOARD_KEYS = ['board_1', 'board_2', 'board_3'];
const BOARD_NAMES = ['Board 1', 'Board 2', 'Board 3'];
const BOARD_COLORS = ['#3b82f6', '#22c55e', '#f59e0b'];

export default function ShowdownOverlay({
  visible, result, boards, players, myUserId, onClose,
}: ShowdownOverlayProps) {
  const [countdown, setCountdown] = useState(8);

  useEffect(() => {
    if (!visible) { setCountdown(8); return; }
    const interval = setInterval(() => {
      setCountdown(s => {
        if (s <= 1) { clearInterval(interval); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [visible]);

  if (!result) return null;

  const getName = (uid: string) => players.find(p => p.user_id === uid)?.username ?? uid;
  const getAvatar = (uid: string) => players.find(p => p.user_id === uid)?.avatar ?? '?';
  const getColor = (uid: string) => players.find(p => p.user_id === uid)?.avatar_color ?? '#ffffff';

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>
              {result.uncontested ? '🃏 UNCONTESTED WIN' : '🃏 SHOWDOWN'}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeTxt}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {result.uncontested ? (
              <View style={styles.uncontestedBox}>
                <Text style={styles.uncontestedText}>
                  {result.winner_username} takes the pot!
                </Text>
                <Text style={styles.potAmt}>🪙 {result.pot.toLocaleString()}</Text>
              </View>
            ) : (
              <>
                {/* Per-board results */}
                {BOARD_KEYS.map((bk, i) => {
                  const winners = result.board_winners[bk] ?? [];
                  const color = BOARD_COLORS[i];
                  const board = boards[i];
                  const communityCards = board
                    ? [...board.flop, board.turn, board.river].filter(Boolean)
                    : [];

                  const activePlayers = Object.keys(result.player_results);

                  return (
                    <View key={bk} style={[styles.boardResult, { borderColor: color + '50' }]}>
                      <View style={styles.boardHeader}>
                        <Text style={[styles.boardTitle, { color }]}>{BOARD_NAMES[i]}</Text>
                        <View style={styles.communityCards}>
                          {communityCards.map((card, ci) => (
                            <PlayingCard key={ci} card={card} size="xs" />
                          ))}
                        </View>
                      </View>
                      {activePlayers.map(uid => {
                        const pr = result.player_results[uid]?.[bk];
                        const isWinner = winners.includes(uid);
                        const boardHoleCards: string[] = pr?.hole_cards ?? [];
                        return (
                          <View key={uid}
                            style={[styles.playerHandRow, isWinner && { backgroundColor: color + '12' }]}>
                            <Text style={styles.pAvatar}>{getAvatar(uid)}</Text>
                            <View style={styles.pInfo}>
                              <Text style={[styles.pName, isWinner && { color }]}>
                                {isWinner ? '🏆 ' : ''}{getName(uid)}
                              </Text>
                              <Text style={styles.pDesc}>
                                {pr?.description ?? '—'}
                              </Text>
                            </View>
                            <View style={styles.boardHoleCards}>
                              {boardHoleCards.map((c, ci) => (
                                <PlayingCard key={ci} card={c} size="xs" />
                              ))}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  );
                })}

                {/* Overall Summary */}
                <View style={styles.summaryBox}>
                  <Text style={styles.summaryTitle}>FINAL SCORES</Text>
                  {Object.entries(result.points)
                    .sort(([, a], [, b]) => b - a)
                    .map(([uid, pts]) => {
                      const won = result.chips_won[uid] ?? 0;
                      const isMe = uid === myUserId;
                      return (
                        <View key={uid}
                          style={[styles.scoreRow, isMe && styles.myScoreRow]}>
                          <View style={[styles.scoreAvatar,
                            { backgroundColor: getColor(uid) + '30', borderColor: getColor(uid) }]}>
                            <Text style={styles.scoreAvatarTxt}>{getAvatar(uid)}</Text>
                          </View>
                          <View style={styles.scoreInfo}>
                            <Text style={styles.scoreName}>{getName(uid)}</Text>
                            <Text style={styles.scorePts}>
                              {pts} pt{pts !== 1 ? 's' : ''}
                            </Text>
                          </View>
                          <Text style={[styles.scoreChips, won > 0 ? styles.positive : styles.neutral]}>
                            {won > 0 ? '+' : ''}{won.toLocaleString()} 🪙
                          </Text>
                        </View>
                      );
                    })}
                </View>
              </>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Next hand in {countdown}s</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0a0f1a',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, borderColor: '#1e293b',
    maxHeight: height * 0.85, paddingBottom: 24,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: '#1e293b',
  },
  title: { fontSize: 17, fontWeight: '900', color: '#ffb800', letterSpacing: 2 },
  closeBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  closeTxt: { color: '#64748b', fontSize: 18, fontWeight: '700' },
  scrollContent: { paddingBottom: 8 },

  uncontestedBox: {
    margin: 20, padding: 32, alignItems: 'center',
    backgroundColor: '#131a2a', borderRadius: 20,
    borderWidth: 1, borderColor: '#1e293b',
  },
  uncontestedText: { fontSize: 18, fontWeight: '900', color: '#ffffff', marginBottom: 10 },
  potAmt: { fontSize: 32, fontWeight: '900', color: '#ffb800' },

  boardResult: {
    marginHorizontal: 16, marginTop: 12,
    backgroundColor: '#0d1520', borderRadius: 16,
    borderWidth: 1, padding: 12,
  },
  boardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 8,
  },
  boardTitle: { fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  communityCards: { flexDirection: 'row', gap: 2 },

  playerHandRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 6, paddingHorizontal: 6, borderRadius: 10, marginBottom: 2,
  },
  pAvatar: { fontSize: 18 },
  pInfo: { flex: 1 },
  pName: { fontSize: 12, fontWeight: '700', color: '#ffffff' },
  pDesc: { fontSize: 10, color: '#64748b', marginTop: 2 },
  boardHoleCards: { flexDirection: 'row', gap: 3 },

  summaryBox: {
    marginHorizontal: 16, marginTop: 12,
    backgroundColor: '#131a2a', borderRadius: 16,
    borderWidth: 1, borderColor: '#1e293b', padding: 14,
  },
  summaryTitle: {
    fontSize: 9, fontWeight: '900', color: '#475569',
    letterSpacing: 2, marginBottom: 10,
  },
  scoreRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#ffffff08',
  },
  myScoreRow: {
    backgroundColor: '#00f0ff0a', borderRadius: 12,
    paddingHorizontal: 8, borderBottomWidth: 0, marginBottom: 2,
  },
  scoreAvatar: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  scoreAvatarTxt: { fontSize: 18 },
  scoreInfo: { flex: 1 },
  scoreName: { fontSize: 13, fontWeight: '700', color: '#ffffff' },
  scorePts: { fontSize: 11, color: '#ffb800', marginTop: 2 },
  scoreChips: { fontSize: 14, fontWeight: '900' },
  positive: { color: '#22c55e' },
  neutral: { color: '#64748b' },

  footer: { paddingTop: 12, alignItems: 'center' },
  footerText: { fontSize: 12, color: '#475569' },
});
