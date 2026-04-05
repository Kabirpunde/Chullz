import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import CommunityBoard from '../components/CommunityBoard';
import PlayerSeat from '../components/PlayerSeat';
import PlayingCard from '../components/PlayingCard';
import RaiseControl from '../components/RaiseControl';
import AssignmentPanel, { Assignment } from '../components/AssignmentPanel';
import ShowdownOverlay from '../components/ShowdownOverlay';

const { width } = Dimensions.get('window');

interface PublicPlayer {
  user_id: string; username: string; avatar: string; avatar_color: string;
  seat: number; chips: number; status: string; bet_street: number;
}
interface BoardState { board_id: number; flop: string[]; turn: string; river: string; }
interface GameState {
  table_id: string; name: string; status: string; round: string;
  players: PublicPlayer[]; boards: BoardState[];
  pot: number; current_bet: number; last_raise: number;
  current_seat: number; dealer_seat: number; sb_seat: number; bb_seat: number;
  hand_number: number; blind_small: number; blind_big: number;
  max_players: number; timer_ends: number;
  assigned_uids: string[]; last_showdown: any;
}
interface ValidActions {
  fold?: boolean; check?: boolean; call?: number;
  raise?: { min: number; max: number; buttons: Record<string, number> };
  all_in?: number;
}

const ROUND_LABELS: Record<string, string> = {
  waiting: 'WAITING', preflop: 'PRE-FLOP', flop: 'FLOP',
  turn: 'TURN', river: 'RIVER', assignment: 'ASSIGN CARDS', showdown: 'SHOWDOWN',
};
const ROUND_COLORS: Record<string, string> = {
  waiting: '#475569', preflop: '#3b82f6', flop: '#22c55e',
  turn: '#f59e0b', river: '#ef4444', assignment: '#a855f7', showdown: '#ffb800',
};

