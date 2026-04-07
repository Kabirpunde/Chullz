import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PlayingCard from '../components/PlayingCard';
import RaiseControl from '../components/RaiseControl';
import AssignmentPanel, { Assignment } from '../components/AssignmentPanel';
import ShowdownOverlay from '../components/ShowdownOverlay';

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
  assigned_uids: string[]; last_showdown: unknown;
}
interface ValidActions {
  fold?: boolean; check?: boolean; call?: number;
  raise?: { min: number; max: number; buttons: Record<string, number> };
  all_in?: number;
}

const ROUND_LABELS: Record<string, string> = {
  waiting:'WAITING', preflop:'PRE-FLOP', flop:'FLOP',
  turn:'TURN', river:'RIVER', assignment:'ASSIGN CARDS', showdown:'SHOWDOWN',
};
const ROUND_COLORS: Record<string, string> = {
  waiting:'#475569', preflop:'#3b82f6', flop:'#22c55e',
  turn:'#f59e0b', river:'#ef4444', assignment:'#a855f7', showdown:'#ffb800',
};
const BOARD_COLORS = ['#3b82f6', '#22c55e', '#f59e0b'];
const STATUS_COLOR: Record<string, string> = {
  active:'#22c55e', folded:'#ef4444', all_in:'#a855f7', waiting:'#475569',
};
const EMPTY_BOARDS: BoardState[] = [
  { board_id: 1, flop: [], turn: '', river: '' },
  { board_id: 2, flop: [], turn: '', river: '' },
  { board_id: 3, flop: [], turn: '', river: '' },
];

// Seat angles: -90=top, -150=upper-left, -30=upper-right, +150=lower-left, +30=lower-right
const SEAT_ANGLES = [-90, -150, -30, 150, 30] as const;

function seatPos(angleDeg: number, tableW: number, tableH: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: tableW / 2 + (tableW / 2) * Math.cos(rad),
    y: tableH / 2 + (tableH / 2) * Math.sin(rad),
  };
}

function RoleBadge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontSize: 8, fontWeight: 900, letterSpacing: 0.5,
      background: color + '25', border: `1px solid ${color}`,
      color, borderRadius: 6, padding: '1px 5px',
    }}>{label}</span>
  );
}

