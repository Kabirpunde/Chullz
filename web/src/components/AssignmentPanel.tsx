import React, { useState, useCallback, useRef, useEffect } from 'react';
import PlayingCard from './PlayingCard';
import { handPreview } from '../utils/handEvaluator';

interface BoardState { board_id: number; flop: string[]; turn: string; river: string; }
interface PublicPlayer { user_id: string; username: string; avatar: string; avatar_color: string; chips: number; status: string; bet_street: number; seat: number; }
export type Assignment = { board_1: string[]; board_2: string[]; board_3: string[] };

interface Props {
  holeCards: string[];
  boards: BoardState[];
  assignment: Assignment;
  onAssignmentChange: (a: Assignment) => void;
  onSubmit: (a: Assignment) => void;
  timeLeft: number;
  assignedUids: string[];
  myUserId: string;
  players: PublicPlayer[];
  submitting?: boolean;
}

const BOARD_KEYS: (keyof Assignment)[] = ['board_1', 'board_2', 'board_3'];
const BOARD_COLORS = ['#3b82f6', '#22c55e', '#f59e0b'];
const BOARD_NAMES = ['Board 1', 'Board 2', 'Board 3'];

function unassignCard(card: string, a: Assignment): Assignment {
  const r = { ...a };
  for (const k of BOARD_KEYS) r[k] = r[k].filter(c => c && c !== card);
  return r;
}

function isComplete(a: Assignment): boolean {
  return BOARD_KEYS.every(k => a[k].filter(Boolean).length === 2);
}

