import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Dimensions, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import PlayingCard from '../components/PlayingCard';
import RaiseControl from '../components/RaiseControl';
import AssignmentPanel, { Assignment } from '../components/AssignmentPanel';
import ShowdownOverlay from '../components/ShowdownOverlay';

// Static fallback for module-level constants (overridden per component render)
const _dims = Dimensions.get('window'); // fallback only

// Seat angles around the oval (degrees)
// -90=top, -150=upper-left, -30=upper-right, 150=lower-left, 30=lower-right
const SEAT_ANGLES = [-90, -150, -30, 150, 30] as const;
const EMPTY_BOARDS: BoardState[] = [
  { board_id: 1, flop: [], turn: '', river: '' },
  { board_id: 2, flop: [], turn: '', river: '' },
  { board_id: 3, flop: [], turn: '', river: '' },
];
const SEAT_W = 72;
const SEAT_H = 94;

// Compute seat position on the oval perimeter.
// contW: the full container width (wider than oval to accommodate side seats)
function seatPos(angleDeg: number, tW: number, tH: number, contW: number) {
  const rad = (angleDeg * Math.PI) / 180;
  // Center of the oval within the container
  const cx = contW / 2;
  const cy = SEAT_H / 2 + 2 + tH / 2;   // top=SEAT_H/2+2 is where oval top starts
  const rx = tW / 2;
  const ry = tH / 2;
  const x = cx + rx * Math.cos(rad);
  const y = cy + ry * Math.sin(rad);
  return { left: Math.round(x - SEAT_W / 2), top: Math.round(y - SEAT_H / 2) };
}

// ─── Types ───────────────────────────────────────────────────────────────────
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

// ─── Constants ────────────────────────────────────────────────────────────────
const ROUND_LABELS: Record<string, string> = {
  waiting: 'WAITING', preflop: 'PRE-FLOP', flop: 'FLOP',
  turn: 'TURN', river: 'RIVER', assignment: 'ASSIGN CARDS', showdown: 'SHOWDOWN',
};
const ROUND_COLORS: Record<string, string> = {
  waiting: '#475569', preflop: '#3b82f6', flop: '#22c55e',
  turn: '#f59e0b', river: '#ef4444', assignment: '#a855f7', showdown: '#ffb800',
};
const BOARD_COLORS = ['#3b82f6', '#22c55e', '#f59e0b'];
const BOARD_NAMES = ['Board 1', 'Board 2', 'Board 3'];
const STATUS_COLOR: Record<string, string> = {
  active: '#22c55e', folded: '#ef4444', all_in: '#a855f7', waiting: '#475569',
};

// ─── Subcomponents ────────────────────────────────────────────────────────────
function SeatBadge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[seatBadgeStyle.wrap, { backgroundColor: color + '25', borderColor: color }]}>
      <Text style={[seatBadgeStyle.txt, { color }]}>{label}</Text>
    </View>
  );
}
const seatBadgeStyle = StyleSheet.create({
  wrap: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 5, paddingVertical: 1 },
  txt: { fontSize: 8, fontWeight: '900', letterSpacing: 0.5 },
});

