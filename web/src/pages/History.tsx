import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PlayingCard from '../components/PlayingCard';

interface PlayerStat {
  user_id: string; username: string; avatar: string; avatar_color: string;
  hands_played: number; boards_won: number; chips_net: number; pots_won: number;
}

interface HandPlayer {
  user_id: string; username: string; avatar: string; avatar_color: string;
  chips_won: number; contributed: number; net: number;
}

interface HandRecord {
  table_id: string; table_name: string; hand_number: number;
  pot: number; uncontested: boolean; winner_username: string;
  board_winners: Record<string, string[]>;
  points: Record<string, number>;
  chips_won: Record<string, number>;
  boards: { board_id: number; flop: string[]; turn: string; river: string }[];
  players: HandPlayer[];
  played_at: string;
  hole_cards_revealed?: Record<string, string[]>;
  assignments?: Record<string, Record<string, string[]>>;
}

const BOARD_COLORS = ['#3b82f6', '#22c55e', '#f59e0b'];
const BOARD_KEYS = ['board_1', 'board_2', 'board_3'];

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function fmt(n: number): string {
  return n >= 0 ? `+${n.toLocaleString()}` : n.toLocaleString();
}

export default function History() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'leaderboard' | 'hands'>('leaderboard');
  const [stats, setStats] = useState<PlayerStat[]>([]);
  const [hands, setHands] = useState<HandRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sr, hr] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/history?limit=50'),
      ]);
      if (sr.ok) setStats(await sr.json());
      if (hr.ok) setHands(await hr.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!user) return null;

  return (
    <div style={{ minHeight: '100dvh', background: '#060b14', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{
        background: '#0a0f1a', borderBottom: '1px solid #1e293b',
        padding: '0 clamp(16px,4vw,40px)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: 64, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={() => navigate('/lobby')} style={{
            background: 'none', border: 'none', color: '#64748b',
            fontSize: 22, cursor: 'pointer', padding: '4px',
          }}>←</button>
          <div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#fff', letterSpacing: 1 }}>STATS & HISTORY</div>
            <div style={{ fontSize: 10, color: '#475569', letterSpacing: 2 }}>CHULLZ POKER</div>
          </div>
        </div>
        <button onClick={load} style={{
          background: '#1e293b', border: 'none', borderRadius: 10,
          padding: '8px 16px', fontSize: 12, color: '#64748b',
          cursor: 'pointer', fontWeight: 700,
        }}>↻ Refresh</button>
      </header>

      {/* Tabs */}
      <div style={{
        display: 'flex', background: '#0a0f1a',
        borderBottom: '1px solid #1e293b', flexShrink: 0,
        padding: '0 clamp(16px,4vw,40px)',
      }}>
        {(['leaderboard', 'hands'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            data-testid={`tab-${t}`}
            style={{
              background: 'none', border: 'none',
              borderBottom: `2px solid ${tab === t ? '#00f0ff' : 'transparent'}`,
              padding: '14px 20px', fontSize: 13, fontWeight: 700,
              color: tab === t ? '#00f0ff' : '#475569',
              cursor: 'pointer', marginBottom: -1,
              textTransform: 'uppercase', letterSpacing: 1,
            }}
          >
            {t === 'leaderboard' ? 'Leaderboard' : 'Recent Hands'}
          </button>
        ))}
      </div>

      {/* Content */}
      <main style={{
        flex: 1, overflowY: 'auto',
        padding: 'clamp(16px,3vw,32px) clamp(16px,4vw,40px)',
        maxWidth: 900, margin: '0 auto', width: '100%', boxSizing: 'border-box',
      }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}>
            <div style={{ color: '#00f0ff', fontSize: 32, animation: 'spin 1s linear infinite' }}>⟳</div>
          </div>
        ) : tab === 'leaderboard' ? (
          <LeaderboardTab stats={stats} myUserId={user.id} />
        ) : (
          <HandsTab hands={hands} myUserId={user.id} expanded={expanded} setExpanded={setExpanded} />
        )}
      </main>
    </div>
  );
}

