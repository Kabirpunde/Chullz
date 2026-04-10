import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PlayingCard from '../components/PlayingCard';
import AssignmentPanel from '../components/AssignmentPanel';
import ShowdownOverlay from '../components/ShowdownOverlay';
import { useSoundEffects } from '../hooks/useSoundEffects';
import type { Assignment } from '../components/AssignmentPanel';

// ── Types ──────────────────────────────────────────────────────────────────────
interface BoardState { board_id: number; flop: string[]; turn: string; river: string; }
interface PublicPlayer {
  user_id: string; username: string; avatar: string; avatar_color: string;
  chips: number; status: string; bet_street: number; seat: number;
}
interface GameState {
  round: string; players: PublicPlayer[]; boards: BoardState[];
  pot: number; current_bet: number; last_raise: number;
  current_seat: number; dealer_seat: number; sb_seat: number; bb_seat: number;
  hand_number: number; timer_ends: number; assigned_uids: string[];
  blind_small: number; blind_big: number; max_players: number;
  last_showdown: unknown; showdown_ready: string[];
}

// ── Sizing constants ──────────────────────────────────────────────────────────
const vh = Math.max(600, window.innerHeight);
const vw = Math.max(320, window.innerWidth);
const TABLE_W = Math.min(Math.round(vw * 0.82), 400);  // Increased for bigger cards
const SEAT_SIZE = Math.round(TABLE_W / 5.2);
const PAD = Math.round(SEAT_SIZE / 2) + 12;          // symmetric padding around oval
const RESERVED = 64 + 84 + 16;                       // topbar + actionbar + extra (no timer bar)
const gameH = Math.max(200, vh - RESERVED);
const TABLE_H = Math.round(Math.min(gameH * 0.65, TABLE_W * 1.6));
const ZONE_W = TABLE_W + PAD * 2;                    // ZONE has PAD on each side
const ZONE_H = TABLE_H + PAD * 2;

// ── Seat arrangement (angles around the oval) ─────────────────────────────────
// My seat is always at the bottom (90°). Up to 5 opponent slots at other angles.
const SEAT_ANGLES = [-90, -45, 0, 135, -135]; // top, upper-right, right, lower-left, left

/** Position of a seat's CENTER in ZONE coordinates (oval edge). */
function seatInZone(angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: PAD + TABLE_W / 2 + (TABLE_W / 2) * Math.cos(rad),
    y: PAD + TABLE_H / 2 + (TABLE_H / 2) * Math.sin(rad),
  };
}

/** Position of a bet chip bubble (40% toward oval center from seat). */
function chipPos(angleDeg: number) {
  const seat = seatInZone(angleDeg);
  const cx = PAD + TABLE_W / 2;
  const cy = PAD + TABLE_H / 2;
  return {
    x: seat.x + (cx - seat.x) * 0.42,
    y: seat.y + (cy - seat.y) * 0.42,
  };
}