export default function AssignmentPanel({
  holeCards, boards, assignment, onAssignmentChange, onSubmit,
  timeLeft, assignedUids, myUserId, players, submitting = false,
}: Props) {
  const [selectedCard, setSelectedCard] = useState<string | null>(null);

  const handleCardTap = (card: string) => {
    const isAssigned = BOARD_KEYS.some(k => assignment[k].includes(card));
    if (isAssigned) {
      onAssignmentChange(unassignCard(card, assignment));
      if (selectedCard === card) setSelectedCard(null);
    } else if (selectedCard === card) {
      setSelectedCard(null);
    } else {
      setSelectedCard(card);
    }
  };

  const handleSlotTap = (boardKey: keyof Assignment, slotIdx: number) => {
    const currentCard = assignment[boardKey][slotIdx];
    if (currentCard) {
      onAssignmentChange(unassignCard(currentCard, assignment));
      return;
    }
    if (!selectedCard) return;
    const newA = unassignCard(selectedCard, { ...assignment });
    const arr = [...(newA[boardKey] ?? [])];
    while (arr.length <= slotIdx) arr.push('');
    arr[slotIdx] = selectedCard;
    newA[boardKey] = arr.slice(0, 2);
    onAssignmentChange(newA);
    setSelectedCard(null);
  };

  const getPreview = (boardKey: keyof Assignment, board: BoardState) => {
    const cards = assignment[boardKey].filter(Boolean);
    if (cards.length !== 2) return null;
    const community = [...board.flop, ...(board.turn ? [board.turn] : []), ...(board.river ? [board.river] : [])];
    return handPreview(cards, community);
  };

  const assignedCards = BOARD_KEYS.flatMap(k => assignment[k]).filter(Boolean);
  const done = isComplete(assignment);
  const alreadySubmitted = assignedUids.includes(myUserId);
  const timerColor = timeLeft <= 10 ? '#ef4444' : timeLeft <= 20 ? '#f59e0b' : '#00f0ff';
  const activePlayers = players.filter(p => p.status === 'active' || p.status === 'all_in');

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#060b14', overflow: 'hidden' }}>
      {/* Timer header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 16px', background: '#0a0f1a', borderBottom: '1px solid #1e293b',
        flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 900, color: '#ffffff', letterSpacing: 1 }}>ASSIGN YOUR CARDS</div>
          <div style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>2 hole cards to each board</div>
        </div>
        <div style={{
          padding: '6px 12px', borderRadius: 12, border: `2px solid ${timerColor}`,
          background: '#0a0f1a',
        }}>
          <span style={{ fontSize: 18, fontWeight: 900, letterSpacing: 2, color: timerColor }}>
            ⏱ {String(Math.floor(timeLeft / 60)).padStart(2, '0')}:{String(timeLeft % 60).padStart(2, '0')}
          </span>
        </div>
      </div>

      {/* Players ready */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
        background: '#0a0f1a', borderBottom: '1px solid #1e293b', flexShrink: 0,
      }}>
        {activePlayers.map(p => {
          const isDone = assignedUids.includes(p.user_id);
          return (
            <div key={p.user_id} style={{
              width: 30, height: 30, borderRadius: '50%', position: 'relative',
              background: isDone ? '#22c55e20' : '#131a2a',
              border: `1px solid ${isDone ? '#22c55e' : '#1e293b'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 15 }}>{p.avatar}</span>
              {isDone && <span style={{ position: 'absolute', top: -3, right: -3, fontSize: 9, color: '#22c55e', fontWeight: 900 }}>✓</span>}
            </div>
          );
        })}
        <span style={{ fontSize: 11, color: '#475569', marginLeft: 4 }}>
          {assignedUids.length}/{activePlayers.length} submitted
        </span>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' as never }}>
        {/* 3 boards */}
        <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {BOARD_KEYS.map((bk, idx) => {
            const board = boards[idx];
            const slots = assignment[bk];
            const preview = board ? getPreview(bk, board) : null;
            const color = BOARD_COLORS[idx];
            const community = board ? [...board.flop, board.turn, board.river].filter(Boolean) : [];

            return (
              <div key={bk} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: '#0d1420', borderRadius: 12, border: '1px solid #1e293b',
                borderLeftWidth: 3, borderLeftColor: color,
                padding: '8px 10px',
              }}>
                {/* Board label */}
                <div style={{
                  width: 30, height: 30, borderRadius: 6,
                  background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <span style={{ fontSize: 11, fontWeight: 900, color }}>B{idx + 1}</span>
                </div>

                {/* Community cards */}
                <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                  {[0,1,2,3,4].map(i => (
                    <PlayingCard key={i} card={community[i] ?? undefined} faceDown={!community[i]} size="xs" />
                  ))}
                </div>

                {/* Divider */}
                <div style={{ width: 1, height: 34, background: '#1e293b', flexShrink: 0 }} />

                {/* Assignment slots */}
                <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                  {[0,1].map(si => {
                    const card = slots[si];
                    return (
                      <button
                        key={si}
                        onClick={() => handleSlotTap(bk, si)}
                        style={{
                          width: 32, height: 44, borderRadius: 6,
                          background: card ? '#0f1e30' : (selectedCard ? '#00f0ff12' : '#0a0f1a'),
                          border: `2px ${card ? 'solid' : 'dashed'} ${card ? color : (selectedCard ? '#00f0ff80' : color + '70')}`,
                          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          padding: 0,
                        }}
                      >
                        {card ? (
                          <PlayingCard card={card} size="xs" assigned />
                        ) : (
                          <span style={{ fontSize: 16, color: selectedCard ? '#00f0ff' : '#334155', fontWeight: 700 }}>
                            {selectedCard ? '↓' : '?'}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Preview */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {preview ? (
                    <span style={{ fontSize: 9, fontWeight: 800, color }}>{preview.description}</span>
                  ) : (
                    <span style={{ fontSize: 9, color: '#334155' }}>
                      {slots.filter(Boolean).length === 0 ? '—' : '+1'}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Hole cards */}
        <div style={{ padding: '16px 16px 8px' }}>
          <div style={{
            fontSize: 9, color: '#475569', fontWeight: 900,
            letterSpacing: 1, marginBottom: 12, textTransform: 'uppercase',
          }}>
            Your 6 Cards — tap to select, tap slot to assign
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 10 }}>
            {holeCards.map(card => {
              const isSel = selectedCard === card;
              const isAsgn = assignedCards.includes(card);
              const isDim = !!selectedCard && !isSel && !isAsgn;
              return (
                <button
                  key={card}
                  onClick={() => handleCardTap(card)}
                  style={{
                    background: 'none', border: isSel ? '2px solid #00f0ff' : '2px solid transparent',
                    borderRadius: 10, cursor: 'pointer', padding: 0,
                    boxShadow: isSel ? '0 0 16px #00f0ff60' : 'none',
                    transform: isSel ? 'translateY(-6px)' : 'none',
                    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                  }}
                >
                  <PlayingCard card={card} size="md" selected={isSel} assigned={isAsgn} dimmed={isDim} />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Submit bar */}
      <div style={{
        display: 'flex', gap: 10, padding: '12px 16px',
        paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
        borderTop: '1px solid #1e293b', background: '#0a0f1a', flexShrink: 0,
      }}>
        {selectedCard && (
          <button
            onClick={() => setSelectedCard(null)}
            style={{
              padding: '14px', borderRadius: 12,
              background: '#131a2a', border: '1px solid #334155',
              color: '#94a3b8', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Deselect
          </button>
        )}
        <button
          onClick={() => {
            if (!done || alreadySubmitted || submitting) return;
            const filtered: Assignment = {
              board_1: assignment.board_1.filter(Boolean),
              board_2: assignment.board_2.filter(Boolean),
              board_3: assignment.board_3.filter(Boolean),
            };
            onSubmit(filtered);
          }}
          disabled={!done || alreadySubmitted || submitting}
          style={{
            flex: 1, padding: '16px', borderRadius: 14,
            background: done && !alreadySubmitted && !submitting ? '#ffb800' : '#131a2a',
            border: done && !alreadySubmitted ? 'none' : '1px solid #1e293b',
            fontSize: 14, fontWeight: 900,
            color: done && !alreadySubmitted && !submitting ? '#0a0f1a' : '#475569',
            cursor: done && !alreadySubmitted && !submitting ? 'pointer' : 'default',
          }}
        >
          {alreadySubmitted ? '✓ Submitted — Waiting...' :
            submitting ? 'Submitting...' :
            done ? '🃏 Submit Assignment' :
            `${6 - assignedCards.length} cards left to assign`}
        </button>
      </div>
    </div>
  );
}