export default function PokerTable() {
  const { tableId, isHost: isHostParam } = useLocalSearchParams<{ tableId: string; isHost: string }>();
  const isHost = isHostParam === 'true';
  const { user, token, backendUrl } = useAuth();
  const router = useRouter();

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCountRef = useRef(0);
  const [wsConnected, setWsConnected] = useState(false);

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [holeCards, setHoleCards] = useState<string[]>([]);
  const [validActions, setValidActions] = useState<ValidActions | null>(null);
  const [showdownData, setShowdownData] = useState<any>(null);
  const [showShowdown, setShowShowdown] = useState(false);
  const [assignment, setAssignment] = useState<Assignment>({ board_1: [], board_2: [], board_3: [] });
  const [submitting, setSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Timer countdown
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!gameState?.timer_ends) { setTimeLeft(0); return; }
    const tick = () => {
      const rem = Math.max(0, Math.ceil(gameState.timer_ends - Date.now() / 1000));
      setTimeLeft(rem);
    };
    tick();
    timerRef.current = setInterval(tick, 500);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [gameState?.timer_ends]);

  // WebSocket connection
  const connectWS = useCallback(() => {
    if (!tableId || !user?.id || !backendUrl) return;
    const wsUrl = backendUrl
      .replace(/^https:\/\//, 'wss://')
      .replace(/^http:\/\//, 'ws://')
      + `/api/game/ws/${tableId}/${user.id}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      reconnectCountRef.current = 0;
    };

    ws.onmessage = ({ data }) => {
      try {
        const msg = JSON.parse(data);
        switch (msg.type) {
          case 'game_state':
            setGameState(msg.data);
            if (msg.data.round !== 'assignment') {
              setAssignment({ board_1: [], board_2: [], board_3: [] });
              setSubmitting(false);
            }
            if (msg.data.round === 'showdown') setValidActions(null);
            break;
          case 'hole_cards':
            setHoleCards(msg.data.hole_cards);
            break;
          case 'your_turn':
            setValidActions(msg.data.valid_actions);
            break;
          case 'showdown_result':
            setShowdownData(msg.data);
            setShowShowdown(true);
            setTimeout(() => setShowShowdown(false), 8500);
            break;
        }
      } catch (e) {
        console.error('WS parse error:', e);
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
      wsRef.current = null;
      if (reconnectCountRef.current < 6) {
        reconnectCountRef.current++;
        setTimeout(connectWS, 2000 * reconnectCountRef.current);
      }
    };

    ws.onerror = e => console.error('WS error:', e);
  }, [tableId, user?.id, backendUrl]);

  useEffect(() => {
    connectWS();
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connectWS]);

  const sendWS = (msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  };

  const handleAction = (action: string, amount: number) => {
    sendWS({ type: 'player_action', data: { action, amount } });
    setValidActions(null);
  };

  const handleStartGame = () => sendWS({ type: 'start_game' });

  const handleSubmitAssignment = (finalAssignment: Assignment) => {
    setSubmitting(true);
    sendWS({ type: 'assign_cards', data: finalAssignment });
  };

  const handleBack = async () => {
    try {
      if (token && tableId) {
        await fetch(`${backendUrl}/api/tables/${tableId}/leave`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {}
    wsRef.current?.close();
    router.back();
  };

  if (!tableId || !user) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errTxt}>No table selected</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.errBack}>
          <Text style={styles.errBackTxt}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const round = gameState?.round ?? 'waiting';
  const roundColor = ROUND_COLORS[round] ?? '#475569';
  const roundLabel = ROUND_LABELS[round] ?? round.toUpperCase();
  const myPlayer = gameState?.players.find(p => p.user_id === user.id);
  const otherPlayers = gameState?.players.filter(p => p.user_id !== user.id) ?? [];
  const isMyTurn = myPlayer?.seat === gameState?.current_seat && myPlayer?.status === 'active';
  const pot = gameState?.pot ?? 0;
  const streetBets = gameState?.players.reduce((s, p) => s + p.bet_street, 0) ?? 0;
  const totalPot = pot + streetBets;

  return (
    <SafeAreaView style={styles.container}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={20} color="#ffffff" />
        </TouchableOpacity>
        <View style={styles.topCenter}>
          <Text style={styles.tableName} numberOfLines={1}>
            {gameState?.name ?? (tableId ? `Table ${tableId}` : 'Chullz')}
          </Text>
          <View style={[styles.roundPill, { backgroundColor: roundColor + '22', borderColor: roundColor }]}>
            <Text style={[styles.roundLbl, { color: roundColor }]}>{roundLabel}</Text>
          </View>
        </View>
        <View style={styles.topRight}>
          {!!gameState?.hand_number && (
            <Text style={styles.handNum}>#{gameState.hand_number}</Text>
          )}
          <View style={[styles.wsOrb, { backgroundColor: wsConnected ? '#22c55e' : '#ef4444' }]} />
        </View>
      </View>

      {/* Assignment phase replaces main content */}
      {round === 'assignment' ? (
        <AssignmentPanel
          holeCards={holeCards}
          boards={gameState?.boards ?? []}
          assignment={assignment}
          onAssignmentChange={setAssignment}
          onSubmit={handleSubmitAssignment}
          timeLeft={timeLeft}
          assignedUids={gameState?.assigned_uids ?? []}
          myUserId={user.id}
          players={gameState?.players ?? []}
          submitting={submitting}
        />
      ) : (
        <>
          {/* Countdown timer bar */}
          {timeLeft > 0 && round !== 'waiting' && (
            <View style={styles.timerBar}>
              <View
                style={[
                  styles.timerFill,
                  {
                    width: `${Math.min(100, (timeLeft / (round === 'assignment' ? 60 : 30)) * 100)}%`,
                    backgroundColor: timeLeft <= 10 ? '#ef4444' : '#00f0ff',
                  },
                ]}
              />
              <Text style={styles.timerLbl}>{timeLeft}s</Text>
            </View>
          )}

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Pot + blinds info */}
            <View style={styles.potRow}>
              <View style={styles.potChip}>
                <Text style={styles.potLbl}>POT</Text>
                <Text style={styles.potVal}>{totalPot.toLocaleString()} 🪙</Text>
              </View>
              {(gameState?.current_bet ?? 0) > 0 && (
                <View style={styles.betChip}>
                  <Text style={styles.betLbl}>BET</Text>
                  <Text style={styles.betVal}>{gameState!.current_bet.toLocaleString()}</Text>
                </View>
              )}
              <View style={styles.blindChip}>
                <Text style={styles.blindTxt}>
                  {gameState?.blind_small ?? 25}/{gameState?.blind_big ?? 50}
                </Text>
              </View>
            </View>

            {/* Other players */}
            {otherPlayers.length > 0 && (
              <View style={styles.section}>
                {otherPlayers.map(p => (
                  <PlayerSeat
                    key={p.user_id}
                    player={p}
                    isCurrentTurn={p.seat === gameState?.current_seat}
                    isDealer={round !== 'waiting' && p.seat === gameState?.dealer_seat}
                    isSB={round !== 'waiting' && p.seat === gameState?.sb_seat}
                    isBB={round !== 'waiting' && p.seat === gameState?.bb_seat}
                    compact
                  />
                ))}
              </View>
            )}

            {/* 3 Community Boards */}
            <View style={styles.section}>
              <Text style={styles.secLabel}>COMMUNITY BOARDS</Text>
              <ScrollView
                horizontal showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.boardsRow}
              >
                {(gameState?.boards ?? [
                  { board_id: 1, flop: [], turn: '', river: '' },
                  { board_id: 2, flop: [], turn: '', river: '' },
                  { board_id: 3, flop: [], turn: '', river: '' },
                ]).map(board => (
                  <View key={board.board_id} style={styles.boardItem}>
                    <CommunityBoard board={board} round={round} compact />
                  </View>
                ))}
              </ScrollView>
            </View>

            {/* My seat */}
            {myPlayer && (
              <View style={styles.section}>
                <PlayerSeat
                  player={myPlayer}
                  isCurrentTurn={!!isMyTurn}
                  isDealer={round !== 'waiting' && myPlayer.seat === gameState?.dealer_seat}
                  isSB={round !== 'waiting' && myPlayer.seat === gameState?.sb_seat}
                  isBB={round !== 'waiting' && myPlayer.seat === gameState?.bb_seat}
                  isMe
                />
              </View>
            )}

            {/* My hole cards */}
            {holeCards.length > 0 && round !== 'waiting' && (
              <View style={styles.section}>
                <Text style={styles.secLabel}>YOUR HAND ({holeCards.length} cards)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.holeCardsRow}>
                  {holeCards.map((c, i) => (
                    <PlayingCard key={i} card={c} size="md" />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Waiting: player list */}
            {round === 'waiting' && (
              <View style={styles.section}>
                <Text style={styles.secLabel}>
                  PLAYERS ({gameState?.players.length ?? 0}/{gameState?.max_players ?? 6})
                </Text>
                {gameState ? gameState.players.map(p => (
                  <View key={p.user_id} style={styles.waitingPlayerRow}>
                    <Text style={styles.wpAvatar}>{p.avatar}</Text>
                    <Text style={styles.wpName}>{p.username}</Text>
                    <Text style={styles.wpChips}>🪙 {p.chips.toLocaleString()}</Text>
                    {p.user_id === user.id && <View style={styles.youBadge}><Text style={styles.youBadgeTxt}>You</Text></View>}
                  </View>
                )) : (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator color="#00f0ff" />
                    <Text style={styles.loadingTxt}>Connecting to table...</Text>
                  </View>
                )}
              </View>
            )}
          </ScrollView>

          {/* Bottom action bar */}
          <View style={styles.actionBar}>
            {round === 'waiting' && isHost && (
              <TouchableOpacity
                style={[
                  styles.startBtn,
                  (gameState?.players.length ?? 0) < 2 && styles.startBtnOff,
                ]}
                onPress={handleStartGame}
                disabled={(gameState?.players.length ?? 0) < 2}
                activeOpacity={0.8}
              >
                <Text style={styles.startBtnTxt}>
                  {(gameState?.players.length ?? 0) < 2
                    ? 'Need 2+ players to start'
                    : '▶️  Start Game'}
                </Text>
              </TouchableOpacity>
            )}
            {round === 'waiting' && !isHost && (
              <View style={styles.waitBar}>
                <ActivityIndicator color="#475569" size="small" />
                <Text style={styles.waitTxt}>Waiting for host to start...</Text>
              </View>
            )}
            {!!isMyTurn && !!validActions && round !== 'waiting' && round !== 'showdown' && (
              <RaiseControl
                validActions={validActions}
                onAction={handleAction}
                pot={totalPot}
              />
            )}
            {!isMyTurn && round !== 'waiting' && round !== 'showdown'
              && myPlayer?.status === 'active' && (
              <View style={styles.notMyTurnBar}>
                <Text style={styles.notMyTurnTxt}>
                  {gameState?.players.find(p => p.seat === gameState?.current_seat)?.username ?? '...'}'s turn
                </Text>
              </View>
            )}
            {(myPlayer?.status === 'folded' || myPlayer?.status === 'all_in')
              && round !== 'waiting' && (
              <View style={styles.statusBar}>
                <Text style={[
                  styles.statusTxt,
                  { color: myPlayer.status === 'folded' ? '#ef4444' : '#a855f7' },
                ]}>
                  {myPlayer.status === 'folded' ? 'FOLDED' : 'ALL IN'}
                </Text>
              </View>
            )}
          </View>
        </>
      )}

      {/* Showdown overlay */}
      <ShowdownOverlay
        visible={showShowdown}
        result={showdownData}
        boards={gameState?.boards ?? []}
        players={gameState?.players ?? []}
        myUserId={user.id}
        onClose={() => setShowShowdown(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060b14' },
  errTxt: { color: '#ffffff', textAlign: 'center', marginTop: 60, fontSize: 16 },
  errBack: { alignSelf: 'center', marginTop: 16 },
  errBackTxt: { color: '#00f0ff', fontSize: 15, fontWeight: '700' },

  topBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#0a0f1a',
    borderBottomWidth: 1, borderBottomColor: '#1e293b',
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#131a2a', alignItems: 'center', justifyContent: 'center',
  },
  topCenter: { flex: 1, alignItems: 'center', gap: 4 },
  tableName: { fontSize: 14, fontWeight: '800', color: '#ffffff', maxWidth: width - 160 },
  roundPill: {
    paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 10, borderWidth: 1,
  },
  roundLbl: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  handNum: { fontSize: 11, color: '#475569', fontWeight: '700' },
  wsOrb: { width: 8, height: 8, borderRadius: 4 },

  timerBar: {
    height: 5, backgroundColor: '#1e293b', position: 'relative', justifyContent: 'center',
  },
  timerFill: {
    position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3,
  },
  timerLbl: {
    position: 'absolute', right: 8,
    fontSize: 8, color: '#ffffff80', fontWeight: '700',
  },

  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 16 },

  potRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10, flexWrap: 'wrap',
  },
  potChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#ffb80018', borderRadius: 10,
    borderWidth: 1, borderColor: '#ffb80035',
    paddingHorizontal: 10, paddingVertical: 5,
  },
  potLbl: { fontSize: 9, color: '#ffb800', fontWeight: '900', letterSpacing: 1 },
  potVal: { fontSize: 14, fontWeight: '900', color: '#ffb800' },
  betChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#3b82f618', borderRadius: 10,
    borderWidth: 1, borderColor: '#3b82f635',
    paddingHorizontal: 10, paddingVertical: 5,
  },
  betLbl: { fontSize: 9, color: '#3b82f6', fontWeight: '900', letterSpacing: 1 },
  betVal: { fontSize: 14, fontWeight: '900', color: '#3b82f6' },
  blindChip: {
    backgroundColor: '#1e293b', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  blindTxt: { fontSize: 11, color: '#475569', fontWeight: '700' },

  section: { paddingHorizontal: 16, marginTop: 12, gap: 8 },
  secLabel: {
    fontSize: 9, color: '#475569', fontWeight: '900',
    letterSpacing: 2, marginBottom: 2, textTransform: 'uppercase',
  },
  boardsRow: { gap: 8, paddingVertical: 4 },
  boardItem: {},

  holeCardsRow: { gap: 6, paddingVertical: 4 },

  waitingPlayerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#131a2a', borderRadius: 12,
    borderWidth: 1, borderColor: '#1e293b',
    paddingHorizontal: 14, paddingVertical: 10,
  },
  wpAvatar: { fontSize: 22 },
  wpName: { flex: 1, fontSize: 14, fontWeight: '700', color: '#ffffff' },
  wpChips: { fontSize: 12, color: '#ffb800', fontWeight: '600' },
  youBadge: {
    backgroundColor: '#00f0ff20', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  youBadgeTxt: { fontSize: 10, color: '#00f0ff', fontWeight: '800' },
  loadingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 16, justifyContent: 'center',
  },
  loadingTxt: { fontSize: 13, color: '#475569' },

  actionBar: {
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#0a0f1a',
    borderTopWidth: 1, borderTopColor: '#1e293b',
  },
  startBtn: {
    backgroundColor: '#00f0ff', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
  },
  startBtnOff: { backgroundColor: '#131a2a', borderWidth: 1, borderColor: '#334155' },
  startBtnTxt: { fontSize: 15, fontWeight: '900', color: '#0a0f1a' },
  waitBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16,
  },
  waitTxt: { fontSize: 13, color: '#475569', fontWeight: '600' },
  notMyTurnBar: {
    backgroundColor: '#131a2a', borderRadius: 14,
    borderWidth: 1, borderColor: '#1e293b',
    paddingVertical: 12, alignItems: 'center',
  },
  notMyTurnTxt: { fontSize: 13, color: '#94a3b8', fontWeight: '600' },
  statusBar: { paddingVertical: 12, alignItems: 'center' },
  statusTxt: { fontSize: 14, fontWeight: '900', letterSpacing: 2 },
});
