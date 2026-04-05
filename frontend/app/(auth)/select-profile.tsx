import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Modal, Animated, ActivityIndicator, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../context/AuthContext';

const { width } = Dimensions.get('window');
const CARD_SIZE = (width - 48) / 2;

const PROFILES = [
  { username: 'AceKing',     avatar: '🦁', color: '#c9a227', role: 'player' },
  { username: 'BluffMaster', avatar: '🐺', color: '#3b82f6', role: 'player' },
  { username: 'CardShark',   avatar: '🦊', color: '#f97316', role: 'player' },
  { username: 'PokerPro',    avatar: '🐻', color: '#6b4226', role: 'player' },
  { username: 'AllInAndy',   avatar: '🦅', color: '#0891b2', role: 'player' },
  { username: 'HighRoller',  avatar: '🐯', color: '#dc2626', role: 'player' },
  { username: 'TableAdmin',  avatar: '👑', color: '#7c3aed', role: 'admin'  },
];

type Profile = typeof PROFILES[0];

export default function SelectProfile() {
  const { login } = useAuth();
  const router = useRouter();
  const [selected, setSelected] = useState<Profile | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (pin.length === 4 && selected && !loading) {
      handleLogin();
    }
  }, [pin]);

  const handleSelectProfile = (profile: Profile) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelected(profile);
    setPin('');
    setError('');
  };

  const handleNumPress = (num: string) => {
    if (pin.length < 4 && !loading) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setPin(prev => prev + num);
      setError('');
    }
  };

  const handleDelete = () => {
    if (!loading) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setPin(prev => prev.slice(0, -1));
    }
  };

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 14, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -14, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const handleLogin = async () => {
    if (!selected || pin.length !== 4 || loading) return;
    setLoading(true);
    try {
      await login(selected.username, pin);
      setSelected(null);
      if (selected.role === 'admin') {
        router.replace('/admin' as any);
      } else {
        router.replace('/(main)/lobby' as any);
      }
    } catch {
      setError('Wrong PIN. Try again.');
      setPin('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      shake();
    } finally {
      setLoading(false);
    }
  };

  // Build rows of 2 (last row is centered if odd)
  const rows: (Profile | null)[][] = [];
  for (let i = 0; i < PROFILES.length; i += 2) {
    const row: (Profile | null)[] = PROFILES.slice(i, i + 2);
    if (row.length === 1) row.push(null);
    rows.push(row);
  }

  return (
    <SafeAreaView style={styles.container} testID="select-profile-screen">
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.suitRow}>♠ ♥ ♦ ♣</Text>
        <Text style={styles.title}>POKER CLUB</Text>
        <Text style={styles.subtitle}>Select Your Profile to Enter</Text>
      </View>

      {/* Profile Grid */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {rows.map((row, rowIdx) => (
          <View
            key={rowIdx}
            style={[styles.row, row[1] === null && styles.rowCenter]}
          >
            {row.map((profile, colIdx) =>
              profile ? (
                <TouchableOpacity
                  key={profile.username}
                  testID={`profile-card-${profile.username}`}
                  style={styles.profileCard}
                  onPress={() => handleSelectProfile(profile)}
                  activeOpacity={0.75}
                >
                  {/* Glow ring */}
                  <View style={[styles.avatarRing, { borderColor: profile.color }]}>
                    <View style={[styles.avatarInner, { backgroundColor: profile.color + '30' }]}>
                      <Text style={styles.avatarEmoji}>{profile.avatar}</Text>
                    </View>
                  </View>
                  <Text style={styles.profileName}>{profile.username}</Text>
                  {profile.role === 'admin' ? (
                    <View style={styles.adminBadge}>
                      <Text style={styles.adminBadgeText}>ADMIN</Text>
                    </View>
                  ) : (
                    <Text style={styles.chipHint}>10,000 🪙</Text>
                  )}
                </TouchableOpacity>
              ) : (
                <View key={`empty-${colIdx}`} style={styles.emptyCard} />
              )
            )}
          </View>
        ))}
      </ScrollView>

      {/* PIN Entry Modal */}
      <Modal
        visible={selected !== null}
        transparent
        animationType="fade"
        onRequestClose={() => { if (!loading) { setSelected(null); setPin(''); setError(''); } }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard} testID="pin-modal">
            {selected && (
              <>
                <View style={[styles.modalRing, { borderColor: selected.color }]}>
                  <View style={[styles.modalInner, { backgroundColor: selected.color + '30' }]}>
                    <Text style={styles.modalEmoji}>{selected.avatar}</Text>
                  </View>
                </View>
                <Text style={styles.modalName}>{selected.username}</Text>
              </>
            )}

            <Text style={styles.pinLabel}>ENTER PIN</Text>

            {/* PIN Dots */}
            <Animated.View
              style={[styles.pinDots, { transform: [{ translateX: shakeAnim }] }]}
            >
              {[0, 1, 2, 3].map(i => (
                <View
                  key={i}
                  style={[styles.pinDot, pin.length > i && styles.pinDotFilled]}
                />
              ))}
            </Animated.View>

            <Text style={styles.errorText}>{error || ' '}</Text>

            {/* Numpad or Loader */}
            {loading ? (
              <ActivityIndicator color="#00f0ff" size="large" style={{ marginVertical: 28 }} />
            ) : (
              <View style={styles.numpad}>
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(n => (
                  <TouchableOpacity
                    key={n}
                    testID={`numpad-btn-${n}`}
                    style={styles.numKey}
                    onPress={() => handleNumPress(n)}
                    activeOpacity={0.6}
                  >
                    <Text style={styles.numKeyText}>{n}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  testID="numpad-delete"
                  style={styles.numKey}
                  onPress={handleDelete}
                  activeOpacity={0.6}
                >
                  <Text style={styles.numKeyText}>⌫</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="numpad-btn-0"
                  style={styles.numKey}
                  onPress={() => handleNumPress('0')}
                  activeOpacity={0.6}
                >
                  <Text style={styles.numKeyText}>0</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="numpad-confirm"
                  style={[styles.numKey, styles.confirmKey]}
                  onPress={handleLogin}
                  activeOpacity={0.6}
                >
                  <Text style={[styles.numKeyText, { color: '#0a0f1a', fontWeight: '900' }]}>✓</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity
              testID="cancel-pin-btn"
              onPress={() => { setSelected(null); setPin(''); setError(''); }}
              style={styles.cancelBtn}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0f1a' },

  header: { alignItems: 'center', paddingTop: 16, paddingBottom: 20 },
  suitRow: { fontSize: 18, color: '#00f0ff', letterSpacing: 8, marginBottom: 6 },
  title: { fontSize: 32, fontWeight: '900', color: '#ffb800', letterSpacing: 4 },
  subtitle: { fontSize: 13, color: '#64748b', marginTop: 4, letterSpacing: 0.5 },

  scrollContent: { paddingHorizontal: 16, paddingBottom: 32 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  rowCenter: { justifyContent: 'center' },

  profileCard: {
    width: CARD_SIZE,
    backgroundColor: '#131a2a',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 20,
    alignItems: 'center',
  },
  emptyCard: { width: CARD_SIZE },

  avatarRing: {
    width: 76, height: 76, borderRadius: 38,
    borderWidth: 2, padding: 4, marginBottom: 10,
  },
  avatarInner: {
    flex: 1, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 36 },
  profileName: { fontSize: 14, fontWeight: '800', color: '#ffffff', textAlign: 'center', marginBottom: 4 },
  adminBadge: {
    backgroundColor: '#7c3aed22', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 3,
    borderWidth: 1, borderColor: '#7c3aed',
  },
  adminBadgeText: { fontSize: 10, color: '#a78bfa', fontWeight: '700', letterSpacing: 1.5 },
  chipHint: { fontSize: 11, color: '#64748b' },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.88)',
    justifyContent: 'center', alignItems: 'center',
  },
  modalCard: {
    backgroundColor: '#131a2a',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#00f0ff44',
    padding: 28,
    alignItems: 'center',
    width: width - 64,
    shadowColor: '#00f0ff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 16,
  },

  modalRing: {
    width: 88, height: 88, borderRadius: 44,
    borderWidth: 2.5, padding: 5, marginBottom: 10,
  },
  modalInner: {
    flex: 1, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center',
  },
  modalEmoji: { fontSize: 42 },
  modalName: { fontSize: 20, fontWeight: '800', color: '#ffffff', marginBottom: 6 },

  pinLabel: { fontSize: 11, color: '#64748b', letterSpacing: 2, marginBottom: 14 },
  pinDots: { flexDirection: 'row', gap: 14, marginBottom: 6 },
  pinDot: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 2, borderColor: '#334155',
  },
  pinDotFilled: { backgroundColor: '#00f0ff', borderColor: '#00f0ff' },

  errorText: { color: '#ef4444', fontSize: 12, height: 18, marginBottom: 8 },

  numpad: {
    flexDirection: 'row', flexWrap: 'wrap',
    width: 234, justifyContent: 'space-between', marginBottom: 16,
  },
  numKey: {
    width: 72, height: 58, borderRadius: 14,
    backgroundColor: '#1e293b',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
  },
  confirmKey: { backgroundColor: '#00f0ff' },
  numKeyText: { fontSize: 22, fontWeight: '700', color: '#ffffff' },

  cancelBtn: { paddingVertical: 10, paddingHorizontal: 24 },
  cancelText: { color: '#64748b', fontSize: 14 },
});