// ── Leaderboard ────────────────────────────────────────────────────────────────
function LeaderboardTab({ stats, myUserId }: { stats: PlayerStat[]; myUserId: string }) {
  if (stats.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0', color: '#475569' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🃏</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 8 }}>No games played yet</div>
        <div style={{ fontSize: 14 }}>Complete a hand to see stats here</div>
      </div>
    );
  }

  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Column headers */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '36px 1fr 80px 80px 110px 70px',
        gap: 8, padding: '0 16px',
        fontSize: 10, color: '#475569', fontWeight: 700, letterSpacing: 1,
      }}>
        <span>#</span>
        <span>PLAYER</span>
        <span style={{ textAlign: 'right' }}>HANDS</span>
        <span style={{ textAlign: 'right' }}>BOARDS</span>
        <span style={{ textAlign: 'right' }}>NET CHIPS</span>
        <span style={{ textAlign: 'right' }}>WIN%</span>
      </div>

      {stats.map((s, i) => {
        const isMe = s.user_id === myUserId;
        const winPct = s.hands_played > 0 ? Math.round((s.pots_won / s.hands_played) * 100) : 0;
        return (
          <div
            key={s.user_id}
            data-testid={`leaderboard-row-${s.user_id}`}
            style={{
              display: 'grid',
              gridTemplateColumns: '36px 1fr 80px 80px 110px 70px',
              gap: 8, alignItems: 'center',
              background: isMe ? '#00f0ff0a' : '#0a0f1a',
              border: `1px solid ${isMe ? '#00f0ff30' : '#1e293b'}`,
              borderRadius: 14, padding: '12px 16px',
              transition: 'border-color 0.15s',
            }}
          >
            {/* Rank */}
            <span style={{ fontSize: i < 3 ? 18 : 13, fontWeight: 900, color: '#475569', textAlign: 'center' }}>
              {i < 3 ? medals[i] : `${i + 1}`}
            </span>

            {/* Player */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <div style={{
                width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                border: `2px solid ${s.avatar_color}`,
                background: s.avatar_color + '25',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: 20 }}>{s.avatar}</span>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: 14, fontWeight: 700, color: isMe ? '#00f0ff' : '#fff',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{s.username}</div>
                <div style={{ fontSize: 10, color: '#475569' }}>{s.pots_won} pot{s.pots_won !== 1 ? 's' : ''} won</div>
              </div>
            </div>

            <span style={{ textAlign: 'right', fontSize: 13, color: '#64748b', fontWeight: 600 }}>
              {s.hands_played}
            </span>
            <span style={{ textAlign: 'right', fontSize: 13, color: '#64748b', fontWeight: 600 }}>
              {s.boards_won}
            </span>
            <span style={{
              textAlign: 'right', fontSize: 14, fontWeight: 900,
              color: s.chips_net >= 0 ? '#22c55e' : '#ef4444',
            }}>
              {fmt(s.chips_net)} 🪙
            </span>
            <span style={{
              textAlign: 'right', fontSize: 13, fontWeight: 700,
              color: winPct >= 50 ? '#22c55e' : '#64748b',
            }}>
              {winPct}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Recent Hands ───────────────────────────────────────────────────────────────
function HandsTab({ hands, myUserId, expanded, setExpanded }: {
  hands: HandRecord[]; myUserId: string;
  expanded: string | null; setExpanded: (k: string | null) => void;
}) {
  if (hands.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0', color: '#475569' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🃏</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 8 }}>No hands recorded yet</div>
        <div style={{ fontSize: 14 }}>Finish a hand to see it here</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {hands.map((hand, idx) => {
        const key = `${hand.table_id}-${hand.hand_number}-${idx}`;
        const isOpen = expanded === key;
        const myData = hand.players.find(p => p.user_id === myUserId);
        // Top scorer(s)
        const topPts = hand.points && Object.keys(hand.points).length > 0
          ? Math.max(...Object.values(hand.points))
          : 0;
        const potWinners = Object.entries(hand.points || {})
          .filter(([, v]) => v >= topPts && topPts > 0)
          .map(([uid]) => hand.players.find(p => p.user_id === uid)?.username ?? uid);

        return (
          <div
            key={key}
            data-testid={`hand-row-${idx}`}
            style={{
              background: '#0a0f1a', border: '1px solid #1e293b',
              borderRadius: 14, overflow: 'hidden',
            }}
          >
            {/* Summary row */}
            <div
              onClick={() => setExpanded(isOpen ? null : key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '14px 16px', cursor: 'pointer',
              }}
            >
              <div style={{
                background: '#131a2a', borderRadius: 10, padding: '6px 12px',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                flexShrink: 0, minWidth: 52,
              }}>
                <span style={{ fontSize: 10, color: '#475569', fontWeight: 700 }}>HAND</span>
                <span style={{ fontSize: 16, fontWeight: 900, color: '#fff' }}>#{hand.hand_number}</span>
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>
                    {hand.table_name}
                  </span>
                  <span style={{ fontSize: 11, color: '#ffb800', fontWeight: 700, flexShrink: 0 }}>
                    🪙 {hand.pot.toLocaleString()}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  {hand.uncontested
                    ? `🏆 ${hand.winner_username} (uncontested)`
                    : potWinners.length > 0
                      ? `🏆 ${potWinners.join(', ')}`
                      : '—'
                  }
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                {myData && (
                  <span style={{
                    fontSize: 13, fontWeight: 900,
                    color: myData.net > 0 ? '#22c55e' : myData.net < 0 ? '#ef4444' : '#64748b',
                  }}>
                    {fmt(myData.net)} 🪙
                  </span>
                )}
                <span style={{ fontSize: 10, color: '#334155' }}>{timeAgo(hand.played_at)}</span>
              </div>

              <span style={{ fontSize: 16, color: '#334155', flexShrink: 0 }}>{isOpen ? '▲' : '▼'}</span>
            </div>

            {/* Expanded detail */}
            {isOpen && (
              <div style={{ borderTop: '1px solid #1e293b', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Boards with card graphics */}
                {!hand.uncontested && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {BOARD_KEYS.map((bk, bi) => {
                      const winners = hand.board_winners[bk] ?? [];
                      const color = BOARD_COLORS[bi];
                      const board = hand.boards[bi];
                      const community = board ? [...board.flop, board.turn, board.river].filter(Boolean) : [];
                      return (
                        <div key={bk} style={{
                          background: '#131a2a', borderRadius: 10,
                          border: `1px solid ${color}40`, padding: '10px 12px',
                        }}>
                          {/* Board header + community cards */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 10, fontWeight: 900, color, letterSpacing: 1, minWidth: 48 }}>
                              BOARD {bi + 1}
                            </span>
                            <div style={{ display: 'flex', gap: 3 }}>
                              {community.map((card, ci) => <PlayingCard key={ci} card={card} size="xs" />)}
                              {/* placeholder face-downs if board incomplete */}
                              {Array.from({ length: Math.max(0, 5 - community.length) }, (_, ci) => (
                                <PlayingCard key={`ph-${ci}`} size="xs" faceDown />
                              ))}
                            </div>
                          </div>
                          {/* Per-player assigned hole cards */}
                          {hand.assignments && Object.entries(hand.assignments).map(([uid, assign]) => {
                            const boardHole: string[] = assign[bk] ?? [];
                            const isWinner = winners.includes(uid);
                            const p = hand.players.find(p => p.user_id === uid);
                            if (!p) return null;
                            return (
                              <div key={uid} style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '5px 6px', borderRadius: 8, marginBottom: 2,
                                background: isWinner ? color + '10' : 'transparent',
                              }}>
                                <span style={{ fontSize: 14, flexShrink: 0 }}>{p.avatar}</span>
                                <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                                  {boardHole.map((c, ci) => <PlayingCard key={ci} card={c} size="xs" />)}
                                  {boardHole.length === 0 && <span style={{ fontSize: 10, color: '#334155' }}>—</span>}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <span style={{
                                    fontSize: 11, fontWeight: 700,
                                    color: isWinner ? color : '#64748b',
                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block',
                                  }}>
                                    {isWinner ? '🏆 ' : ''}{p.username}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                          {/* Fallback: if no assignments stored (old records), show winner text */}
                          {!hand.assignments && (
                            <div style={{ fontSize: 12, fontWeight: 700, color: winners.length > 0 ? color : '#475569', marginTop: 4 }}>
                              {winners.length > 0
                                ? `🏆 ${winners.map(uid => hand.players.find(p => p.user_id === uid)?.username ?? uid).join(', ')}`
                                : '—'}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Players P&L */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontSize: 10, color: '#475569', fontWeight: 700, letterSpacing: 1, marginBottom: 2 }}>PLAYER P&L</div>
                  {hand.players.map(p => (
                    <div key={p.user_id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '6px 10px',
                      background: p.user_id === myUserId ? '#00f0ff08' : 'transparent',
                      borderRadius: 8,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 16 }}>{p.avatar}</span>
                        <span style={{ fontSize: 13, color: p.user_id === myUserId ? '#00f0ff' : '#fff', fontWeight: 600 }}>
                          {p.username}
                        </span>
                        {hand.points?.[p.user_id] !== undefined && (
                          <span style={{ fontSize: 11, color: '#ffb800' }}>
                            {hand.points[p.user_id]}pt{hand.points[p.user_id] !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      <span style={{
                        fontSize: 13, fontWeight: 900,
                        color: p.net > 0 ? '#22c55e' : p.net < 0 ? '#ef4444' : '#64748b',
                      }}>
                        {fmt(p.net)} 🪙
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