// ── Small sub-components ──────────────────────────────────────────────────────
function PlayerSeat({ player, isMine, isActive, timerProgress }: {
  player: PublicPlayer; isMine: boolean; isActive: boolean; timerProgress?: number;
}) {
  const online = true; // seats are always shown as online during game
  const showTimer = isActive && timerProgress !== undefined && timerProgress > 0;
  const circumference = Math.PI * (SEAT_SIZE + 6); // circle circumference
  const strokeDashoffset = circumference * (1 - timerProgress);
  const timerColor = timerProgress <= 0.33 ? '#ef4444' : timerProgress <= 0.67 ? '#f59e0b' : '#00f0ff';
  
  return (
    <div style={{
      width: SEAT_SIZE + 8, display: 'flex', flexDirection: 'column',
      alignItems: 'center', gap: 3,
      position: 'relative',
    }}>
      {/* Timer circle SVG */}
      {showTimer && (
        <svg
          width={SEAT_SIZE + 12}
          height={SEAT_SIZE + 12}
          style={{
            position: 'absolute',
            top: -4,
            left: -2,
            transform: 'rotate(-90deg)',
            pointerEvents: 'none',
          }}
        >
          <circle
            cx={(SEAT_SIZE + 12) / 2}
            cy={(SEAT_SIZE + 12) / 2}
            r={(SEAT_SIZE + 6) / 2}
            fill="none"
            stroke={timerColor}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{ transition: 'stroke-dashoffset 0.5s linear, stroke 0.3s' }}
          />
        </svg>
      )}
      {/* Avatar circle */}
      <div style={{
        width: SEAT_SIZE, height: SEAT_SIZE, borderRadius: '50%',
        border: `2px solid ${isActive ? '#00f0ff' : player.avatar_color}`,
        boxShadow: isActive ? `0 0 12px #00f0ff80` : 'none',
        background: player.avatar_color + '25',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        position: 'relative',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: Math.round(SEAT_SIZE * 0.48) }}>{player.avatar}</span>
        {/* Online dot */}
        <div style={{
          position: 'absolute', bottom: 1, right: 1,
          width: 9, height: 9, borderRadius: '50%',
          background: player.status === 'folded' ? '#475569' : '#22c55e',
          border: '2px solid #060b14',
        }} />
        {/* Folded overlay */}
        {player.status === 'folded' && (
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 9, color: '#ef4444', fontWeight: 900 }}>FOLD</span>
          </div>
        )}
      </div>
      {/* Name + chips */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
        maxWidth: SEAT_SIZE + 12,
      }}>
        <span style={{
          fontSize: isMine ? 12 : 10,
          fontWeight: 900, color: isMine ? '#00f0ff' : '#ffffff',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          maxWidth: SEAT_SIZE + 12,
        }}>{player.username}</span>
        <span style={{ fontSize: isMine ? 11 : 9, color: '#ffb800', fontWeight: 700 }}>
          {player.chips.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

function RaiseControl({ min, max, blind, onConfirm, onCancel }: {
  min: number; max: number; blind: number; onConfirm: (n: number) => void; onCancel: () => void;
}) {
  const [val, setVal] = useState(min);
  useEffect(() => setVal(Math.max(min, Math.min(max, val))), [min, max]);
  const step = blind;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 10,
      padding: '10px 14px', background: '#0a0f1a',
      borderTop: '1px solid #1e293b',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>RAISE AMOUNT</span>
        <span style={{ fontSize: 18, fontWeight: 900, color: '#ffb800' }}>{val.toLocaleString()}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={val}
        onChange={e => setVal(Number(e.target.value))}
        style={{ width: '100%', accentColor: '#ffb800' }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        {[min, Math.round((min+max)*0.33), Math.round((min+max)*0.67), max].map(v => (
          <button key={v} onClick={() => setVal(v)} style={{
            flex: 1, padding: '6px 0', borderRadius: 8,
            background: val === v ? '#ffb800' : '#131a2a',
            border: 'none', fontSize: 10, fontWeight: 800,
            color: val === v ? '#0a0f1a' : '#64748b', cursor: 'pointer',
          }}>{v === max ? 'ALL' : v >= 1000 ? (v/1000).toFixed(1)+'k' : v}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onCancel} style={{
          flex: 1, padding: '12px', borderRadius: 12,
          background: '#131a2a', border: '1px solid #1e293b',
          color: '#64748b', fontSize: 13, fontWeight: 700, cursor: 'pointer',
        }}>Cancel</button>
        <button onClick={() => onConfirm(val)} style={{
          flex: 2, padding: '12px', borderRadius: 12,
          background: '#ffb800', border: 'none',
          color: '#0a0f1a', fontSize: 14, fontWeight: 900, cursor: 'pointer',
        }}>Raise {val.toLocaleString()} 🪙</button>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────────
export default function PokerTable() {
  const { tableId } = useParams<{ tableId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, token } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [holeCards, setHoleCards] = useState<string[]>([]);
  const [validActions, setValidActions] = useState<{ action: string; min_amount: number; max_amount: number }[] | null>(null);
  const [assignment, setAssignment] = useState<Assignment>({ board_1: [], board_2: [], board_3: [] });
  const [submitting, setSubmitting] = useState(false);
  const [showRaise, setShowRaise] = useState(false);
  const [showdownData, setShowdownData] = useState<unknown>(null);
  const [showShowdown, setShowShowdown] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'open' | 'closed'>('connecting');

  // Hole card ordering for pre-assignment (drag-to-reorder)
  const [holeCardOrder, setHoleCardOrder] = useState<number[]>([]);
  const [dragSrcIdx, setDragSrcIdx] = useState<number | null>(null);

  // Showdown vote
  const [readyVoted, setReadyVoted] = useState(false);

  const { playCheck, playChips, playTick, playSubmit, playFold, muted, toggleMute } = useSoundEffects();
  const prevRoundRef = useRef('');
  const prevTimeRef = useRef(0);

  // ── WebSocket ──────────────────────────────────────────────────────────────
  const sendWs = useCallback((msg: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  useEffect(() => {
    if (!user?.id || !tableId) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/game/ws/${tableId}/${user.id}`);
    wsRef.current = ws;
    setWsStatus('connecting');

    ws.onopen = () => setWsStatus('open');
    ws.onclose = () => setWsStatus('closed');

    ws.onmessage = e => {
      try {
        const msg = JSON.parse(e.data);
        switch (msg.type) {
          case 'game_state': {
            const gs = msg.data as GameState;
            setGameState(gs);
            if (gs.round !== 'assignment') {
              setAssignment({ board_1: [], board_2: [], board_3: [] });
              setSubmitting(false);
            }
            if (gs.round === 'showdown') setValidActions(null);
            // Reset vote when new hand starts (round no longer showdown)
            if (gs.round !== 'showdown') setReadyVoted(false);
            break;
          }
          case 'hole_cards':
            const newCards = msg.data.hole_cards;
            // Only reset order if cards actually changed
            if (JSON.stringify(newCards) !== JSON.stringify(holeCards)) {
              setHoleCards(newCards);
              setHoleCardOrder(newCards.map((_: string, i: number) => i));
            }
            break;
          case 'your_turn':
            // Backend sends valid_actions as an object with action keys
            const acts = msg.data.valid_actions;
            const actionsList = [];
            if (acts.fold) actionsList.push({ action: 'fold', min_amount: 0, max_amount: 0 });
            if (acts.check) actionsList.push({ action: 'check', min_amount: 0, max_amount: 0 });
            if (acts.call !== undefined) actionsList.push({ action: 'call', min_amount: acts.call, max_amount: acts.call });
            if (acts.raise) actionsList.push({ action: 'raise', min_amount: acts.raise.min, max_amount: acts.raise.max });
            if (acts.all_in !== undefined) actionsList.push({ action: 'all_in', min_amount: acts.all_in, max_amount: acts.all_in });
            setValidActions(actionsList);
            setShowRaise(false);
            break;
          case 'showdown_result':
            setShowdownData(msg.data);
            setShowShowdown(true);
            break;
          case 'error':
            console.warn('Game error:', msg.data.message);
            break;
        }
      } catch {}
    };

    return () => ws.close();
  }, [user?.id, tableId]);

  // ── Countdown timer ───────────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      if (!gameState?.timer_ends) { setTimeLeft(0); return; }
      const tl = Math.max(0, Math.round(gameState.timer_ends - Date.now() / 1000));
      setTimeLeft(tl);
      // Tick sound for last 15 seconds
      if (tl <= 15 && tl > 0 && tl !== prevTimeRef.current) {
        playTick();
      }
      prevTimeRef.current = tl;
    }, 500);
    return () => clearInterval(interval);
  }, [gameState?.timer_ends, playTick]);

  // ── Pre-assignment from hole card order ───────────────────────────────────
  useEffect(() => {
    const round = gameState?.round;
    if (round === 'assignment' && prevRoundRef.current !== 'assignment') {
      if (holeCards.length === 6 && holeCardOrder.length === 6) {
        const ordered = holeCardOrder.map(i => holeCards[i]);
        setAssignment({
          board_1: [ordered[0], ordered[1]],
          board_2: [ordered[2], ordered[3]],
          board_3: [ordered[4], ordered[5]],
        });
      }
    }
    prevRoundRef.current = round || '';
  }, [gameState?.round]);

  // ── Auto-start game if host ───────────────────────────────────────────────
  useEffect(() => {
    if (searchParams.get('host') && gameState?.round === 'waiting' && wsStatus === 'open') {
      const t = setTimeout(() => sendWs({ type: 'start_game' }), 1200);
      return () => clearTimeout(t);
    }
  }, [gameState?.round, wsStatus, searchParams, sendWs]);

  // ── Action handler ────────────────────────────────────────────────────────
  const handleAction = useCallback((action: string, amount = 0) => {
    sendWs({ type: 'player_action', data: { action, amount } });
    setShowRaise(false);
    // Sounds
    if (action === 'check') playCheck();
    else if (action === 'fold') playFold();
    else playChips(action === 'raise' || action === 'all_in' ? 5 : 3);
  }, [sendWs, playCheck, playFold, playChips]);

  const handleSubmitAssignment = useCallback((a: Assignment) => {
    setSubmitting(true);
    sendWs({ type: 'assign_cards', data: a });
    playSubmit();
  }, [sendWs, playSubmit]);

  const handleReadyNextHand = useCallback(() => {
    setReadyVoted(true);
    sendWs({ type: 'ready_next_hand' });
  }, [sendWs]);

  // ── Hole card drag / tap-to-swap ──────────────────────────────────────────
  const handleCardDragStart = (posIdx: number) => setDragSrcIdx(posIdx);
  const handleCardDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleCardDrop = (posIdx: number) => {
    if (dragSrcIdx !== null && dragSrcIdx !== posIdx) {
      const next = [...holeCardOrder];
      [next[dragSrcIdx], next[posIdx]] = [next[posIdx], next[dragSrcIdx]];
      setHoleCardOrder(next);
    }
    setDragSrcIdx(null);
  };
  const handleCardTap = (posIdx: number) => {
    if (dragSrcIdx === null) { setDragSrcIdx(posIdx); return; }
    if (dragSrcIdx === posIdx) { setDragSrcIdx(null); return; }
    const next = [...holeCardOrder];
    [next[dragSrcIdx], next[posIdx]] = [next[posIdx], next[dragSrcIdx]];
    setHoleCardOrder(next);
    setDragSrcIdx(null);
  };

  // ── Derived values ────────────────────────────────────────────────────────
  const round = gameState?.round ?? 'waiting';
  const players = gameState?.players ?? [];
  const myPlayer = players.find(p => p.user_id === user?.id);
  const opponents = SEAT_ANGLES.map((_, i) => {
    // Assign opponents to fixed visual slots (excluding me)
    const opps = players.filter(p => p.user_id !== user?.id);
    return opps[i] ?? null;
  });
  const isMyTurn = myPlayer && myPlayer.seat === gameState?.current_seat && round !== 'waiting' && round !== 'showdown' && round !== 'assignment';
  const callAction = validActions?.find(a => a.action === 'call');
  const checkAction = validActions?.find(a => a.action === 'check');
  const raiseAction = validActions?.find(a => a.action === 'raise');
  const allInAction = validActions?.find(a => a.action === 'all_in');
  const foldAction = validActions?.find(a => a.action === 'fold');
  const blindBig = gameState?.blind_big ?? 50;
  const orderedHoleCards = holeCardOrder.length === holeCards.length
    ? holeCardOrder.map(i => holeCards[i])
    : holeCards;
  const BOARD_COLORS = ['#3b82f6', '#22c55e', '#f59e0b'];
  const BOARD_LABELS = ['B1', 'B1', 'B2', 'B2', 'B3', 'B3'];
  
  // Timer progress (0-1) for circular timer around active player
  const timerDuration = round === 'showdown' ? 120 : round === 'assignment' ? 60 : 30;
  const timerProgress = timeLeft > 0 ? timeLeft / timerDuration : 0;

  // ── Render ────────────────────────────────────────────────────────────────
  if (!user) return null;

  if (round === 'assignment') {
    return (
      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#060b14' }}>
        {/* Mini header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 16px', background: '#0a0f1a',
          borderBottom: '1px solid #1e293b', flexShrink: 0,
        }}>
          <button onClick={() => navigate('/lobby')} style={{
            background: 'none', border: 'none', color: '#64748b',
            fontSize: 22, cursor: 'pointer', padding: '0 4px',
          }}>←</button>
          <span style={{ fontWeight: 900, color: '#fff', fontSize: 15 }}>ASSIGN CARDS</span>
        </div>
        <AssignmentPanel
          holeCards={holeCards}
          boards={gameState?.boards ?? []}
          assignment={assignment}
          onAssignmentChange={setAssignment}
          onSubmit={handleSubmitAssignment}
          timeLeft={timeLeft}
          assignedUids={gameState?.assigned_uids ?? []}
          myUserId={user.id}
          players={players}
          submitting={submitting}
        />
      </div>
    );
  }

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#060b14', overflow: 'hidden' }}>
      {/* ── TOP BAR ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', height: 52, background: '#0a0f1a',
        borderBottom: '1px solid #1e293b', flexShrink: 0,
      }}>
        <button onClick={() => navigate('/lobby')} style={{
          background: 'none', border: 'none', color: '#64748b',
          fontSize: 22, cursor: 'pointer', padding: '4px',
        }}>←</button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: '#fff' }}>{gameState ? '#' + gameState.hand_number : '—'}</div>
          <div style={{ fontSize: 10, color: '#00f0ff', letterSpacing: 1 }}>{round.toUpperCase()}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: '#ffb800', fontWeight: 700 }}>POT</div>
            <div style={{ fontSize: 14, fontWeight: 900, color: '#fff' }}>{(gameState?.pot ?? 0).toLocaleString()}</div>
          </div>
          {/* Mute button */}
          <button
            onClick={toggleMute}
            data-testid="mute-toggle"
            style={{
              background: muted ? '#ef444440' : '#131a2a',
              border: `2px solid ${muted ? '#ef4444' : '#334155'}`,
              borderRadius: 10,
              padding: '8px 14px',
              fontSize: 20,
              cursor: 'pointer',
              color: muted ? '#ef4444' : '#94a3b8',
              transition: 'all 0.2s',
            }}
            title={muted ? 'Unmute sounds' : 'Mute sounds'}
          >
            {muted ? '🔇' : '🔊'}
          </button>
        </div>
      </div>

      {/* ── GAME VIEW ── */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', overflow: 'hidden',
        paddingTop: 8,
      }}>
        {/* ── TABLE ZONE ── */}
        <div style={{ position: 'relative', width: ZONE_W, height: ZONE_H, flexShrink: 0 }}>

          {/* Oval felt */}
          <div style={{
            position: 'absolute', left: PAD, top: PAD,
            width: TABLE_W, height: TABLE_H,
            borderRadius: TABLE_W / 2,
            background: 'radial-gradient(ellipse at 40% 35%, #1a5c32, #0f3d22)',
            border: '3px solid #1a4a28',
            boxShadow: 'inset 0 0 40px rgba(0,0,0,0.4)',
            overflow: 'hidden',
          }}>
            {/* Community boards inside oval */}
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '10px 8px',
            }}>
              {(gameState?.boards ?? []).map((b, i) => {
                const community = [...b.flop, b.turn, b.river].filter(Boolean);
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    background: 'rgba(0,0,0,0.25)', borderRadius: 10,
                    padding: '4px 8px', justifyContent: 'center',
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 900, color: BOARD_COLORS[i], marginRight: 4, minWidth: 16 }}>B{i+1}</span>
                    {[0,1,2,3,4].map(ci => (
                      <PlayingCard key={ci} card={community[ci] ?? undefined} faceDown={!community[ci]} size="board" />
                    ))}
                  </div>
                );
              })}
              {round === 'waiting' && (
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: 4 }}>
                  Waiting for players…
                </div>
              )}
            </div>
          </div>

          {/* ── Dealer Button "D" ── */}
          {round !== 'waiting' && gameState?.dealer_seat !== undefined && (() => {
            const dealer = players.find(p => p.seat === gameState.dealer_seat);
            if (!dealer) return null;
            let angle: number;
            if (dealer.user_id === user.id) {
              angle = 90;
            } else {
              const oppIdx = opponents.findIndex(o => o?.user_id === dealer.user_id);
              if (oppIdx < 0) return null;
              angle = SEAT_ANGLES[oppIdx];
            }
            const sp = seatInZone(angle);
            const cx = PAD + TABLE_W / 2;
            const cy = PAD + TABLE_H / 2;
            const bx = sp.x + (cx - sp.x) * 0.25;
            const by = sp.y + (cy - sp.y) * 0.25;
            return (
              <div style={{
                position: 'absolute', left: bx - 11, top: by - 11,
                width: 22, height: 22, borderRadius: '50%',
                background: '#fff', border: '2px solid #0f3d22',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 16, boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
                pointerEvents: 'none',
              }}>
                <span style={{ fontSize: 10, fontWeight: 900, color: '#0a0f1a' }}>D</span>
              </div>
            );
          })()}

          {/* ── Per-player bet chips on the felt ── */}
          {players.filter(p => p.bet_street > 0).map(p => {
            let angle: number;
            if (p.user_id === user.id) {
              angle = 90;
            } else {
              const oppIdx = opponents.findIndex(o => o?.user_id === p.user_id);
              if (oppIdx < 0) return null;
              angle = SEAT_ANGLES[oppIdx];
            }
            const cp = chipPos(angle);
            return (
              <div key={p.user_id} style={{
                position: 'absolute',
                left: cp.x - 24, top: cp.y - 12,
                background: '#1e3a6e',
                borderRadius: 10, padding: '3px 8px',
                display: 'flex', alignItems: 'center', gap: 3,
                zIndex: 12, border: '1px solid #3b82f6',
                pointerEvents: 'none',
              }}>
                <span style={{ fontSize: 9 }}>🪙</span>
                <span style={{ fontSize: 10, fontWeight: 900, color: '#93c5fd' }}>
                  {p.bet_street.toLocaleString()}
                </span>
              </div>
            );
          })}

          {/* ── Opponent Seats ── */}
          {SEAT_ANGLES.map((angle, i) => {
            const opp = opponents[i];
            if (!opp) return (
              <div key={i} style={{
                position: 'absolute',
                left: seatInZone(angle).x - SEAT_SIZE / 2,
                top: seatInZone(angle).y - SEAT_SIZE / 2 - 4,
                zIndex: 10,
                width: SEAT_SIZE,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              }}>
                <div style={{
                  width: SEAT_SIZE, height: SEAT_SIZE, borderRadius: '50%',
                  border: '2px dashed #1e293b',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontSize: 16, color: '#1e293b' }}>+</span>
                </div>
              </div>
            );
            const isActive = opp.seat === gameState?.current_seat;
            const pos = seatInZone(angle);
            return (
              <div key={i} style={{
                position: 'absolute',
                left: pos.x - SEAT_SIZE / 2 - 4,
                top: pos.y - SEAT_SIZE / 2 - 4,
                zIndex: 10,
              }}>
                <PlayerSeat player={opp} isMine={false} isActive={isActive} timerProgress={isActive ? timerProgress : undefined} />
              </div>
            );
          })}

          {/* ── My Seat (overlaps oval bottom halfway) ── */}
          {myPlayer && (() => {
            const pos = seatInZone(90); // center at oval bottom edge
            return (
              <div style={{
                position: 'absolute',
                left: pos.x - SEAT_SIZE / 2 - 4,
                top: pos.y - SEAT_SIZE / 2 - 4, // half inside oval
                zIndex: 10,
              }}>
                <PlayerSeat player={myPlayer} isMine={true} isActive={!!isMyTurn} timerProgress={isMyTurn ? timerProgress : undefined} />
              </div>
            );
          })()}
        </div>

        {/* ── My Hole Cards (with drag-to-reorder and board labels) ── */}
        {holeCards.length > 0 && round !== 'waiting' && (
          <div style={{
            position: 'relative', zIndex: 20,
            marginTop: Math.round(SEAT_SIZE * 0.55),
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            flexShrink: 0,
          }}>
            {/* Cards row */}
            <div style={{ display: 'flex', gap: 6 }}>
              {orderedHoleCards.map((card, posIdx) => {
                const bIdx = Math.floor(posIdx / 2); // 0=B1, 1=B2, 2=B3
                const bColor = BOARD_COLORS[bIdx];
                const isSelected = dragSrcIdx === posIdx;
                return (
                  <div
                    key={posIdx}
                    draggable
                    onDragStart={() => handleCardDragStart(posIdx)}
                    onDragOver={handleCardDragOver}
                    onDrop={() => handleCardDrop(posIdx)}
                    onClick={() => handleCardTap(posIdx)}
                    style={{
                      cursor: 'pointer',
                      border: isSelected ? `2px solid ${bColor}` : '2px solid transparent',
                      borderRadius: 8,
                      transform: isSelected ? 'translateY(-6px)' : 'none',
                      transition: 'transform 0.15s ease',
                      boxShadow: isSelected ? `0 0 14px ${bColor}80` : 'none',
                      // Separate pairs with slight gap
                      marginLeft: posIdx > 0 && posIdx % 2 === 0 ? 8 : 0,
                    }}
                  >
                    <PlayingCard card={card} size="md" />
                  </div>
                );
              })}
            </div>
            {/* Board labels under each pair */}
            <div style={{ display: 'flex', gap: 6 }}>
              {BOARD_LABELS.map((label, posIdx) => {
                const bIdx = Math.floor(posIdx / 2);
                const bColor = BOARD_COLORS[bIdx];
                const cardW = 44; // md card width approx
                return (
                  <div key={posIdx} style={{
                    width: cardW, textAlign: 'center',
                    fontSize: 9, fontWeight: 900, color: bColor,
                    marginLeft: posIdx > 0 && posIdx % 2 === 0 ? 8 : 0,
                  }}>{label}</div>
                );
              })}
            </div>
            {dragSrcIdx !== null && (
              <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>Tap another card to swap board assignment</div>
            )}
          </div>
        )}

        {/* Waiting state */}
        {round === 'waiting' && (
          <div style={{ textAlign: 'center', padding: '20px 16px', color: '#64748b', fontSize: 13 }}>
            <div style={{ marginBottom: 8 }}>{players.length} / {gameState?.max_players ?? 6} players</div>
            {user.id === gameState?.players[0]?.user_id && (
              <button
                onClick={() => sendWs({ type: 'start_game' })}
                disabled={players.length < 2}
                style={{
                  background: players.length >= 2 ? '#00f0ff' : '#1e293b',
                  border: 'none', borderRadius: 12, padding: '12px 28px',
                  fontSize: 14, fontWeight: 900,
                  color: players.length >= 2 ? '#0a0f1a' : '#475569',
                  cursor: players.length >= 2 ? 'pointer' : 'default',
                }}
              >{players.length >= 2 ? '▶ Start Game' : 'Waiting for players...'}</button>
            )}
          </div>
        )}
      </div>

      {/* ── ACTION BAR ── */}
      {!showRaise && isMyTurn && validActions && (
        <div style={{
          display: 'flex', gap: 8, padding: '12px 14px',
          paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
          background: '#0a0f1a', borderTop: '1px solid #1e293b', flexShrink: 0,
        }}>
          {foldAction && (
            <button onClick={() => handleAction('fold')} style={{
              flex: 1, padding: '14px 6px', borderRadius: 12,
              background: '#131a2a', border: '1px solid #334155',
              color: '#ef4444', fontSize: 13, fontWeight: 900, cursor: 'pointer',
            }}>Fold</button>
          )}
          {checkAction && (
            <button onClick={() => handleAction('check')} style={{
              flex: 1.5, padding: '14px 6px', borderRadius: 12,
              background: '#131a2a', border: '1px solid #22c55e',
              color: '#22c55e', fontSize: 13, fontWeight: 900, cursor: 'pointer',
            }}>Check ✓✓</button>
          )}
          {callAction && (
            <button onClick={() => handleAction('call', callAction.min_amount)} style={{
              flex: 1.5, padding: '14px 6px', borderRadius: 12,
              background: '#131a2a', border: '1px solid #3b82f6',
              color: '#3b82f6', fontSize: 13, fontWeight: 900, cursor: 'pointer',
            }}>Call {callAction.min_amount.toLocaleString()}</button>
          )}
          {raiseAction && (
            <button onClick={() => setShowRaise(true)} style={{
              flex: 1.5, padding: '14px 6px', borderRadius: 12,
              background: '#ffb800', border: 'none',
              color: '#0a0f1a', fontSize: 13, fontWeight: 900, cursor: 'pointer',
            }}>Raise 🪙</button>
          )}
          {!raiseAction && allInAction && (
            <button onClick={() => handleAction('all_in', allInAction.max_amount)} style={{
              flex: 1.5, padding: '14px 6px', borderRadius: 12,
              background: '#dc2626', border: 'none',
              color: '#fff', fontSize: 13, fontWeight: 900, cursor: 'pointer',
            }}>ALL IN 🚀</button>
          )}
        </div>
      )}

      {showRaise && raiseAction && (
        <RaiseControl
          min={raiseAction.min_amount}
          max={raiseAction.max_amount}
          blind={blindBig}
          onConfirm={amt => handleAction('raise', amt)}
          onCancel={() => setShowRaise(false)}
        />
      )}

      {/* WS status banner */}
      {wsStatus === 'closed' && (
        <div style={{
          position: 'fixed', bottom: 80, left: 0, right: 0,
          background: '#ef4444', padding: '8px', textAlign: 'center',
          fontSize: 12, color: '#fff', fontWeight: 700, zIndex: 100,
        }}>Connection lost — refresh to reconnect</div>
      )}

      {/* ── SHOWDOWN OVERLAY ── */}
      <ShowdownOverlay
        visible={showShowdown}
        result={showdownData as any}
        boards={gameState?.boards ?? []}
        players={players}
        myUserId={user.id}
        timerEnds={gameState?.timer_ends ?? 0}
        showdownReady={gameState?.showdown_ready ?? []}
        totalPlayers={players.length}
        alreadyVoted={readyVoted}
        onReadyNextHand={handleReadyNextHand}
        onClose={() => setShowShowdown(false)}
      />
    </div>
  );
}