function OpponentSeat({
  player, isCurrentTurn, isDealer, isSB, isBB,
}: {
  player: PublicPlayer; isCurrentTurn: boolean;
  isDealer: boolean; isSB: boolean; isBB: boolean;
}) {
  const color = player.avatar_color || '#00f0ff';
  const statusColor = STATUS_COLOR[player.status] ?? '#475569';
  return (
    <View style={[
      oppStyles.seat,
      { borderColor: isCurrentTurn ? '#ffb800' : color + '40' },
      player.status === 'folded' && oppStyles.folded,
    ]}>
      {isCurrentTurn && <View style={oppStyles.turnGlow} />}
      {/* Avatar */}
      <View style={[oppStyles.avatar, { backgroundColor: color + '28', borderColor: color }]}>
        <Text style={oppStyles.avatarEmoji}>{player.avatar}</Text>
        <View style={[oppStyles.statusDot, { backgroundColor: statusColor }]} />
      </View>
      {/* Name + chips */}
      <Text style={oppStyles.name} numberOfLines={1}>{player.username}</Text>
      <Text style={oppStyles.chips}>🪙 {player.chips.toLocaleString()}</Text>
      {/* Bet badge */}
      {player.bet_street > 0 && (
        <View style={oppStyles.betBadge}>
          <Text style={oppStyles.betTxt}>{player.bet_street.toLocaleString()}</Text>
        </View>
      )}
      {/* Role badges */}
      <View style={oppStyles.badges}>
        {isDealer && <SeatBadge label="D" color="#ffb800" />}
        {isSB && <SeatBadge label="SB" color="#3b82f6" />}
        {isBB && <SeatBadge label="BB" color="#22c55e" />}
      </View>
    </View>
  );
}
const oppStyles = StyleSheet.create({
  seat: {
    alignItems: 'center', width: 68, paddingVertical: 8, paddingHorizontal: 4,
    backgroundColor: '#0d1520', borderRadius: 12, borderWidth: 1.5,
    position: 'relative', overflow: 'hidden', marginHorizontal: 3,
  },
  folded: { opacity: 0.45 },
  turnGlow: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#ffb80015', borderRadius: 12,
  },
  avatar: {
    width: 38, height: 38, borderRadius: 19, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  avatarEmoji: { fontSize: 20 },
  statusDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 10, height: 10, borderRadius: 5,
    borderWidth: 1.5, borderColor: '#0d1520',
  },
  name: { fontSize: 9, fontWeight: '700', color: '#e2e8f0', textAlign: 'center', width: 58 },
  chips: { fontSize: 8, color: '#ffb800', fontWeight: '600', marginTop: 1 },
  betBadge: {
    marginTop: 3, backgroundColor: '#3b82f625', borderRadius: 8,
    borderWidth: 1, borderColor: '#3b82f650',
    paddingHorizontal: 5, paddingVertical: 1,
  },
  betTxt: { fontSize: 8, color: '#3b82f6', fontWeight: '800' },
  badges: { flexDirection: 'row', gap: 2, marginTop: 3, flexWrap: 'wrap', justifyContent: 'center' },
});

function EmptySeat({ label }: { label?: string }) {
  return (
    <View style={emptyStyle.seat}>
      <View style={emptyStyle.avatar}><Text style={emptyStyle.icon}>+</Text></View>
      <Text style={emptyStyle.label}>{label ?? 'Empty'}</Text>
    </View>
  );
}
const emptyStyle = StyleSheet.create({
  seat: {
    alignItems: 'center', width: 68, paddingVertical: 8, paddingHorizontal: 4,
    backgroundColor: '#0a0f1a', borderRadius: 12, borderWidth: 1,
    borderColor: '#1e293b', borderStyle: 'dashed', marginHorizontal: 3, opacity: 0.5,
  },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#131a2a', alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  icon: { fontSize: 16, color: '#334155', fontWeight: '900' },
  label: { fontSize: 9, color: '#334155' },
});

// Board row rendered INSIDE the oval felt — full-width horizontal strip of 5 cards
function FeltBoardRow({ board, idx, round }: { board: BoardState; idx: number; round: string }) {
  const color = BOARD_COLORS[idx];
  const community: (string | null)[] = [
    ...(board.flop ?? []), board.turn || null, board.river || null,
  ];
  const showCount = round === 'preflop' ? 0 : round === 'flop' ? 3 : round === 'turn' ? 4 : 5;
  return (
    <View style={feltRow.row}>
      <View style={[feltRow.label, { backgroundColor: color + '30', borderColor: color }]}>
        <Text style={[feltRow.labelTxt, { color }]}>{idx + 1}</Text>
      </View>
      <View style={feltRow.cards}>
        {[0, 1, 2, 3, 4].map(i => (
          <PlayingCard key={i} card={community[i] ?? undefined} faceDown={i >= showCount} size="xs" />
        ))}
      </View>
    </View>
  );
}
const feltRow = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: {
    width: 18, height: 18, borderRadius: 9, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  labelTxt: { fontSize: 9, fontWeight: '900' },
  cards: { flexDirection: 'row', gap: 4 },
});