function PlayerSeat({
  player, isMe, isCurrentTurn, isDealer, isSB, isBB, seatSize,
}: {
  player: PublicPlayer | null; isMe?: boolean; isCurrentTurn?: boolean;
  isDealer?: boolean; isSB?: boolean; isBB?: boolean; seatSize: number;
}) {
  const color = player?.avatar_color || '#00f0ff';
  const avatarSize = Math.round(seatSize * 0.5);
  const fontSize = Math.max(8, Math.round(seatSize * 0.12));

  if (!player) {
    return (
      <div style={{
        width: seatSize, display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 3, opacity: 0.4,
      }}>
        <div style={{
          width: avatarSize, height: avatarSize, borderRadius: '50%',
          border: '1px dashed #1e293b', background: '#131a2a',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: avatarSize * 0.4, color: '#334155' }}>+</span>
        </div>
        <span style={{ fontSize: fontSize - 1, color: '#334155' }}>Empty</span>
      </div>
    );
  }

  const statusColor = STATUS_COLOR[player.status] ?? '#475569';
  const folded = player.status === 'folded';

  return (
    <div style={{
      width: seatSize, display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 2, opacity: folded ? 0.45 : 1,
      background: '#0d1520', borderRadius: 10,
      border: `1.5px solid ${isCurrentTurn ? '#ffb800' : color + '40'}`,
      padding: '5px 3px',
      boxShadow: isCurrentTurn ? '0 0 12px #ffb80040' : 'none',
      transition: 'border-color 0.3s ease',
      position: 'relative', overflow: 'hidden',
    }}>
      {isCurrentTurn && (
        <div style={{
          position: 'absolute', inset: 0, background: '#ffb80010', borderRadius: 10,
        }} />
      )}
      {/* Avatar */}
      <div style={{
        width: avatarSize, height: avatarSize, borderRadius: '50%',
        border: `${isMe ? 2.5 : 1.5}px solid ${color}`,
        background: color + '28',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
      }}>
        <span style={{ fontSize: avatarSize * 0.55 }}>{player.avatar}</span>
        <div style={{
          position: 'absolute', bottom: 0, right: 0,
          width: 8, height: 8, borderRadius: '50%',
          background: statusColor, border: '1.5px solid #0d1520',
        }} />
      </div>
      {/* Name */}
      <span style={{
        fontSize: fontSize, fontWeight: 800, color: '#e2e8f0',
        maxWidth: seatSize - 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{player.username}</span>
      {/* Chips */}
      <span style={{ fontSize: fontSize - 1, color: '#ffb800', fontWeight: 600 }}>
        🪙 {player.chips >= 1000 ? (player.chips / 1000).toFixed(1) + 'k' : player.chips}
      </span>
      {/* Bet */}
      {player.bet_street > 0 && (
        <span style={{
          fontSize: fontSize - 1, color: '#3b82f6', fontWeight: 800,
          background: '#3b82f625', borderRadius: 8, padding: '1px 5px',
          border: '1px solid #3b82f650',
        }}>{player.bet_street.toLocaleString()}</span>
      )}
      {/* Role badges */}
      <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
        {isDealer && <RoleBadge label="D" color="#ffb800" />}
        {isSB && <RoleBadge label="SB" color="#3b82f6" />}
        {isBB && <RoleBadge label="BB" color="#22c55e" />}
        {player.status !== 'active' && (
          <RoleBadge label={player.status.toUpperCase()} color={STATUS_COLOR[player.status] ?? '#475569'} />
        )}
      </div>
    </div>
  );
}

function FeltBoard({ board, idx, round, cardSize }: { board: BoardState; idx: number; round: string; cardSize: number }) {
  const color = BOARD_COLORS[idx];
  const community: (string | null)[] = [
    ...(board.flop ?? []), board.turn || null, board.river || null,
  ];
  const showCount = round === 'preflop' ? 0 : round === 'flop' ? 3 : round === 'turn' ? 4 : 5;
  const cardW = cardSize;
  const cardH = Math.round(cardW * 1.4);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%' }}>
      <div style={{
        width: 16, height: 16, borderRadius: '50%',
        background: color + '30', border: `1px solid ${color}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 9, fontWeight: 900, color }}>{idx + 1}</span>
      </div>
      <div style={{ display: 'flex', gap: 3, flex: 1, justifyContent: 'center' }}>
        {[0,1,2,3,4].map(i => (
          <div key={i} style={{
            width: cardW, height: cardH, borderRadius: 3,
            background: i < showCount ? '#ffffff' : 'linear-gradient(135deg, #1e3a8a, #1e40af)',
            border: '1px solid #e5e7eb',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', flexShrink: 0,
          }}>
            {community[i] && i < showCount ? (
              <>
                <span style={{
                  fontSize: Math.max(9, cardW * 0.35), fontWeight: 900, lineHeight: 1,
                  color: ['h','d'].includes(community[i]![1]) ?
                    (community[i]![1] === 'h' ? '#dc2626' : '#1d4ed8') :
                    (community[i]![1] === 'c' ? '#16a34a' : '#111827'),
                }}>
                  {['2','3','4','5','6','7','8','9','T','J','Q','K','A'].includes(community[i]![0])
                    ? (community[i]![0] === 'T' ? '10' : community[i]![0])
                    : community[i]![0]}
                </span>
                <span style={{
                  fontSize: Math.max(9, cardW * 0.35), lineHeight: 1, marginTop: -1,
                  color: ['h','d'].includes(community[i]![1]) ?
                    (community[i]![1] === 'h' ? '#dc2626' : '#1d4ed8') :
                    (community[i]![1] === 'c' ? '#16a34a' : '#111827'),
                }}>
                  {community[i]![1] === 'h' ? '♥' : community[i]![1] === 'd' ? '♦' : community[i]![1] === 'c' ? '♣' : '♠'}
                </span>
              </>
            ) : i < showCount ? null : (
              <span style={{ fontSize: cardW * 0.35, color: '#93c5fd' }}>🂠</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PokerTable() {
  const { tableId } = useParams<{ tableId: string }>();
  const [searchParams] = useSearchParams();
  const isHost = searchParams.get('host') === 'true';
  const { user, token } = useAuth();
  const navigate = useNavigate();

  // Responsive sizing
  const [vw, setVw] = useState(window.innerWidth);
  const [vh, setVh] = useState(window.innerHeight);
  useEffect(() => {
    const onResize = () => { setVw(window.innerWidth); setVh(window.innerHeight); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const maxW = Math.min(vw, 480);
  // Reserve space: topBar~52, timer~5, actionBar~80, safeArea~44
  const RESERVED = 181;
  const gameH = Math.max(200, vh - RESERVED);
  // Table oval: 72% of max width, up to 60% of game height
  const TABLE_W = Math.round(Math.min(maxW * 0.72, 320));
  const TABLE_H = Math.round(Math.min(gameH * 0.66, TABLE_W * 1.85));
  const SEAT_SIZE = Math.round(TABLE_W / 4.8);  // responsive seat size
  const ZONE_W = TABLE_W + SEAT_SIZE + 10;
  const ZONE_H = TABLE_H + SEAT_SIZE + 10;
  // Card size inside table: fit 5 cards + label + gaps in table width
  const INNER_W = TABLE_W - 36;  // account for oval curvature padding
  const CARD_W = Math.max(18, Math.floor((INNER_W - 20 - 4 * 3) / 5));

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef(0);
  const [wsConnected, setWsConnected] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [holeCards, setHoleCards] = useState<string[]>([]);
  const [validActions, setValidActions] = useState<ValidActions | null>(null);
  const [showdownData, setShowdownData] = useState<unknown>(null);
  const [showShowdown, setShowShowdown] = useState(false);
  const [assignment, setAssignment] = useState<Assignment>({ board_1: [], board_2: [], board_3: [] });
  const [submitting, setSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Timer
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!gameState?.timer_ends) { setTimeLeft(0); return; }
    const tick = () => setTimeLeft(Math.max(0, Math.ceil(gameState.timer_ends - Date.now() / 1000)));
    tick();
    timerRef.current = setInterval(tick, 500);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [gameState?.timer_ends]);

  // WebSocket
  const connectWS = useCallback(() => {
    if (!tableId || !user?.id) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/game/ws/${tableId}/${user.id}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => { setWsConnected(true); reconnectRef.current = 0; };
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
      if (reconnectRef.current < 6) {
        reconnectRef.current++;
        setTimeout(connectWS, 2000 * reconnectRef.current);
      }
    };
    ws.onerror = e => console.error('WS error:', e);
  }, [tableId, user?.id]);

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
  const handleSubmitAssignment = (a: Assignment) => {
    setSubmitting(true);
    sendWS({ type: 'assign_cards', data: a });
  };

  const handleBack = async () => {
    try {
      if (token && tableId) {
        await fetch(`/api/tables/${tableId}/leave`, {
          method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {}
    wsRef.current?.close();
    navigate('/lobby');
  };

  const round = gameState?.round ?? 'waiting';
  const roundColor = ROUND_COLORS[round] ?? '#475569';
  const roundLabel = ROUND_LABELS[round] ?? round.toUpperCase();
  const myPlayer = gameState?.players.find(p => p.user_id === user?.id);
  const opponents = gameState?.players.filter(p => p.user_id !== user?.id) ?? [];
  const isMyTurn = myPlayer?.seat === gameState?.current_seat && myPlayer?.status === 'active';
  const streetBets = gameState?.players.reduce((s, p) => s + p.bet_street, 0) ?? 0;
  const totalPot = (gameState?.pot ?? 0) + streetBets;
  const boards = gameState?.boards ?? [];
  const displayBoards = boards.length > 0 ? boards : EMPTY_BOARDS;

  return (
    <div className="screen no-select" style={{ background: '#060b14' }}>
      {/* Top Bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 12px', background: '#0a0f1a',
        borderBottom: '1px solid #1e293b', flexShrink: 0,
      }}>
        <button
          onClick={handleBack}
          style={{
            width: 44, height: 44, borderRadius: '50%', background: '#131a2a',
            border: 'none', color: '#ffffff', fontSize: 18, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >←</button>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#ffffff', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {gameState?.name ?? `Table`}
          </span>
          <span style={{
            fontSize: 9, fontWeight: 900, letterSpacing: 1, padding: '2px 10px', borderRadius: 10,
            background: roundColor + '22', border: `1px solid ${roundColor}`, color: roundColor,
          }}>{roundLabel}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          {!!gameState?.hand_number && (
            <span style={{ fontSize: 10, color: '#475569', fontWeight: 700 }}>#{gameState.hand_number}</span>
          )}
          {!!gameState?.blind_small && (
            <span style={{ fontSize: 9, color: '#334155' }}>{gameState.blind_small}/{gameState.blind_big}</span>
          )}
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: wsConnected ? '#22c55e' : '#ef4444',
          }} />
        </div>
      </div>

      {/* Timer Bar */}
      {timeLeft > 0 && round !== 'waiting' && (
        <div style={{ height: 5, background: '#1e293b', position: 'relative', flexShrink: 0 }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: `${Math.min(100, (timeLeft / (round === 'assignment' ? 60 : 30)) * 100)}%`,
            background: timeLeft <= 10 ? '#ef4444' : roundColor,
            borderRadius: 3, transition: 'width 0.5s linear',
          }} />
          <span style={{
            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
            fontSize: 8, color: '#ffffff60', fontWeight: 700,
          }}>{timeLeft}s</span>
        </div>
      )}

      {/* ─── Assignment Phase ─── */}
      {round === 'assignment' ? (
        <AssignmentPanel
          holeCards={holeCards}
          boards={boards}
          assignment={assignment}
          onAssignmentChange={setAssignment}
          onSubmit={handleSubmitAssignment}
          timeLeft={timeLeft}
          assignedUids={gameState?.assigned_uids ?? []}
          myUserId={user?.id ?? ''}
          players={gameState?.players ?? []}
          submitting={submitting}
        />
      ) : (
        /* ─── Game View ─── */
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 6, overflow: 'hidden' }}>

          {/* TABLE ZONE: oval + seated players */}
          <div style={{ position: 'relative', width: ZONE_W, height: ZONE_H, flexShrink: 0 }}>

            {/* The Oval */}
            <div style={{
              position: 'absolute',
              left: (ZONE_W - TABLE_W) / 2,
              top: (ZONE_H - TABLE_H) / 2,
              width: TABLE_W, height: TABLE_H,
              borderRadius: TABLE_W / 2,
              background: '#6b3308',
              padding: 6,
              boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
            }}>
              {/* Rail */}
              <div style={{
                width: '100%', height: '100%',
                borderRadius: TABLE_W / 2 - 4,
                background: '#9c5827', padding: 7,
              }}>
                {/* Felt */}
                <div style={{
                  width: '100%', height: '100%',
                  borderRadius: TABLE_W / 2 - 12,
                  background: 'linear-gradient(180deg, #0d5a2e 0%, #0e4a26 100%)',
                  border: '1px solid #1a6535',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', gap: 4, padding: '10px 6px',
                }}>
                  {/* Pot */}
                  {totalPot > 0 && (
                    <div style={{
                      background: '#00000035', borderRadius: 12,
                      padding: '3px 12px', border: '1px solid #ffffff15',
                      display: 'flex', alignItems: 'center', gap: 5,
                    }}>
                      <span style={{ fontSize: 9, color: '#ffb800', fontWeight: 900, letterSpacing: 1 }}>POT</span>
                      <span style={{ fontSize: Math.max(12, TABLE_W * 0.05), fontWeight: 900, color: '#ffb800' }}>
                        {totalPot.toLocaleString()} 🪙
                      </span>
                    </div>
                  )}
                  {(gameState?.current_bet ?? 0) > 0 && (
                    <div style={{
                      background: '#3b82f620', borderRadius: 10,
                      padding: '2px 10px', border: '1px solid #3b82f640',
                    }}>
                      <span style={{ fontSize: 10, color: '#3b82f6', fontWeight: 800 }}>
                        BET {gameState!.current_bet.toLocaleString()}
                      </span>
                    </div>
                  )}

                  {/* 3 boards stacked vertically */}
                  {round !== 'waiting' && (
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {displayBoards.map((board, idx) => (
                        <div key={board.board_id}>
                          {idx > 0 && <div style={{ height: 1, background: '#1a6535', marginBottom: 5 }} />}
                          <FeltBoard board={board} idx={idx} round={round} cardSize={CARD_W} />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Waiting content */}
                  {round === 'waiting' && (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: Math.max(16, TABLE_W * 0.07), fontWeight: 900, color: '#00f0ff', letterSpacing: 4 }}>♠ CHULLZ</div>
                      <div style={{ fontSize: 9, color: '#6b9e7a', letterSpacing: 1.5, marginTop: 4 }}>3 BOARD POT LIMIT</div>
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>
                        {gameState ? `${gameState.players.length} / ${gameState.max_players} players` : '…'}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Opponent Seats - positioned around oval */}
            {SEAT_ANGLES.map((angle, idx) => {
              const pos = seatPos(angle, ZONE_W, ZONE_H);
              const player = opponents[idx] ?? null;
              return (
                <div
                  key={idx}
                  style={{
                    position: 'absolute',
                    left: pos.x - SEAT_SIZE / 2,
                    top: pos.y - SEAT_SIZE / 2 - 4,
                    zIndex: 10,
                  }}
                >
                  <PlayerSeat
                    player={player}
                    isCurrentTurn={!!player && player.seat === gameState?.current_seat}
                    isDealer={!!player && round !== 'waiting' && player.seat === gameState?.dealer_seat}
                    isSB={!!player && round !== 'waiting' && player.seat === gameState?.sb_seat}
                    isBB={!!player && round !== 'waiting' && player.seat === gameState?.bb_seat}
                    seatSize={SEAT_SIZE}
                  />
                </div>
              );
            })}

            {/* My Seat - bottom center */}
            {(() => {
              const myPos = seatPos(90, ZONE_W, ZONE_H);
              return (
                <div style={{
                  position: 'absolute',
                  left: myPos.x - SEAT_SIZE / 2,
                  top: myPos.y - SEAT_SIZE / 2 - 4,
                  zIndex: 10,
                }}>
                  <PlayerSeat
                    player={myPlayer ?? null}
                    isMe
                    isCurrentTurn={isMyTurn}
                    isDealer={!!myPlayer && round !== 'waiting' && myPlayer.seat === gameState?.dealer_seat}
                    isSB={!!myPlayer && round !== 'waiting' && myPlayer.seat === gameState?.sb_seat}
                    isBB={!!myPlayer && round !== 'waiting' && myPlayer.seat === gameState?.bb_seat}
                    seatSize={SEAT_SIZE}
                  />
                </div>
              );
            })()}
          </div>

          {/* My Hole Cards */}
          {holeCards.length > 0 && round !== 'waiting' && (
            <div style={{
              display: 'flex', justifyContent: 'center', gap: 6,
              marginTop: 6, flexShrink: 0,
            }}>
              {holeCards.map((c, i) => (
                <PlayingCard key={i} card={c} size="md" />
              ))}
            </div>
          )}

          {/* Waiting: player list */}
          {round === 'waiting' && (
            <div style={{ 
              width: Math.min(TABLE_W, maxW - 32), marginTop: 8,
              flex: 1, overflowY: 'auto',
            }}>
              {(gameState?.players ?? []).map(p => (
                <div key={p.user_id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: '#131a2a', borderRadius: 10, border: '1px solid #1e293b',
                  padding: '8px 12px', marginBottom: 6,
                }}>
                  <span style={{ fontSize: 20 }}>{p.avatar}</span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#ffffff' }}>{p.username}</span>
                  <span style={{ fontSize: 11, color: '#ffb800', fontWeight: 600 }}>🪙 {p.chips.toLocaleString()}</span>
                  {p.user_id === user?.id && (
                    <span style={{
                      fontSize: 9, color: '#00f0ff', fontWeight: 800,
                      background: '#00f0ff20', borderRadius: 8, padding: '2px 8px',
                    }}>You</span>
                  )}
                </div>
              ))}
              {!gameState && (
                <div style={{ textAlign: 'center', padding: 16, color: '#475569', fontSize: 13 }}>
                  Connecting...
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── Action Bar ─── */}
      <div style={{
        padding: '10px 16px',
        paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
        background: '#0a0f1a', borderTop: '1px solid #1e293b', flexShrink: 0,
      }}>
        {round === 'waiting' && isHost && (
          <button
            onClick={handleStartGame}
            disabled={(gameState?.players.length ?? 0) < 2}
            style={{
              width: '100%', padding: '15px',
              background: (gameState?.players.length ?? 0) >= 2 ? '#00f0ff' : '#131a2a',
              border: (gameState?.players.length ?? 0) >= 2 ? 'none' : '1px solid #334155',
              borderRadius: 14, fontSize: 15, fontWeight: 900,
              color: (gameState?.players.length ?? 0) >= 2 ? '#0a0f1a' : '#475569',
              cursor: (gameState?.players.length ?? 0) >= 2 ? 'pointer' : 'default',
            }}
          >
            {(gameState?.players.length ?? 0) < 2 ? 'Need 2+ players' : '▶ Start Game'}
          </button>
        )}
        {round === 'waiting' && !isHost && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 15 }}>
            <span style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>Waiting for host to start...</span>
          </div>
        )}
        {isMyTurn && validActions && round !== 'waiting' && round !== 'showdown' && (
          <RaiseControl validActions={validActions} onAction={handleAction} pot={totalPot} />
        )}
        {!isMyTurn && round !== 'waiting' && round !== 'showdown' && round !== 'assignment' && myPlayer?.status === 'active' && (
          <div style={{
            background: '#131a2a', borderRadius: 14, border: '1px solid #1e293b',
            padding: '11px', textAlign: 'center',
          }}>
            <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>
              {gameState?.players.find(p => p.seat === gameState?.current_seat)?.username ?? '...'}'s turn
            </span>
          </div>
        )}
        {(myPlayer?.status === 'folded' || myPlayer?.status === 'all_in') && round !== 'waiting' && (
          <div style={{ textAlign: 'center', padding: 11 }}>
            <span style={{
              fontSize: 14, fontWeight: 900, letterSpacing: 2,
              color: myPlayer.status === 'folded' ? '#ef4444' : '#a855f7',
            }}>
              {myPlayer.status === 'folded' ? 'FOLDED' : 'ALL IN'}
            </span>
          </div>
        )}
      </div>

      {/* Showdown Overlay */}
      <ShowdownOverlay
        visible={showShowdown}
        result={showdownData as never}
        boards={boards}
        players={gameState?.players ?? []}
        myUserId={user?.id ?? ''}
        onClose={() => setShowShowdown(false)}
      />
    </div>
  );
}
