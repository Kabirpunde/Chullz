import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Animated, PanResponder, Dimensions,
} from 'react-native';
import PlayingCard from './PlayingCard';
import { handPreview } from '../utils/handEvaluator';

const { width } = Dimensions.get('window');

interface BoardState { board_id: number; flop: string[]; turn: string; river: string; }
interface PublicPlayer {
  user_id: string; username: string; avatar: string;
  avatar_color: string; chips: number; status: string;
  bet_street: number; seat: number;
}
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
  const [dragging, setDragging] = useState<string | null>(null);

  const dragX = useRef(new Animated.Value(0)).current;
  const dragY = useRef(new Animated.Value(0)).current;

  // Refs to avoid stale closures
  const assignRef = useRef(assignment);
  useEffect(() => { assignRef.current = assignment; }, [assignment]);
  const selectedRef = useRef<string | null>(null);
  useEffect(() => { selectedRef.current = selectedCard; }, [selectedCard]);
  const onChangeRef = useRef(onAssignmentChange);
  useEffect(() => { onChangeRef.current = onAssignmentChange; }, [onAssignmentChange]);

  // Slot position measurement
  const slotRefs = useRef<Record<string, View | null>>({});
  const slotPositions = useRef<Record<string, { x: number; y: number; w: number; h: number }>>({});

  // Panel offset measurement
  const panelRef = useRef<View | null>(null);
  const panelOffset = useRef({ x: 0, y: 0 });

  const measurePanel = useCallback(() => {
    setTimeout(() => {
      panelRef.current?.measureInWindow((x, y) => {
        panelOffset.current = { x, y };
      });
    }, 80);
  }, []);

  const measureSlot = (key: string) => {
    setTimeout(() => {
      slotRefs.current[key]?.measureInWindow((x, y, w, h) => {
        slotPositions.current[key] = { x, y, w, h };
      });
    }, 100);
  };

  const handleDrop = useCallback((card: string, screenX: number, screenY: number) => {
    for (const [key, pos] of Object.entries(slotPositions.current)) {
      if (
        screenX >= pos.x && screenX <= pos.x + pos.w &&
        screenY >= pos.y && screenY <= pos.y + pos.h
      ) {
        const [boardPart, slotPart] = key.split('_slot_');
        const boardKey = boardPart as keyof Assignment;
        const slotIdx = parseInt(slotPart, 10);
        const existing = assignRef.current[boardKey][slotIdx];
        if (existing && existing !== card) {
          // Slot taken — swap: unassign existing, also unassign card, then fill both
          return;
        }
        const newA = unassignCard(card, { ...assignRef.current });
        const arr = [...(newA[boardKey] ?? [])];
        while (arr.length <= slotIdx) arr.push('');
        arr[slotIdx] = card;
        newA[boardKey] = arr.slice(0, 2);
        onChangeRef.current(newA);
        return;
      }
    }
  }, []);

  // Per-card PanResponders
  const cardPanResponders = useMemo(() => {
    const map: Record<string, any> = {};
    holeCards.forEach(card => {
      map[card] = PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gs) =>
          Math.abs(gs.dx) > 6 || Math.abs(gs.dy) > 6,
        onPanResponderGrant: evt => {
          setDragging(card);
          dragX.setValue(evt.nativeEvent.pageX - panelOffset.current.x - 23);
          dragY.setValue(evt.nativeEvent.pageY - panelOffset.current.y - 32);
        },
        onPanResponderMove: (_, gs) => {
          dragX.setValue(gs.moveX - panelOffset.current.x - 23);
          dragY.setValue(gs.moveY - panelOffset.current.y - 32);
        },
        onPanResponderRelease: (_, gs) => {
          const isDrag = Math.abs(gs.dx) > 6 || Math.abs(gs.dy) > 6;
          if (isDrag) {
            handleDrop(card, gs.moveX, gs.moveY);
          } else {
            // Tap
            const cur = assignRef.current;
            const assigned = BOARD_KEYS.some(k => cur[k].includes(card));
            if (assigned) {
              onChangeRef.current(unassignCard(card, cur));
              if (selectedRef.current === card) setSelectedCard(null);
            } else if (selectedRef.current === card) {
              setSelectedCard(null);
            } else {
              setSelectedCard(card);
            }
          }
          setDragging(null);
        },
        onPanResponderTerminate: () => setDragging(null),
      });
    });
    return map;
  }, [holeCards, handleDrop]);

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
    const community = [...board.flop,
      ...(board.turn ? [board.turn] : []),
      ...(board.river ? [board.river] : []),
    ];
    return handPreview(cards, community);
  };

  const assignedCards = useMemo(() => [
    ...assignment.board_1, ...assignment.board_2, ...assignment.board_3,
  ].filter(Boolean), [assignment]);

  const done = isComplete(assignment);
  const alreadySubmitted = assignedUids.includes(myUserId);
  const timerColor = timeLeft <= 10 ? '#ef4444' : timeLeft <= 20 ? '#f59e0b' : '#00f0ff';
  const activePlayers = players.filter(p => p.status === 'active' || p.status === 'all_in');

  return (
    <View
      style={styles.root}
      ref={r => { panelRef.current = r as any; }}
      onLayout={measurePanel}
    >
      {/* Timer header */}
      <View style={styles.timerHeader}>
        <View>
          <Text style={styles.assignTitle}>ASSIGN YOUR CARDS</Text>
          <Text style={styles.assignSub}>2 hole cards to each board</Text>
        </View>
        <View style={[styles.timerBadge, { borderColor: timerColor }]}>
          <Text style={[styles.timerTxt, { color: timerColor }]}>
            ⏱ {String(Math.floor(timeLeft / 60)).padStart(2, '0')}:{String(timeLeft % 60).padStart(2, '0')}
          </Text>
        </View>
      </View>

      {/* Players ready */}
      <View style={styles.readyRow}>
        {activePlayers.map(p => {
          const done2 = assignedUids.includes(p.user_id);
          return (
            <View key={p.user_id} style={[styles.readyChip, done2 && styles.readyChipDone]}>
              <Text style={styles.readyAvatar}>{p.avatar}</Text>
              {done2 && <Text style={styles.readyCheck}>✓</Text>}
            </View>
          );
        })}
        <Text style={styles.readyTxt}>
          {assignedUids.length}/{activePlayers.length} submitted
        </Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
        {/* 3 boards — each is a full-width horizontal row stacked vertically */}
        <View style={styles.boardsColumn}>
          {BOARD_KEYS.map((bk, idx) => {
            const board = boards[idx];
            const slots = assignment[bk];
            const preview = board ? getPreview(bk, board) : null;
            const color = BOARD_COLORS[idx];
            const community = board
              ? [...board.flop, board.turn, board.river].filter(Boolean)
              : [];

            return (
              <View key={bk} style={[styles.boardRow, { borderLeftColor: color, borderLeftWidth: 3 }]}>
                {/* Board label */}
                <View style={[styles.boardLabelBox, { backgroundColor: color + '18' }]}>
                  <Text style={[styles.boardLabelTxt, { color }]}>B{idx + 1}</Text>
                </View>

                {/* Community cards — all 5 in a row */}
                <View style={styles.communityRow}>
                  {[0, 1, 2, 3, 4].map(i => (
                    <PlayingCard
                      key={i}
                      card={community[i] ?? undefined}
                      faceDown={!community[i]}
                      size="xs"
                    />
                  ))}
                </View>

                {/* Divider */}
                <View style={styles.rowDivider} />

                {/* Assignment slots */}
                <View style={styles.slotsRow}>
                  {[0, 1].map(si => {
                    const slotKey = `${bk}_slot_${si}`;
                    const card = slots[si];
                    return (
                      <TouchableOpacity
                        key={si}
                        ref={r => { slotRefs.current[slotKey] = r as any; }}
                        onLayout={() => measureSlot(slotKey)}
                        onPress={() => handleSlotTap(bk, si)}
                        style={[
                          styles.slot,
                          { borderColor: color + '70' },
                          card ? styles.slotFilled : null,
                          !card && selectedCard ? styles.slotReady : null,
                        ]}
                        activeOpacity={0.7}
                      >
                        {card ? (
                          <View pointerEvents="none">
                            <PlayingCard card={card} size="xs" assigned />
                          </View>
                        ) : (
                          <Text style={[styles.slotEmpty, { color: selectedCard ? color : undefined }]}>
                            {selectedCard ? '↓' : '?'}
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Live hand preview */}
                <View style={styles.previewBox}>
                  {preview ? (
                    <Text style={[styles.previewTxt, { color }]} numberOfLines={2}>
                      {preview.description}
                    </Text>
                  ) : (
                    <Text style={styles.previewEmpty} numberOfLines={1}>
                      {slots.filter(Boolean).length === 0 ? '—'
                        : slots.filter(Boolean).length === 1 ? '+1'
                        : '—'}
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {/* Hole cards */}
        <View style={styles.holeSection}>
          <Text style={styles.holeSectionLabel}>
            YOUR 6 CARDS — tap to select · drag to board
          </Text>
          <View style={styles.holeRow}>
            {holeCards.map(card => {
              const isSel = selectedCard === card;
              const isAsgn = assignedCards.includes(card);
              const isDim = !!selectedCard && !isSel && !isAsgn;
              return (
                <View
                  key={card}
                  style={[styles.holeCardWrap, isSel && styles.holeCardSel]}
                  {...(cardPanResponders[card]?.panHandlers ?? {})}
                >
                  <PlayingCard
                    card={card} size="md"
                    selected={isSel}
                    assigned={isAsgn}
                    dimmed={isDim}
                  />
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* Submit bar */}
      <View style={styles.submitBar}>
        {selectedCard && (
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={() => setSelectedCard(null)}
          >
            <Text style={styles.clearBtnTxt}>Deselect</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[
            styles.submitBtn,
            (!done || alreadySubmitted || submitting) && styles.submitBtnOff,
          ]}
          onPress={() => {
            if (!done || alreadySubmitted || submitting) return;
            const filtered: Assignment = {
              board_1: assignment.board_1.filter(Boolean),
              board_2: assignment.board_2.filter(Boolean),
              board_3: assignment.board_3.filter(Boolean),
            };
            onSubmit(filtered);
          }}
          disabled={!done || alreadySubmitted || submitting}
          activeOpacity={0.8}
        >
          <Text style={[styles.submitBtnTxt,
            (!done || alreadySubmitted) && styles.submitBtnTxtOff]}>
            {alreadySubmitted ? '✓ Submitted — Waiting...'
              : submitting ? 'Submitting...'
              : done ? '🃏 Submit Assignment'
              : `${6 - assignedCards.length} cards left to assign`}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Ghost card during drag */}
      {dragging && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ghost,
            { transform: [{ translateX: dragX }, { translateY: dragY }] },
          ]}
        >
          <PlayingCard card={dragging} size="md" selected />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#060b14' },

  timerHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#0a0f1a',
    borderBottomWidth: 1, borderBottomColor: '#1e293b',
  },
  assignTitle: { fontSize: 14, fontWeight: '900', color: '#ffffff', letterSpacing: 1 },
  assignSub: { fontSize: 10, color: '#475569', marginTop: 2 },
  timerBadge: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 12, borderWidth: 2, backgroundColor: '#0a0f1a',
  },
  timerTxt: { fontSize: 18, fontWeight: '900', letterSpacing: 2 },

  readyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#1e293b',
    backgroundColor: '#0a0f1a',
  },
  readyChip: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#131a2a', borderWidth: 1, borderColor: '#1e293b',
    alignItems: 'center', justifyContent: 'center',
  },
  readyChipDone: { borderColor: '#22c55e', backgroundColor: '#22c55e20' },
  readyAvatar: { fontSize: 15 },
  readyCheck: {
    position: 'absolute', top: -3, right: -3,
    fontSize: 9, color: '#22c55e', fontWeight: '900',
  },
  readyTxt: { fontSize: 11, color: '#475569', marginLeft: 4 },

  scroll: { flex: 1 },

  // 3 boards stacked vertically — each is a full-width row
  boardsColumn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  boardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0d1420',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 8,
  },
  boardLabelBox: {
    width: 30, height: 30, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  boardLabelTxt: { fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  communityRow: { flexDirection: 'row', gap: 3 },
  rowDivider: { width: 1, height: 34, backgroundColor: '#1e293b' },
  slotsRow: { flexDirection: 'row', gap: 5 },
  slot: {
    width: 32, height: 44, borderRadius: 6,
    borderWidth: 2, borderStyle: 'dashed',
    backgroundColor: '#0a0f1a',
    alignItems: 'center', justifyContent: 'center',
  },
  slotFilled: { borderStyle: 'solid', backgroundColor: '#0f1e30' },
  slotReady: { borderStyle: 'solid', backgroundColor: '#00f0ff12', borderColor: '#00f0ff80' },
  slotEmpty: { fontSize: 16, color: '#334155', fontWeight: '700' },

  previewBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  previewTxt: { fontSize: 9, fontWeight: '800', textAlign: 'center' },
  previewEmpty: { fontSize: 9, color: '#334155', textAlign: 'center' },

  holeSection: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  holeSectionLabel: {
    fontSize: 9, color: '#475569', fontWeight: '900',
    letterSpacing: 1, marginBottom: 12, textTransform: 'uppercase',
  },
  holeRow: {
    flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 10,
  },
  holeCardWrap: { borderRadius: 8 },
  holeCardSel: {
    shadowColor: '#00f0ff', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9, shadowRadius: 10, elevation: 14,
  },

  submitBar: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: '#1e293b',
    backgroundColor: '#0a0f1a',
  },
  clearBtn: {
    paddingHorizontal: 14, paddingVertical: 14, borderRadius: 12,
    backgroundColor: '#131a2a', borderWidth: 1, borderColor: '#334155',
    alignItems: 'center', justifyContent: 'center',
  },
  clearBtnTxt: { fontSize: 12, color: '#94a3b8', fontWeight: '700' },
  submitBtn: {
    flex: 1, paddingVertical: 16, borderRadius: 14,
    backgroundColor: '#ffb800', alignItems: 'center', justifyContent: 'center',
  },
  submitBtnOff: {
    backgroundColor: '#131a2a', borderWidth: 1, borderColor: '#1e293b',
  },
  submitBtnTxt: { fontSize: 14, fontWeight: '900', color: '#0a0f1a' },
  submitBtnTxtOff: { color: '#475569' },

  ghost: {
    position: 'absolute', left: 0, top: 0, zIndex: 9999,
    shadowColor: '#00f0ff', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9, shadowRadius: 14, elevation: 24,
  },
});