// ─── Main Component ──────────────────────────────────────────────────────────
export default function PokerTable() {
  const { tableId, isHost: isHostParam } = useLocalSearchParams<{ tableId: string; isHost: string }>();
  const isHost = isHostParam === 'true';
  const { user, token, backendUrl } = useAuth();
  const router = useRouter();

  // ── Responsive layout (portrait oval) ────────────────────────────────────
  const { width: winW, height: winH } = useWindowDimensions();
  // Table oval: 72% of screen width, 56% of screen height (min 400px tall)
  const TABLE_W  = Math.round(Math.min(winW, 420) * 0.72);
  const TABLE_H  = Math.round(Math.max(400, Math.min(winH, 900) * 0.58));
  // Zone = container that holds the oval + side seats on both edges
  const ZONE_W   = TABLE_W + SEAT_W + 8;    // wider than oval so side seats don't clip
  const ZONE_H   = TABLE_H + SEAT_H + 8;    // taller for top/bottom seats
  const OVAL_OFF = Math.round((ZONE_W - TABLE_W) / 2);  // oval left offset
  const MY_POS   = seatPos(90, TABLE_W, TABLE_H, ZONE_W);

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

  // WebSocket
  const connectWS = useCallback(() => {
    if (!tableId || !user?.id || !backendUrl) return;
    const wsUrl = backendUrl
      .replace(/^https:\/\//, 'wss://')
      .replace(/^http:\/\//, 'ws://')
      + `/api/game/ws/${tableId}/${user.id}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => { setWsConnected(true); reconnectCountRef.current = 0; };
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
          case 'hole_cards': setHoleCards(msg.data.hole_cards); break;
          case 'your_turn': setValidActions(msg.data.valid_actions); break;
          case 'showdown_result':
            setShowdownData(msg.data);
            setShowShowdown(true);
            setTimeout(() => setShowShowdown(false), 8500);
            break;
        }
      } catch (e) { console.error('WS parse error:', e); }
    };
    ws.onclose = () => {
      setWsConnected(false); wsRef.current = null;
      if (reconnectCountRef.current < 6) {
        reconnectCountRef.current++;
        setTimeout(connectWS, 2000 * reconnectCountRef.current);
      }
    };
    ws.onerror = e => console.error('WS error:', e);
  }, [tableId, user?.id, backendUrl]);

  useEffect(() => {
    connectWS();
    return () => { wsRef.current?.close(); wsRef.current = null; };
  }, [connectWS]);

  const sendWS = (msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN)
      wsRef.current.send(JSON.stringify(msg));
  };
  const handleAction = (action: string, amount: number) => {
    sendWS({ type: 'player_action', data: { action, amount } });
    setValidActions(null);
  };
  const handleStartGame = () => sendWS({ type: 'start_game' });
  const handleSubmitAssignment = (a: Assignment) => { setSubmitting(true); sendWS({ type: 'assign_cards', data: a }); };
  const handleBack = async () => {
    try {
      if (token && tableId)
        await fetch(`${backendUrl}/api/tables/${tableId}/leave`, {
          method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
        });
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
  const opponents = gameState?.players.filter(p => p.user_id !== user.id) ?? [];
  const isMyTurn = myPlayer?.seat === gameState?.current_seat && myPlayer?.status === 'active';
  const pot = gameState?.pot ?? 0;
  const streetBets = gameState?.players.reduce((s, p) => s + p.bet_street, 0) ?? 0;
  const totalPot = pot + streetBets;
  const maxPlayers = gameState?.max_players ?? 6;
  const boards = gameState?.boards ?? [];
  const emptySeats = Math.max(0, maxPlayers - 1 - opponents.length);
  const emptySeatsToShow = Math.min(emptySeats, 3); // show max 3 empty seats for space

  return (
    <SafeAreaView style={styles.container}>
      {/* ── Top Bar ── */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={20} color="#ffffff" />
        </TouchableOpacity>
        <View style={styles.topCenter}>
          <Text style={styles.tableName} numberOfLines={1}>
            {gameState?.name ?? `Table`}
          </Text>
          <View style={[styles.roundPill, { backgroundColor: roundColor + '22', borderColor: roundColor }]}>
            <Text style={[styles.roundLbl, { color: roundColor }]}>{roundLabel}</Text>
          </View>
        </View>
        <View style={styles.topRight}>
          {!!gameState?.hand_number && (
            <Text style={styles.handNum}>#{gameState.hand_number}</Text>
          )}
          {!!gameState?.blind_small && (
            <Text style={styles.blindsLbl}>{gameState.blind_small}/{gameState.blind_big}</Text>
          )}
          <View style={[styles.wsOrb, { backgroundColor: wsConnected ? '#22c55e' : '#ef4444' }]} />
        </View>
      </View>

      {/* ── Timer Bar ── */}
      {timeLeft > 0 && round !== 'waiting' && (
        <View style={styles.timerBar}>
          <View style={[styles.timerFill, {
            width: `${Math.min(100, (timeLeft / (round === 'assignment' ? 60 : 30)) * 100)}%`,
            backgroundColor: timeLeft <= 10 ? '#ef4444' : roundColor,
          }]} />
          <Text style={styles.timerLbl}>{timeLeft}s</Text>
        </View>
      )}

      {/* ── Assignment Phase ── */}
      {round === 'assignment' ? (
        <AssignmentPanel
          holeCards={holeCards}
          boards={boards}
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
        <View style={styles.gameWrapper}>

          {/* TABLE CONTAINER (oval + absolute seats) */}
          <View style={[styles.tableContainer, { width: ZONE_W, height: ZONE_H }]}>

            {/* ── THE OVAL ── */}
            <View style={[styles.tableOuter, {
              top: SEAT_H / 2 + 2, left: OVAL_OFF, width: TABLE_W, height: TABLE_H,
              borderRadius: TABLE_W / 2,
            }]}>
              <View style={[styles.tableRail, { borderRadius: TABLE_W / 2 - 6 }]}>
                <View style={[styles.tableFelt, { borderRadius: TABLE_W / 2 - 13 }]}>

                  {/* Pot badge */}
                  {totalPot > 0 && (
                    <View style={styles.potBadge}>
                      <Text style={styles.potLbl}>POT</Text>
                      <Text style={styles.potVal}>{totalPot.toLocaleString()} 🪙</Text>
                    </View>
                  )}
                  {(gameState?.current_bet ?? 0) > 0 && (
                    <View style={styles.betBadge}>
                      <Text style={styles.betLbl}>BET {gameState!.current_bet.toLocaleString()}</Text>
                    </View>
                  )}

                  {/* 3 community board rows — stacked vertically inside felt */}
                  {round !== 'waiting' && (
                    <View style={styles.boardsInFelt}>
                      {(boards.length > 0 ? boards : EMPTY_BOARDS).map((board, idx) => (
                        <View key={board.board_id}>
                          {idx > 0 && <View style={styles.boardDivider} />}
                          <FeltBoardRow board={board} idx={idx} round={round} />
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Waiting felt content */}
                  {round === 'waiting' && (
                    <View style={styles.waitingFelt}>
                      <Text style={styles.gameTitle}>♠ CHULLZ</Text>
                      <Text style={styles.waitingFeltSub}>3 Board Pot Limit</Text>
                      <Text style={styles.waitingFeltPlayers}>
                        {gameState ? `${gameState.players.length} / ${maxPlayers} players` : '…'}
                      </Text>
                    </View>
                  )}

                </View>
              </View>
            </View>

            {/* ── OPPONENT SEATS (absolute, around oval perimeter) ── */}
            {SEAT_ANGLES.map((angle, idx) => {
              const pos = seatPos(angle, TABLE_W, TABLE_H, ZONE_W);
              const player = opponents[idx];
              return (
                <View key={idx} style={[styles.absSeat, { left: pos.left, top: pos.top }]}>
                  {player ? (
                    <OpponentSeat
                      player={player}
                      isCurrentTurn={player.seat === gameState?.current_seat}
                      isDealer={round !== 'waiting' && player.seat === gameState?.dealer_seat}
                      isSB={round !== 'waiting' && player.seat === gameState?.sb_seat}
                      isBB={round !== 'waiting' && player.seat === gameState?.bb_seat}
                    />
                  ) : (
                    <EmptySeat />
                  )}
                </View>
              );
            })}

            {/* ── MY SEAT (bottom centre of oval) ── */}
            <View style={[styles.absSeat, { left: MY_POS.left, top: MY_POS.top }]}>
              {myPlayer ? (
                <View style={[
                  styles.mySeat,
                  { borderColor: isMyTurn ? '#ffb800' : (myPlayer.avatar_color || '#00f0ff') + '50' },
                ]}>
                  <View style={[styles.myAvatar, {
                    backgroundColor: (myPlayer.avatar_color || '#00f0ff') + '20',
                    borderColor: myPlayer.avatar_color || '#00f0ff',
                    borderWidth: isMyTurn ? 2.5 : 1.5,
                  }]}>
                    <Text style={styles.myAvatarEmoji}>{myPlayer.avatar}</Text>
                    {isMyTurn && <View style={styles.myTurnRing} />}
                  </View>
                  <Text style={styles.myName} numberOfLines={1}>{myPlayer.username}</Text>
                  <Text style={styles.myChips}>{myPlayer.chips.toLocaleString()}</Text>
                  <View style={styles.myBadges}>
                    {round !== 'waiting' && myPlayer.seat === gameState?.dealer_seat && <SeatBadge label="D" color="#ffb800" />}
                    {round !== 'waiting' && myPlayer.seat === gameState?.sb_seat && <SeatBadge label="SB" color="#3b82f6" />}
                    {round !== 'waiting' && myPlayer.seat === gameState?.bb_seat && <SeatBadge label="BB" color="#22c55e" />}
                    {myPlayer.status !== 'active' && round !== 'waiting' && (
                      <SeatBadge label={myPlayer.status.toUpperCase()} color={STATUS_COLOR[myPlayer.status] ?? '#475569'} />
                    )}
                  </View>
                  {myPlayer.bet_street > 0 && (
                    <View style={styles.myBetBadge}>
                      <Text style={styles.myBetTxt}>{myPlayer.bet_street.toLocaleString()}</Text>
                    </View>
                  )}
                </View>
              ) : (
                <View style={styles.spectatorRow}>
                  <Text style={styles.spectatorTxt}>👀</Text>
                </View>
              )}
            </View>

          </View>{/* /tableContainer */}

          {/* ── MY HOLE CARDS (below oval) ── */}
          {holeCards.length > 0 && round !== 'waiting' && (
            <View style={styles.holeCardsRow}>
              {holeCards.map((c, i) => (
                <PlayingCard key={i} card={c} size="md" />
              ))}
            </View>
          )}

          {/* ── WAITING: player list ── */}
          {round === 'waiting' && (
            <ScrollView style={[styles.waitingScroll, { width: TABLE_W }]} showsVerticalScrollIndicator={false}>
              {(gameState?.players ?? []).map(p => (
                <View key={p.user_id} style={styles.waitingPlayerRow}>
                  <Text style={styles.wpAvatar}>{p.avatar}</Text>
                  <Text style={styles.wpName}>{p.username}</Text>
                  <Text style={styles.wpChips}>🪙 {p.chips.toLocaleString()}</Text>
                  {p.user_id === user.id && (
                    <View style={styles.youBadge}><Text style={styles.youBadgeTxt}>You</Text></View>
                  )}
                </View>
              ))}
              {!gameState && (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color="#00f0ff" />
                  <Text style={styles.loadingTxt}>Connecting...</Text>
                </View>
              )}
            </ScrollView>
          )}

        </View>
      )}  

      {/* ── Action Bar ── */}
      <View style={styles.actionBar}>
        {round === 'waiting' && isHost && (
          <TouchableOpacity
            style={[(gameState?.players.length ?? 0) < 2 ? styles.startBtnOff : styles.startBtn]}
            onPress={handleStartGame}
            disabled={(gameState?.players.length ?? 0) < 2}
            activeOpacity={0.8}
          >
            <Text style={styles.startBtnTxt}>
              {(gameState?.players.length ?? 0) < 2 ? 'Need 2+ players' : '▶️  Start Game'}
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
          <RaiseControl validActions={validActions} onAction={handleAction} pot={totalPot} />
        )}
        {!isMyTurn && round !== 'waiting' && round !== 'showdown' && round !== 'assignment'
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

      {/* ── Showdown Overlay ── */}
      <ShowdownOverlay
        visible={showShowdown}
        result={showdownData}
        boards={boards}
        players={gameState?.players ?? []}
        myUserId={user.id}
        onClose={() => setShowShowdown(false)}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060b14' },
  errTxt: { color: '#ffffff', textAlign: 'center', marginTop: 60, fontSize: 16 },
  errBack: { alignSelf: 'center', marginTop: 16 },
  errBackTxt: { color: '#00f0ff', fontSize: 15, fontWeight: '700' },

  // ── Top bar ────────────────────────────────────────────────────────────────
  topBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#0a0f1a',
    borderBottomWidth: 1, borderBottomColor: '#1e293b',
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#131a2a', alignItems: 'center', justifyContent: 'center',
  },
  topCenter: { flex: 1, alignItems: 'center', gap: 3 },
  tableName: { fontSize: 14, fontWeight: '800', color: '#ffffff', maxWidth: 200 },
  roundPill: { paddingHorizontal: 10, paddingVertical: 2, borderRadius: 10, borderWidth: 1 },
  roundLbl: { fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  handNum: { fontSize: 10, color: '#475569', fontWeight: '700' },
  blindsLbl: { fontSize: 9, color: '#334155', fontWeight: '600' },
  wsOrb: { width: 8, height: 8, borderRadius: 4 },

  // ── Timer bar ──────────────────────────────────────────────────────────────
  timerBar: { height: 5, backgroundColor: '#1e293b', position: 'relative', justifyContent: 'center' },
  timerFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3 },
  timerLbl: { position: 'absolute', right: 8, fontSize: 8, color: '#ffffff60', fontWeight: '700' },

  // ── Game wrapper ───────────────────────────────────────────────────────────
  gameWrapper: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 4,
  },

  // ── Table container (oval + seats, seats can overflow) ─────────────────────
  tableContainer: {
    position: 'relative',
    // width and height supplied as inline style (responsive)
  },

  // ── The outer oval (wood border) ───────────────────────────────────────────
  tableOuter: {
    position: 'absolute',
    // top, left, width, height, borderRadius supplied inline
    backgroundColor: '#6b3308',       // dark wood
    padding: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 12,
  },
  tableRail: {
    flex: 1,
    // borderRadius supplied inline
    backgroundColor: '#9c5827',       // lighter wood rail
    padding: 7,
  },
  tableFelt: {
    flex: 1,
    // borderRadius supplied inline
    backgroundColor: '#0e4a26',       // dark green felt
    borderWidth: 1,
    borderColor: '#1a6535',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    overflow: 'hidden',
    paddingVertical: 14,
    paddingHorizontal: 8,
  },

  // ── Pot / bet inside felt ──────────────────────────────────────────────────
  potBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#00000035',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 4,
    borderWidth: 1, borderColor: '#ffffff15',
  },
  potLbl: { fontSize: 9, color: '#ffb800', fontWeight: '900', letterSpacing: 1 },
  potVal: { fontSize: 16, fontWeight: '900', color: '#ffb800' },
  betBadge: {
    backgroundColor: '#3b82f620', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 3,
    borderWidth: 1, borderColor: '#3b82f640',
  },
  betLbl: { fontSize: 11, color: '#3b82f6', fontWeight: '800' },

  // ── 3 community boards stacked inside felt ─────────────────────────────────
  boardsInFelt: {
    alignItems: 'flex-start',
    gap: 0,
    width: '100%',
  },
  boardDivider: {
    height: 1,
    backgroundColor: '#1a6535',
    marginVertical: 8,
    width: '100%',
  },

  // ── Waiting felt content ───────────────────────────────────────────────────
  waitingFelt: { alignItems: 'center', gap: 6 },
  gameTitle: { fontSize: 22, fontWeight: '900', color: '#00f0ff', letterSpacing: 4 },
  waitingFeltSub: { fontSize: 10, color: '#6b9e7a', letterSpacing: 1.5, fontWeight: '700' },
  waitingFeltPlayers: { fontSize: 13, color: '#94a3b8', fontWeight: '600' },

  // ── Absolute seat wrapper ─────────────────────────────────────────────────
  absSeat: {
    position: 'absolute',
    width: SEAT_W,
    // height is content-driven
    zIndex: 10,
  },

  // ── My seat (at bottom of oval) ────────────────────────────────────────────
  mySeat: {
    width: SEAT_W,
    backgroundColor: '#0d1520',
    borderRadius: 12, borderWidth: 2,
    paddingVertical: 6, paddingHorizontal: 4,
    alignItems: 'center', gap: 2,
  },
  myAvatar: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  myAvatarEmoji: { fontSize: 20 },
  myTurnRing: {
    position: 'absolute', top: -4, left: -4, right: -4, bottom: -4,
    borderRadius: 24, borderWidth: 2, borderColor: '#ffb800',
  },
  myName: { fontSize: 9, fontWeight: '800', color: '#ffffff', textAlign: 'center', maxWidth: 64 },
  myChips: { fontSize: 8, color: '#ffb800', fontWeight: '600' },
  myBadges: { flexDirection: 'row', gap: 2, flexWrap: 'wrap', justifyContent: 'center' },
  myBetBadge: {
    backgroundColor: '#3b82f625', borderRadius: 7,
    paddingHorizontal: 6, paddingVertical: 1,
    borderWidth: 1, borderColor: '#3b82f650',
  },
  myBetTxt: { fontSize: 8, color: '#3b82f6', fontWeight: '800' },
  spectatorRow: { paddingVertical: 8, alignItems: 'center' },
  spectatorTxt: { fontSize: 18 },

  // ── My hole cards (below oval) ─────────────────────────────────────────────
  holeCardsRow: {
    flexDirection: 'row', justifyContent: 'center',
    gap: 6, marginTop: 8,
  },

  // ── Waiting player list ────────────────────────────────────────────────────
  waitingScroll: { maxHeight: 150, marginTop: 4 },
  waitingPlayerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#131a2a', borderRadius: 10,
    borderWidth: 1, borderColor: '#1e293b',
    paddingHorizontal: 12, paddingVertical: 8, marginBottom: 6,
  },
  wpAvatar: { fontSize: 20 },
  wpName: { flex: 1, fontSize: 13, fontWeight: '700', color: '#ffffff' },
  wpChips: { fontSize: 11, color: '#ffb800', fontWeight: '600' },
  youBadge: { backgroundColor: '#00f0ff20', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  youBadgeTxt: { fontSize: 9, color: '#00f0ff', fontWeight: '800' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16, justifyContent: 'center' },
  loadingTxt: { fontSize: 13, color: '#475569' },

  // ── Action bar ────────────────────────────────────────────────────────────
  actionBar: {
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#0a0f1a',
    borderTopWidth: 1, borderTopColor: '#1e293b',
  },
  startBtn: {
    backgroundColor: '#00f0ff', borderRadius: 14,
    paddingVertical: 15, alignItems: 'center',
  },
  startBtnOff: {
    backgroundColor: '#131a2a', borderRadius: 14,
    paddingVertical: 15, alignItems: 'center',
    borderWidth: 1, borderColor: '#334155',
  },
  startBtnTxt: { fontSize: 15, fontWeight: '900', color: '#0a0f1a' },
  waitBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15 },
  waitTxt: { fontSize: 13, color: '#475569', fontWeight: '600' },
  notMyTurnBar: {
    backgroundColor: '#131a2a', borderRadius: 14,
    borderWidth: 1, borderColor: '#1e293b',
    paddingVertical: 11, alignItems: 'center',
  },
  notMyTurnTxt: { fontSize: 13, color: '#94a3b8', fontWeight: '600' },
  statusBar: { paddingVertical: 11, alignItems: 'center' },
  statusTxt: { fontSize: 14, fontWeight: '900', letterSpacing: 2 },
});

