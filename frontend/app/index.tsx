import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';

export default function Index() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (user) {
        if (user.role === 'admin') {
          router.replace('/admin' as any);
        } else {
          router.replace('/(main)/lobby' as any);
        }
      } else {
        router.replace('/(auth)/select-profile' as any);
      }
    }
  }, [user, loading]);

  return (
    <View style={styles.container}>
      <ActivityIndicator color="#00f0ff" size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0f1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
