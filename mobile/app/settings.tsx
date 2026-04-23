import { View, Text, ScrollView, StyleSheet, Alert, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { COLORS, API_BASE_URL } from '../constants';
import { useAuthStore } from '../stores/authStore';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';

export default function SettingsScreen() {
  const { user, logout } = useAuthStore();
  const appVersion = (Constants.expoConfig?.version as string | undefined) ?? '—';

  function confirmLogout() {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', style: 'destructive', onPress: () => logout() },
      ],
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Settings' }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Card style={styles.card}>
          <View style={styles.userHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{user?.name?.charAt(0) ?? 'U'}</Text>
            </View>
            <View style={styles.userBlock}>
              <Text style={styles.userName}>{user?.name ?? 'Unknown user'}</Text>
              <Text style={styles.userEmail}>{user?.email ?? '—'}</Text>
              {user?.role ? <View style={styles.roleRow}><Badge label={user.role} color={COLORS.primary} /></View> : null}
            </View>
          </View>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>About</Text>
          <Row label="App" value="Binny Inventory" />
          <Row label="Version" value={appVersion} />
          <Row label="Platform" value={`${Platform.OS} ${Platform.Version}`} />
          {__DEV__ ? <Row label="API" value={API_BASE_URL} mono /> : null}
        </Card>

        <Button
          title="Logout"
          onPress={confirmLogout}
          variant="danger"
          icon={<Ionicons name="log-out-outline" size={18} color={COLORS.surface} />}
          fullWidth
          style={styles.logoutButton}
        />
      </ScrollView>
    </>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, mono && styles.mono]} numberOfLines={1} ellipsizeMode="middle">{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 32 },
  card: { marginBottom: 14 },
  userHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: COLORS.surface, fontSize: 24, fontWeight: '700' },
  userBlock: { flex: 1 },
  userName: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  userEmail: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  roleRow: { marginTop: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  rowLabel: { fontSize: 13, color: COLORS.textSecondary },
  rowValue: { fontSize: 13, fontWeight: '600', color: COLORS.text, maxWidth: '65%', textAlign: 'right' },
  mono: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 11 },
  logoutButton: { marginTop: 8 },
});
