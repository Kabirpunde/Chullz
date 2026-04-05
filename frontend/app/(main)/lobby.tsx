import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Dimensions, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';

const { width } = Dimensions.get('window');

interface Player {
  id: string;
  username: string;
  avatar: string;
  avatar_color: string;
  role: string;
  chips: number;
  online: boolean;
}

export default function Lobby() {
  const { user, token, backendUrl } = useAuth();
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [onlineIds, setOnlineIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const fetchPlayers = useCallback(async () => {
    try {
      const res = await fetch(`${backendUrl}/api/players`);
      if (res.ok) {
        const data = await res.json();
        setPlayers(data);
      }
    } catch (e) {
      console.log('Fetch players error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [backendUrl]);

  // WebSocket for real-time presence
  useEffect(() => {
    if (!user?.id) return;
    const wsUrl = backendUrl.replace(/^https/, 'wss').replace(/^http/, 'ws') + `/api/ws/${user.id}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => console.log('WS connected');
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'presence') {
          setOnlineIds(data.online_users);
        }
      } catch {}
    };
    ws.onerror = () => console.log('WS error - falling back to polling');
    ws.onclose = () => console.log('WS closed');

    wsRef.current = ws;
    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [user?.id, backendUrl]);

  // Fetch + poll every 5s while focused
  useFocusEffect(
    useCallback(() => {
      fetchPlayers();
      const interval = setInterval(fetchPlayers, 5000);
      return () => clearInterval(interval);
    }, [fetchPlayers])
  );

  const enriched = players.map(p => ({ ...p, online: onlineIds.includes(p.id) || p.online }));
  const onlinePlayers = enriched.filter(p => p.role === 'player' && p.online);
  const allPlayers = enriched.filter(p => p.role === 'player');

  if (!user) return null;

  return (
    <SafeAreaView style={styles.container} testID="lobby-screen">
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>♠ POKER CLUB</Text>
          <Text style={styles.headerSub}>Multiplayer Lobby</Text>
        </View>
        <TouchableOpacity
          testID="header-user-btn"
          style={styles.headerUser}
          onPress={() => router.push('/(main)/profile' as any)}
        >
          <View style={[styles.headerAvatar, { backgroundColor: user.avatar_color + '30', borderColor: user.avatar_color }]}>
            <Text style={styles.headerAvatarText}>{user.avatar}</Text>
          </View>
          <View>
            <Text style={styles.headerUsername}>{user.username}</Text>
            <Text style={styles.headerChips}>🪙 {user.chips.toLocaleString()}</Text>
          </View>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerLoader}>
          <ActivityIndicator color="#00f0ff" size="large" />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchPlayers(); }}
              tintColor="#00f0ff"
            />
          }
        >
          {/* Online Players */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Online Players</Text>
              <View style={styles.onlineBadge}>
                <View style={styles.onlineDot} />
                <Text style={styles.onlineBadgeText}>{onlinePlayers.length} online</Text>
              </View>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.playerScroll}>
              {allPlayers.map(p => {
                const isOnline = onlineIds.includes(p.id) || p.online;
                return (
                  <View key={p.id} testID={`player-chip-${p.username}`} style={styles.playerChip}>
                    <View style={[styles.playerChipAvatar, { backgroundColor: p.avatar_color + '25', borderColor: p.avatar_color }]}>
                      <Text style={styles.playerChipEmoji}>{p.avatar}</Text>
                      <View style={[styles.playerStatusDot, { backgroundColor: isOnline ? '#22c55e' : '#475569' }]} />
                    </View>
                    <Text style={styles.playerChipName} numberOfLines={1}>{p.username}</Text>
                    <Text style={styles.playerChipChips}>🪙 {(p.chips / 1000).toFixed(1)}k</Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>

          {/* All Players Table */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>All Players</Text>
            {allPlayers.map((p, i) => {
              const isOnline = onlineIds.includes(p.id) || p.online;
              return (
                <View key={p.id} testID={`player-row-${p.username}`} style={styles.playerRow}>
                  <View style={[styles.rowAvatar, { backgroundColor: p.avatar_color + '25', borderColor: p.avatar_color }]}>
                    <Text style={styles.rowAvatarText}>{p.avatar}</Text>
                  </View>
                  <View style={styles.rowInfo}>
                    <Text style={styles.rowName}>{p.username}</Text>
                    <Text style={styles.rowChips}>🪙 {p.chips.toLocaleString()}</Text>
                  </View>
                  <View style={[styles.rowStatus, { backgroundColor: isOnline ? '#22c55e20' : '#47556920' }]}>
                    <View style={[styles.rowStatusDot, { backgroundColor: isOnline ? '#22c55e' : '#475569' }]} />
                    <Text style={[styles.rowStatusText, { color: isOnline ? '#22c55e' : '#475569' }]}>
                      {isOnline ? 'Online' : 'Offline'}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>

          {/* Tables Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tables</Text>
            <View style={styles.emptyTable} testID="no-tables-placeholder">
              <Text style={styles.emptyTableIcon}>🃏</Text>
              <Text style={styles.emptyTableText}>No active tables</Text>
              <Text style={styles.emptyTableSub}>Create one to start playing</Text>
            </View>
          </View>
        </ScrollView>
      )}

      {/* Create Table CTA */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          testID="create-table-btn"
          style={styles.createBtn}
          onPress={() => router.push('/poker-table' as any)}
          activeOpacity={0.8}
        >
          <Ionicons name="add-circle-outline" size={20} color="#0a0f1a" />
          <Text style={styles.createBtnText}>Create Table</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="join-table-btn"
          style={styles.joinBtn}
          onPress={() => router.push('/poker-table' as any)}
          activeOpacity={0.8}
        >
          <Text style={styles.joinBtnText}>Join Table</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0f1a' },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#1e293b',
  },
  headerLeft: {},
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#00f0ff', letterSpacing: 2 },
  headerSub: { fontSize: 11, color: '#475569', letterSpacing: 1 },
  headerUser: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAvatar: {
    width: 40, height: 40, borderRadius: 20, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  headerAvatarText: { fontSize: 20 },
  headerUsername: { fontSize: 13, fontWeight: '700', color: '#ffffff' },
  headerChips: { fontSize: 11, color: '#ffb800', fontWeight: '600' },

  centerLoader: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  scrollContent: { paddingBottom: 24 },

  section: { marginTop: 20, paddingHorizontal: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#ffffff', letterSpacing: 0.5, marginBottom: 12 },

  onlineBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#22c55e20', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22c55e' },
  onlineBadgeText: { fontSize: 11, color: '#22c55e', fontWeight: '700' },

  playerScroll: { marginBottom: 4 },
  playerChip: { alignItems: 'center', marginRight: 16, width: 68 },
  playerChipAvatar: {
    width: 56, height: 56, borderRadius: 28, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', marginBottom: 6, position: 'relative',
  },
  playerChipEmoji: { fontSize: 28 },
  playerStatusDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#0a0f1a',
  },
  playerChipName: { fontSize: 10, color: '#94a3b8', textAlign: 'center', fontWeight: '600', width: 68 },
  playerChipChips: { fontSize: 10, color: '#ffb800', fontWeight: '700' },

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
  rowAvatarText: { fontSize: 22 },
  rowInfo: { flex: 1 },
  rowName: { fontSize: 14, fontWeight: '700', color: '#ffffff' },
  rowChips: { fontSize: 12, color: '#ffb800', marginTop: 2 },
  rowStatus: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  rowStatusDot: { width: 6, height: 6, borderRadius: 3 },
  rowStatusText: { fontSize: 11, fontWeight: '700' },

  emptyTable: {
    backgroundColor: '#131a2a', borderRadius: 16,
    borderWidth: 1, borderColor: '#1e293b',
    borderStyle: 'dashed', padding: 36,
    alignItems: 'center',
  },
  emptyTableIcon: { fontSize: 36, marginBottom: 8 },
  emptyTableText: { fontSize: 16, fontWeight: '700', color: '#ffffff', marginBottom: 4 },
  emptyTableSub: { fontSize: 12, color: '#475569' },

  bottomBar: {
    flexDirection: 'row', gap: 10, padding: 16,
    borderTopWidth: 1, borderTopColor: '#1e293b',
    backgroundColor: '#0a0f1a',
  },
  createBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#00f0ff', borderRadius: 14, paddingVertical: 14, gap: 8,
  },
  createBtnText: { fontSize: 15, fontWeight: '800', color: '#0a0f1a' },
  joinBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#131a2a', borderRadius: 14, paddingVertical: 14,
    borderWidth: 1, borderColor: '#1e293b',
  },
  joinBtnText: { fontSize: 15, fontWeight: '800', color: '#ffffff' },
});
