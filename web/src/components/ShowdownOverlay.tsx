import React, { useState, useEffect } from 'react';
import PlayingCard from './PlayingCard';

interface PublicPlayer { user_id: string; username: string; avatar: string; avatar_color: string; chips: number; status: string; }
interface BoardState { board_id: number; flop: string[]; turn: string; river: string; }
interface ShowdownResult {
  player_results: Record<string, Record<string, unknown>>;
  board_winners: Record<string, string[]>;
  points: Record<string, number>;
  chips_won: Record<string, number>;
  pot: number;
  uncontested?: boolean;
  winner_username?: string;
  hole_cards_revealed: Record<string, string[]>;
  player_statuses: Record<string, string>;
}

interface Props {
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

export default function ShowdownOverlay({ visible, result, boards, players, myUserId, onClose }: Props) {
  const [countdown, setCountdown] = useState(8);

  useEffect(() => {
    if (!visible) { setCountdown(8); return; }
    const interval = setInterval(() => {
      setCountdown(s => { if (s <= 1) { clearInterval(interval); return 0; } return s - 1; });
    }, 1000);
    return () => clearInterval(interval);
  }, [visible]);

  if (!visible || !result) return null;

  const getName = (uid: string) => players.find(p => p.user_id === uid)?.username ?? uid;
  const getAvatar = (uid: string) => players.find(p => p.user_id === uid)?.avatar ?? '?';
  const getColor = (uid: string) => players.find(p => p.user_id === uid)?.avatar_color ?? '#ffffff';

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      zIndex: 200,
    }}>
      <div style={{
        background: '#0a0f1a', border: '1px solid #1e293b',
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        width: '100%', maxWidth: 480,
        maxHeight: '85dvh', display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '16px 20px', borderBottom: '1px solid #1e293b', flexShrink: 0,
        }}>
          <span style={{ fontSize: 17, fontWeight: 900, color: '#ffb800', letterSpacing: 2 }}>
            {result.uncontested ? '🃏 UNCONTESTED WIN' : '🃏 SHOWDOWN'}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 18, cursor: 'pointer', width: 32, height: 32 }}>✕</button>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 8 }}>
          {result.uncontested ? (
            <div style={{
              margin: 20, padding: 32, textAlign: 'center',
              background: '#131a2a', borderRadius: 20, border: '1px solid #1e293b',
            }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#ffffff', marginBottom: 10 }}>
                {result.winner_username} takes the pot!
              </div>
              <div style={{ fontSize: 32, fontWeight: 900, color: '#ffb800' }}>🪙 {result.pot.toLocaleString()}</div>
            </div>
          ) : (
            <>
              {BOARD_KEYS.map((bk, i) => {
                const winners = result.board_winners[bk] ?? [];
                const color = BOARD_COLORS[i];
                const board = boards[i];
                const communityCards = board ? [...board.flop, board.turn, board.river].filter(Boolean) : [];
                const activePlayers = Object.keys(result.player_results);

                return (
                  <div key={bk} style={{
                    margin: '12px 16px 0',
                    background: '#0d1520', borderRadius: 16,
                    border: `1px solid ${color}50`, padding: 12,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.5, color }}>{BOARD_NAMES[i]}</span>
                      <div style={{ display: 'flex', gap: 2 }}>
                        {communityCards.map((card, ci) => (
                          <PlayingCard key={ci} card={card} size="xs" />
                        ))}
                      </div>
                    </div>
                    {activePlayers.map(uid => {
                      const pr = (result.player_results[uid] as Record<string, { hole_cards?: string[]; description?: string }>)[bk];
                      const isWinner = winners.includes(uid);
                      const boardHoleCards: string[] = pr?.hole_cards ?? [];
                      return (
                        <div key={uid} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '6px', borderRadius: 10, marginBottom: 2,
                          background: isWinner ? color + '12' : 'transparent',
                        }}>
                          <span style={{ fontSize: 18 }}>{getAvatar(uid)}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: isWinner ? color : '#ffffff' }}>
                              {isWinner ? '🏆 ' : ''}{getName(uid)}
                            </div>
                            <div style={{ fontSize: 10, color: '#64748b', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {pr?.description ?? '—'}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 3 }}>
                            {boardHoleCards.map((c, ci) => <PlayingCard key={ci} card={c} size="xs" />)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {/* Summary */}
              <div style={{
                margin: '12px 16px 0', background: '#131a2a',
                borderRadius: 16, border: '1px solid #1e293b', padding: 14,
              }}>
                <div style={{ fontSize: 9, fontWeight: 900, color: '#475569', letterSpacing: 2, marginBottom: 10 }}>FINAL SCORES</div>
                {Object.entries(result.points)
                  .sort(([,a],[,b]) => b - a)
                  .map(([uid, pts]) => {
                    const won = result.chips_won[uid] ?? 0;
                    const isMe = uid === myUserId;
                    return (
                      <div key={uid} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px',
                        borderBottom: '1px solid #ffffff08', borderRadius: isMe ? 12 : 0,
                        background: isMe ? '#00f0ff0a' : 'transparent',
                        marginBottom: 2,
                      }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: '50%',
                          border: `2px solid ${getColor(uid)}`,
                          background: getColor(uid) + '30',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                          <span style={{ fontSize: 18 }}>{getAvatar(uid)}</span>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#ffffff' }}>{getName(uid)}</div>
                          <div style={{ fontSize: 11, color: '#ffb800', marginTop: 2 }}>{pts} pt{pts !== 1 ? 's' : ''}</div>
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 900, color: won > 0 ? '#22c55e' : '#64748b' }}>
                          {won > 0 ? '+' : ''}{won.toLocaleString()} 🪙
                        </span>
                      </div>
                    );
                  })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 16px', textAlign: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: '#475569' }}>Next hand in {countdown}s</span>
        </div>
      </div>
    </div>
  );
}
