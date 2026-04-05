import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';

interface Player {
  id: string;
  username: string;
  avatar: string;
  avatar_color: string;
  chips: number;
  online: boolean;
  role: string;
}

export default function Admin() {
  const { user, token, backendUrl, logout } = useAuth();
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [chipAmounts, setChipAmounts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [success, setSuccess] = useState<Record<string, boolean>>({});

  const fetchPlayers = useCallback(async () => {
    try {
      const res = await fetch(`${backendUrl}/api/players`);
      if (res.ok) {
        const data = await res.json();
        setPlayers(data.filter((p: Player) => p.role === 'player'));
      }
    } catch (e) {
      console.log('Fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    if (user?.role !== 'admin') {
      router.replace('/(auth)/select-profile' as any);
      return;
    }
    fetchPlayers();
  }, []);

  const handleDistribute = async (username: string) => {
    const amountStr = chipAmounts[username] || '';
    const amount = parseInt(amountStr);
    if (isNaN(amount) || amount === 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid chip amount.');
      return;
    }

    setSending(prev => ({ ...prev, [username]: true }));
    try {
      const res = await fetch(`${backendUrl}/api/admin/distribute-chips`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ target_username: username, amount }),
      });
      if (res.ok) {
        const data = await res.json();
        setPlayers(prev =>
          prev.map(p => p.username === username ? { ...p, chips: data.new_chips } : p)
        );
        setChipAmounts(prev => ({ ...prev, [username]: '' }));
        setSuccess(prev => ({ ...prev, [username]: true }));
        setTimeout(() => setSuccess(prev => ({ ...prev, [username]: false })), 2000);
      } else {
        const err = await res.json();
        Alert.alert('Error', err.detail || 'Failed to distribute chips');
      }
    } catch {
      Alert.alert('Error', 'Network error. Please try again.');
    } finally {
      setSending(prev => ({ ...prev, [username]: false }));
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace('/(auth)/select-profile' as any);
  };

  const totalChips = players.reduce((sum, p) => sum + p.chips, 0);

  if (!user) return null;

  return (
    <SafeAreaView style={styles.container} testID="admin-screen">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={[styles.headerAvatar, { backgroundColor: user.avatar_color + '30', borderColor: user.avatar_color }]}>
              <Text style={styles.headerAvatarText}>{user.avatar}</Text>
            </View>
            <View>
              <Text style={styles.headerTitle}>ADMIN PANEL</Text>
              <Text style={styles.headerSub}>{user.username}</Text>
            </View>
          </View>
          <TouchableOpacity
            testID="admin-logout-btn"
            style={styles.logoutBtn}
            onPress={handleLogout}
          >
            <Ionicons name="log-out-outline" size={20} color="#ef4444" />
          </TouchableOpacity>
        </View>

        {/* Stats Bar */}
        <View style={styles.statsBar}>
          <View style={styles.statItem} testID="total-chips-stat">
            <Text style={styles.statValue}>{totalChips.toLocaleString()}</Text>
            <Text style={styles.statLabel}>Total Player Chips</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem} testID="total-players-stat">
            <Text style={styles.statValue}>{players.length}</Text>
            <Text style={styles.statLabel}>Total Players</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem} testID="online-players-stat">
            <Text style={[styles.statValue, { color: '#22c55e' }]}>
              {players.filter(p => p.online).length}
            </Text>
            <Text style={styles.statLabel}>Online</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.loaderContainer}>
            <ActivityIndicator color="#00f0ff" size="large" />
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.sectionTitle}>DISTRIBUTE CHIPS</Text>

            {players.map(player => (
              <View key={player.username} style={styles.playerCard} testID={`player-admin-card-${player.username}`}>
                {/* Player Info */}
                <View style={styles.playerInfo}>
                  <View style={[styles.avatar, { backgroundColor: player.avatar_color + '25', borderColor: player.avatar_color }]}>
                    <Text style={styles.avatarText}>{player.avatar}</Text>
                    <View style={[styles.onlineDot, { backgroundColor: player.online ? '#22c55e' : '#475569' }]} />
                  </View>
                  <View style={styles.playerDetails}>
                    <Text style={styles.playerName}>{player.username}</Text>
                    <Text style={styles.playerChips} testID={`player-chips-${player.username}`}>
                      🪙 {player.chips.toLocaleString()}
                    </Text>
                  </View>
                </View>

                {/* Send Chips Row */}
                <View style={styles.sendRow}>
                  <TextInput
                    testID={`chip-input-${player.username}`}
                    style={styles.chipInput}
                    value={chipAmounts[player.username] || ''}
                    onChangeText={val => setChipAmounts(prev => ({ ...prev, [player.username]: val }))}
                    placeholder="Amount..."
                    placeholderTextColor="#475569"
                    keyboardType="numeric"
                    returnKeyType="send"
                    onSubmitEditing={() => handleDistribute(player.username)}
                  />
                  <TouchableOpacity
                    testID={`send-chips-btn-${player.username}`}
                    style={[
                      styles.sendBtn,
                      success[player.username] && styles.sendBtnSuccess,
                    ]}
                    onPress={() => handleDistribute(player.username)}
                    disabled={sending[player.username]}
                    activeOpacity={0.8}
                  >
                    {sending[player.username] ? (
                      <ActivityIndicator color="#0a0f1a" size="small" />
                    ) : success[player.username] ? (
                      <Ionicons name="checkmark" size={18} color="#0a0f1a" />
                    ) : (
                      <Text style={styles.sendBtnText}>Send 🪙</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            <Text style={styles.hintText}>
              Tip: Enter a negative number to remove chips (e.g. -500)
            </Text>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
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
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerAvatar: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  headerAvatarText: { fontSize: 22 },
  headerTitle: { fontSize: 16, fontWeight: '900', color: '#a78bfa', letterSpacing: 2 },
  headerSub: { fontSize: 11, color: '#64748b' },
  logoutBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#ef444420', alignItems: 'center', justifyContent: 'center',
  },

  statsBar: {
    flexDirection: 'row', backgroundColor: '#131a2a',
    paddingVertical: 16, paddingHorizontal: 8,
    borderBottomWidth: 1, borderBottomColor: '#1e293b',
  },
  statItem: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, backgroundColor: '#1e293b' },
  statValue: { fontSize: 20, fontWeight: '900', color: '#ffb800', marginBottom: 2 },
  statLabel: { fontSize: 10, color: '#64748b', textAlign: 'center' },

  loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  scrollContent: { padding: 16, paddingBottom: 40 },
  sectionTitle: {
    fontSize: 11, fontWeight: '900', color: '#64748b',
    letterSpacing: 2, marginBottom: 14,
  },

  playerCard: {
    backgroundColor: '#131a2a', borderRadius: 18,
    borderWidth: 1, borderColor: '#1e293b',
    padding: 14, marginBottom: 10,
  },
  playerInfo: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  avatar: {
    width: 48, height: 48, borderRadius: 24, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12, position: 'relative',
  },
  avatarText: { fontSize: 24 },
  onlineDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#0a0f1a',
  },
  playerDetails: { flex: 1 },
  playerName: { fontSize: 15, fontWeight: '800', color: '#ffffff' },
  playerChips: { fontSize: 13, color: '#ffb800', fontWeight: '600', marginTop: 2 },

  sendRow: { flexDirection: 'row', gap: 10 },
  chipInput: {
    flex: 1, backgroundColor: '#0a0f1a', borderRadius: 12,
    borderWidth: 1, borderColor: '#1e293b',
    paddingHorizontal: 14, paddingVertical: 12,
    color: '#ffffff', fontSize: 15, fontWeight: '600',
  },
  sendBtn: {
    backgroundColor: '#00f0ff', borderRadius: 12,
    paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center',
    minWidth: 90,
  },
  sendBtnSuccess: { backgroundColor: '#22c55e' },
  sendBtnText: { fontSize: 13, fontWeight: '800', color: '#0a0f1a' },

  hintText: { fontSize: 11, color: '#334155', textAlign: 'center', marginTop: 16 },
});
