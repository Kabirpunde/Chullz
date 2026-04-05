import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';

export default function Profile() {
  const { user, token, backendUrl, logout, updateUser } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) refreshUser();
  }, []);

  const refreshUser = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        updateUser(data);
      }
    } catch {}
  };

  const handleLogout = async () => {
    setLoading(true);
    await logout();
    router.replace('/(auth)/select-profile' as any);
  };

  if (!user) return null;

  const statItems = [
    { label: 'Games Played', value: '—', icon: '🎮' },
    { label: 'Wins', value: '—', icon: '🏆' },
    { label: 'Win Rate', value: '—', icon: '📊' },
    { label: 'Best Hand', value: '—', icon: '🃏' },
  ];

  return (
    <SafeAreaView style={styles.container} testID="profile-screen">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <Text style={styles.screenTitle}>MY PROFILE</Text>

        {/* Avatar Card */}
        <View style={styles.profileCard}>
          <View style={[styles.avatarRing, { borderColor: user.avatar_color }]}>
            <View style={[styles.avatarInner, { backgroundColor: user.avatar_color + '30' }]}>
              <Text style={styles.avatarEmoji}>{user.avatar}</Text>
            </View>
          </View>
          <Text style={styles.username}>{user.username}</Text>
          {user.role === 'admin' && (
            <View style={styles.adminBadge}>
              <Text style={styles.adminBadgeText}>ADMIN</Text>
            </View>
          )}
        </View>

        {/* Chips Balance */}
        <View style={styles.chipsCard} testID="chips-balance-card">
          <View style={styles.chipsLeft}>
            <Text style={styles.chipsLabel}>CHIP BALANCE</Text>
            <Text style={styles.chipsValue}>{user.chips.toLocaleString()}</Text>
          </View>
          <Text style={styles.chipsIcon}>🪙</Text>
        </View>

        {/* Stats */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Statistics</Text>
          <View style={styles.statsGrid}>
            {statItems.map((stat, i) => (
              <View key={i} style={styles.statCard} testID={`stat-${stat.label.toLowerCase().replace(' ', '-')}`}>
                <Text style={styles.statIcon}>{stat.icon}</Text>
                <Text style={styles.statValue}>{stat.value}</Text>
                <Text style={styles.statLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Actions */}
        <View style={styles.section}>
          <TouchableOpacity
            testID="go-to-table-btn"
            style={styles.tableBtn}
            onPress={() => router.push('/poker-table' as any)}
            activeOpacity={0.8}
          >
            <Text style={styles.tableBtnIcon}>🃏</Text>
            <Text style={styles.tableBtnText}>Go to Poker Table</Text>
            <Ionicons name="chevron-forward" size={18} color="#0a0f1a" />
          </TouchableOpacity>

          <TouchableOpacity
            testID="logout-btn"
            style={styles.logoutBtn}
            onPress={handleLogout}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#ef4444" size="small" />
            ) : (
              <>
                <Ionicons name="log-out-outline" size={18} color="#ef4444" />
                <Text style={styles.logoutBtnText}>Sign Out</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0f1a' },
  scrollContent: { padding: 16, paddingBottom: 40 },

  screenTitle: {
    fontSize: 13, fontWeight: '900', color: '#00f0ff',
    letterSpacing: 3, textAlign: 'center', marginBottom: 24,
  },

  profileCard: {
    backgroundColor: '#131a2a', borderRadius: 24,
    borderWidth: 1, borderColor: '#1e293b',
    alignItems: 'center', padding: 28, marginBottom: 14,
  },
  avatarRing: {
    width: 100, height: 100, borderRadius: 50,
    borderWidth: 3, padding: 6, marginBottom: 14,
  },
  avatarInner: { flex: 1, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  avatarEmoji: { fontSize: 50 },
  username: { fontSize: 24, fontWeight: '900', color: '#ffffff', marginBottom: 6 },
  adminBadge: {
    backgroundColor: '#7c3aed22', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 5,
    borderWidth: 1, borderColor: '#7c3aed',
  },
  adminBadgeText: { fontSize: 11, color: '#a78bfa', fontWeight: '700', letterSpacing: 1.5 },

  chipsCard: {
    backgroundColor: '#131a2a', borderRadius: 18,
    borderWidth: 1, borderColor: '#ffb80033',
    padding: 20, marginBottom: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  chipsLeft: {},
  chipsLabel: { fontSize: 11, color: '#64748b', letterSpacing: 1.5, fontWeight: '700', marginBottom: 4 },
  chipsValue: { fontSize: 32, fontWeight: '900', color: '#ffb800' },
  chipsIcon: { fontSize: 44 },

  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: '#64748b', letterSpacing: 1, marginBottom: 12 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: {
    flex: 1, minWidth: '45%',
    backgroundColor: '#131a2a', borderRadius: 16,
    borderWidth: 1, borderColor: '#1e293b',
    padding: 16, alignItems: 'center',
  },
  statIcon: { fontSize: 24, marginBottom: 6 },
  statValue: { fontSize: 20, fontWeight: '900', color: '#ffffff', marginBottom: 4 },
  statLabel: { fontSize: 11, color: '#64748b', textAlign: 'center' },

  tableBtn: {
    backgroundColor: '#00f0ff', borderRadius: 16,
    padding: 16, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12,
  },
  tableBtnIcon: { fontSize: 22 },
  tableBtnText: { flex: 1, fontSize: 15, fontWeight: '800', color: '#0a0f1a', marginLeft: 10 },

  logoutBtn: {
    backgroundColor: '#131a2a', borderRadius: 16,
    borderWidth: 1, borderColor: '#ef444440',
    padding: 16, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  logoutBtnText: { fontSize: 15, fontWeight: '700', color: '#ef4444' },
});
