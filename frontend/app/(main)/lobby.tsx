import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal,
  TextInput, ActivityIndicator, Dimensions, KeyboardAvoidingView,
  Platform, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';

const { width } = Dimensions.get('window');

interface Player {
  id: string; username: string; avatar: string;
  avatar_color: string; role: string; chips: number; online: boolean;
}
interface TableInfo {
  table_id: string; name: string; status: string;
  blind_small: number; blind_big: number;
  max_players: number; starting_chips: number;
  player_count: number;
  players: { username: string; avatar: string; avatar_color: string }[];
}

export default function Lobby() {
  const { user, token, backendUrl } = useAuth();
  const router = useRouter();

  const [players, setPlayers] = useState<Player[]>([]);
  const [onlineIds, setOnlineIds] = useState<string[]>([]);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Create table modal
  const [createModal, setCreateModal] = useState(false);
  const [tableName, setTableName] = useState('');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [pr, tr] = await Promise.all([
        fetch(`${backendUrl}/api/players`),
        fetch(`${backendUrl}/api/tables`),
      ]);
      if (pr.ok) setPlayers(await pr.json());
      if (tr.ok) setTables(await tr.json());
    } catch (e) {
      console.log('Fetch error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [backendUrl]);

  // Presence WebSocket
  useFocusEffect(
    useCallback(() => {
      if (!user?.id) return;
      const wsUrl = backendUrl
        .replace(/^https/, 'wss').replace(/^http/, 'ws')
        + `/api/ws/${user.id}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onmessage = e => {
        try {
          const d = JSON.parse(e.data);
          if (d.type === 'presence') setOnlineIds(d.online_users);
        } catch {}
      };
      ws.onerror = () => {};

      fetchAll();
      const interval = setInterval(fetchAll, 5000);
      return () => {
        ws.close();
        wsRef.current = null;
        clearInterval(interval);
      };
    }, [user?.id, backendUrl, fetchAll])
  );

  const createTable = async () => {
    if (!tableName.trim() || !token) return;
    setCreating(true);
    try {
      const createRes = await fetch(`${backendUrl}/api/tables/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: tableName.trim(),
          blind_small: 25, blind_big: 50,
          starting_chips: 5000, max_players: 6,
        }),
      });
      if (!createRes.ok) throw new Error('Create failed');
      const { table_id } = await createRes.json();

      const joinRes = await fetch(`${backendUrl}/api/tables/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ table_id }),
      });
      if (!joinRes.ok) throw new Error('Join failed');

      setCreateModal(false);
      setTableName('');
      router.push({
        pathname: '/poker-table',
        params: { tableId: table_id, isHost: 'true' },
      } as any);
    } catch (e) {
      console.error('Create table error:', e);
    } finally {
      setCreating(false);
    }
  };

  const joinTable = async (tableId: string) => {
    if (!token || joining) return;
    setJoining(tableId);
    try {
      const res = await fetch(`${backendUrl}/api/tables/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ table_id: tableId }),
      });
      if (!res.ok) throw new Error('Join failed');
      router.push({
        pathname: '/poker-table',
        params: { tableId, isHost: 'false' },
      } as any);
    } catch (e) {
      console.error('Join table error:', e);
    } finally {
      setJoining(null);
    }
  };

  const enriched = players.map(p => ({ ...p, online: onlineIds.includes(p.id) || p.online }));
  const allPlayers = enriched.filter(p => p.role === 'player');
  const onlinePlayers = allPlayers.filter(p => p.online);

  if (!user) return null;

  return (
    <SafeAreaView style={styles.container} testID="lobby-screen">
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>♠ CHULLZ</Text>
          <Text style={styles.headerSub}>Multiplayer Lobby</Text>
        </View>
        <TouchableOpacity
          style={styles.headerUser}
          onPress={() => router.push('/(main)/profile' as any)}
        >
          <View style={[styles.headerAvatar, {
            backgroundColor: user.avatar_color + '30', borderColor: user.avatar_color,
          }]}>
            <Text style={styles.headerAvatarTxt}>{user.avatar}</Text>
          </View>
          <View>
            <Text style={styles.headerUsername}>{user.username}</Text>
            <Text style={styles.headerChips}>🪙 {user.chips.toLocaleString()}</Text>
          </View>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerLoad}>
          <ActivityIndicator color="#00f0ff" size="large" />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchAll(); }}
              tintColor="#00f0ff"
            />
          }
        >
          {/* Online players */}
          <View style={styles.section}>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Online Players</Text>
              <View style={styles.onlineBadge}>
                <View style={styles.onlineDot} />
                <Text style={styles.onlineBadgeTxt}>{onlinePlayers.length} online</Text>
              </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {allPlayers.map(p => (
                <View key={p.id} style={styles.playerChip}>
                  <View style={[styles.playerChipAvatar, {
                    backgroundColor: p.avatar_color + '25', borderColor: p.avatar_color,
                  }]}>
                    <Text style={styles.playerChipEmoji}>{p.avatar}</Text>
                    <View style={[styles.statusDot, {
                      backgroundColor: p.online ? '#22c55e' : '#475569',
                    }]} />
                  </View>
                  <Text style={styles.playerChipName} numberOfLines={1}>{p.username}</Text>
                  <Text style={styles.playerChipChips}>🪙 {(p.chips / 1000).toFixed(1)}k</Text>
                </View>
              ))}
            </ScrollView>
          </View>

          {/* Active Tables */}
          <View style={styles.section}>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Tables</Text>
              <View style={[styles.onlineBadge, { backgroundColor: '#3b82f620' }]}>
                <Text style={[styles.onlineBadgeTxt, { color: '#3b82f6' }]}>
                  {tables.length} active
                </Text>
              </View>
            </View>

            {tables.length === 0 ? (
              <View style={styles.emptyTable} testID="no-tables-placeholder">
                <Text style={styles.emptyIcon}>🃏</Text>
                <Text style={styles.emptyTitle}>No active tables</Text>
                <Text style={styles.emptySub}>Create one to start playing</Text>
              </View>
            ) : (
              tables.map(t => {
                const isFull = t.player_count >= t.max_players;
                const isPlaying = t.status === 'playing';
                const canJoin = !isFull && !isPlaying;
                return (
                  <View key={t.table_id} style={styles.tableCard}>
                    <View style={styles.tableInfo}>
                      <View style={styles.tableNameRow}>
                        <Text style={styles.tableCardName} numberOfLines={1}>{t.name}</Text>
                        <View style={[
                          styles.tableStatusBadge,
                          { backgroundColor: isPlaying ? '#ef444420' : '#22c55e20',
                            borderColor: isPlaying ? '#ef4444' : '#22c55e' },
                        ]}>
                          <Text style={[
                            styles.tableStatusTxt,
                            { color: isPlaying ? '#ef4444' : '#22c55e' },
                          ]}>
                            {isPlaying ? 'Playing' : 'Waiting'}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.tableMeta}>
                        <Text style={styles.tableMetaTxt}>
                          Blinds {t.blind_small}/{t.blind_big}
                        </Text>
                        <Text style={styles.tableDot}>·</Text>
                        <Text style={styles.tableMetaTxt}>
                          {t.player_count}/{t.max_players} players
                        </Text>
                        <Text style={styles.tableDot}>·</Text>
                        <Text style={styles.tableMetaTxt}>
                          🪙 {t.starting_chips.toLocaleString()} start
                        </Text>
                      </View>
                      <View style={styles.tableAvatars}>
                        {t.players.slice(0, 4).map((p, i) => (
                          <Text key={i} style={styles.tableAvatar}>{p.avatar}</Text>
                        ))}
                        {t.player_count > 4 && (
                          <Text style={styles.tableAvatarExtra}>+{t.player_count - 4}</Text>
                        )}
                      </View>
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.joinBtn,
                        !canJoin && styles.joinBtnOff,
                      ]}
                      onPress={() => canJoin && joinTable(t.table_id)}
                      disabled={!canJoin || joining === t.table_id}
                      activeOpacity={0.8}
                    >
                      {joining === t.table_id ? (
                        <ActivityIndicator color="#0a0f1a" size="small" />
                      ) : (
                        <Text style={[
                          styles.joinBtnTxt,
                          !canJoin && styles.joinBtnTxtOff,
                        ]}>
                          {isFull ? 'Full' : isPlaying ? 'In Game' : 'Join'}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </View>

          {/* All players list */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>All Players</Text>
            {allPlayers.map(p => (
              <View key={p.id} style={styles.playerRow}>
                <View style={[styles.rowAvatar, {
                  backgroundColor: p.avatar_color + '25', borderColor: p.avatar_color,
                }]}>
                  <Text style={styles.rowAvatarTxt}>{p.avatar}</Text>
                </View>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowName}>{p.username}</Text>
                  <Text style={styles.rowChips}>🪙 {p.chips.toLocaleString()}</Text>
                </View>
                <View style={[styles.rowStatus,
                  { backgroundColor: p.online ? '#22c55e20' : '#47556920' }]}>
                  <View style={[styles.rowDot, { backgroundColor: p.online ? '#22c55e' : '#475569' }]} />
                  <Text style={[styles.rowStatusTxt, { color: p.online ? '#22c55e' : '#475569' }]}>
                    {p.online ? 'Online' : 'Offline'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {/* Bottom bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          testID="create-table-btn"
          style={styles.createBtn}
          onPress={() => setCreateModal(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="add-circle-outline" size={20} color="#0a0f1a" />
          <Text style={styles.createBtnTxt}>Create Table</Text>
        </TouchableOpacity>
      </View>

      {/* Create table modal */}
      <Modal
        visible={createModal}
        transparent
        animationType="slide"
        onRequestClose={() => setCreateModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🃏 Create Table</Text>
              <TouchableOpacity
                onPress={() => { setCreateModal(false); setTableName(''); }}
                style={styles.modalClose}
              >
                <Text style={styles.modalCloseTxt}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>Table Name</Text>
              <TextInput
                style={styles.textInput}
                value={tableName}
                onChangeText={setTableName}
                placeholder="e.g. Friday Night Chullz"
                placeholderTextColor="#334155"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={createTable}
                maxLength={40}
              />

              <View style={styles.presetRow}>
                <View style={styles.presetChip}>
                  <Text style={styles.presetLbl}>Blinds</Text>
                  <Text style={styles.presetVal}>25 / 50</Text>
                </View>
                <View style={styles.presetChip}>
                  <Text style={styles.presetLbl}>Starting</Text>
                  <Text style={styles.presetVal}>🪙 5,000</Text>
                </View>
                <View style={styles.presetChip}>
                  <Text style={styles.presetLbl}>Max Players</Text>
                  <Text style={styles.presetVal}>6</Text>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.createConfirmBtn, (!tableName.trim() || creating) && styles.createConfirmBtnOff]}
                onPress={createTable}
                disabled={!tableName.trim() || creating}
                activeOpacity={0.85}
              >
                {creating ? (
                  <ActivityIndicator color="#0a0f1a" />
                ) : (
                  <Text style={styles.createConfirmTxt}>Create & Join Table</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0f1a' },
  centerLoad: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#1e293b',
  },
  headerTitle: { fontSize: 22, fontWeight: '900', color: '#00f0ff', letterSpacing: 2 },
  headerSub: { fontSize: 11, color: '#475569', letterSpacing: 1 },
  headerUser: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAvatar: {
    width: 42, height: 42, borderRadius: 21, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  headerAvatarTxt: { fontSize: 20 },
  headerUsername: { fontSize: 13, fontWeight: '700', color: '#ffffff' },
  headerChips: { fontSize: 11, color: '#ffb800', fontWeight: '600' },

  scrollContent: { paddingBottom: 24 },
  section: { marginTop: 20, paddingHorizontal: 16 },
  sectionRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 12,
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#ffffff', letterSpacing: 0.5 },

  onlineBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#22c55e20', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4,
  },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22c55e' },
  onlineBadgeTxt: { fontSize: 11, color: '#22c55e', fontWeight: '700' },

  playerChip: { alignItems: 'center', marginRight: 16, width: 68 },
  playerChipAvatar: {
    width: 56, height: 56, borderRadius: 28, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6, position: 'relative',
  },
  playerChipEmoji: { fontSize: 28 },
  statusDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#0a0f1a',
  },
  playerChipName: { fontSize: 10, color: '#94a3b8', textAlign: 'center', fontWeight: '600', width: 68 },
  playerChipChips: { fontSize: 10, color: '#ffb800', fontWeight: '700' },

  // Tables
  emptyTable: {
    backgroundColor: '#131a2a', borderRadius: 16, borderWidth: 1,
    borderColor: '#1e293b', borderStyle: 'dashed',
    padding: 36, alignItems: 'center',
  },
  emptyIcon: { fontSize: 36, marginBottom: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#ffffff', marginBottom: 4 },
  emptySub: { fontSize: 12, color: '#475569' },

  tableCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#131a2a', borderRadius: 16,
    borderWidth: 1, borderColor: '#1e293b',
    padding: 14, marginBottom: 10, gap: 12,
  },
  tableInfo: { flex: 1, gap: 4 },
  tableNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tableCardName: { fontSize: 15, fontWeight: '800', color: '#ffffff', flex: 1 },
  tableStatusBadge: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 8, borderWidth: 1,
  },
  tableStatusTxt: { fontSize: 10, fontWeight: '700' },
  tableMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  tableMetaTxt: { fontSize: 11, color: '#64748b' },
  tableDot: { fontSize: 11, color: '#334155' },
  tableAvatars: { flexDirection: 'row', gap: 2, marginTop: 2 },
  tableAvatar: { fontSize: 14 },
  tableAvatarExtra: { fontSize: 11, color: '#475569', alignSelf: 'center' },

  joinBtn: {
    backgroundColor: '#00f0ff', borderRadius: 12,
    paddingHorizontal: 18, paddingVertical: 10,
    alignItems: 'center', justifyContent: 'center', minWidth: 60,
  },
  joinBtnOff: { backgroundColor: '#1e293b' },
  joinBtnTxt: { fontSize: 13, fontWeight: '900', color: '#0a0f1a' },
  joinBtnTxtOff: { color: '#475569' },

  // Player list
  playerRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#131a2a', borderRadius: 14,
    padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: '#1e293b',
  },
  rowAvatar: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  rowAvatarTxt: { fontSize: 22 },
  rowInfo: { flex: 1 },
  rowName: { fontSize: 14, fontWeight: '700', color: '#ffffff' },
  rowChips: { fontSize: 12, color: '#ffb800', marginTop: 2 },
  rowStatus: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5,
  },
  rowDot: { width: 6, height: 6, borderRadius: 3 },
  rowStatusTxt: { fontSize: 11, fontWeight: '700' },

  bottomBar: {
    padding: 16, borderTopWidth: 1, borderTopColor: '#1e293b',
    backgroundColor: '#0a0f1a',
  },
  createBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#00f0ff', borderRadius: 14, paddingVertical: 15, gap: 8,
  },
  createBtnTxt: { fontSize: 15, fontWeight: '900', color: '#0a0f1a' },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#0a0f1a',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, borderColor: '#1e293b',
    paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 18,
    borderBottomWidth: 1, borderBottomColor: '#1e293b',
  },
  modalTitle: { fontSize: 18, fontWeight: '900', color: '#ffffff' },
  modalClose: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  modalCloseTxt: { color: '#64748b', fontSize: 18, fontWeight: '700' },
  modalBody: { padding: 20, gap: 16 },
  inputLabel: { fontSize: 11, color: '#64748b', fontWeight: '700', letterSpacing: 1 },
  textInput: {
    backgroundColor: '#131a2a', borderRadius: 12,
    borderWidth: 1, borderColor: '#1e293b',
    paddingHorizontal: 16, paddingVertical: 14,
    color: '#ffffff', fontSize: 16, fontWeight: '600',
  },
  presetRow: { flexDirection: 'row', gap: 8 },
  presetChip: {
    flex: 1, backgroundColor: '#131a2a', borderRadius: 12,
    borderWidth: 1, borderColor: '#1e293b',
    padding: 10, alignItems: 'center', gap: 4,
  },
  presetLbl: { fontSize: 9, color: '#475569', fontWeight: '700', letterSpacing: 1 },
  presetVal: { fontSize: 13, color: '#ffffff', fontWeight: '800' },
  createConfirmBtn: {
    backgroundColor: '#00f0ff', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
  },
  createConfirmBtnOff: { backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155' },
  createConfirmTxt: { fontSize: 15, fontWeight: '900', color: '#0a0f1a' },
});
