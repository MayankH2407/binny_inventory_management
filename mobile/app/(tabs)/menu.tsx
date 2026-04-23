import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS } from '../../constants';
import { useAuthStore } from '../../stores/authStore';
import RoleGate from '../../components/RoleGate';

interface MenuItem {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  route?: string;
  onPress?: () => void;
}

export default function MenuScreen() {
  const router = useRouter();
  const { user, logout } = useAuthStore();

  function handleItem(item: MenuItem) {
    if (item.onPress) {
      item.onPress();
    } else if (item.route) {
      router.push(item.route as any);
    }
  }

  function renderItem(item: MenuItem, idx: number) {
    return (
      <TouchableOpacity
        key={idx}
        style={styles.menuItem}
        activeOpacity={0.7}
        onPress={() => handleItem(item)}
      >
        <View style={[styles.menuIcon, { backgroundColor: item.color + '15' }]}>
          <Ionicons name={item.icon} size={28} color={item.color} />
        </View>
        <Text style={styles.menuLabel}>{item.label}</Text>
      </TouchableOpacity>
    );
  }

  const logoutItem: MenuItem = {
    icon: 'log-out-outline',
    label: 'Logout',
    color: COLORS.error,
    onPress: () => {
      Alert.alert('Logout', 'Are you sure you want to logout?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', style: 'destructive', onPress: () => logout() },
      ]);
    },
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* User Info */}
      <View style={styles.userCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user?.name?.charAt(0) || 'U'}</Text>
        </View>
        <View>
          <Text style={styles.userName}>{user?.name || 'User'}</Text>
          <Text style={styles.userRole}>{user?.role}</Text>
        </View>
      </View>

      {/* Menu Grid */}
      <View style={styles.grid}>
        {/* Visible to all roles */}
        {renderItem({ icon: 'cube-outline', label: 'Child Boxes', color: COLORS.primary, route: '/child-boxes' }, 0)}
        {renderItem({ icon: 'archive-outline', label: 'Master Cartons', color: COLORS.info, route: '/master-cartons' }, 1)}
        {renderItem({ icon: 'add-circle-outline', label: 'Pack', color: COLORS.success, route: '/master-cartons/create' }, 2)}
        {renderItem({ icon: 'paper-plane-outline', label: 'Dispatch', color: '#F97316', route: '/dispatch' }, 3)}
        {renderItem({ icon: 'open-outline', label: 'Unpack', color: COLORS.warning, route: '/unpack' }, 4)}
        {renderItem({ icon: 'swap-horizontal-outline', label: 'Repack', color: '#8B5CF6', route: '/repack' }, 5)}
        {renderItem({ icon: 'file-tray-outline', label: 'Storage', color: COLORS.info, route: '/storage' }, 6)}
        {renderItem({ icon: 'settings-outline', label: 'Settings', color: COLORS.textSecondary, route: '/settings' }, 7)}

        {/* Admin + Supervisor only */}
        <RoleGate allow={['Admin', 'Supervisor']}>
          {renderItem({ icon: 'pricetag-outline', label: 'Products', color: COLORS.primary, route: '/products' }, 8)}
        </RoleGate>
        <RoleGate allow={['Admin', 'Supervisor']}>
          {renderItem({ icon: 'people-outline', label: 'Customers', color: COLORS.info, route: '/customers' }, 9)}
        </RoleGate>
        <RoleGate allow={['Admin', 'Supervisor']}>
          {renderItem({ icon: 'bar-chart-outline', label: 'Reports', color: COLORS.success, route: '/reports' }, 10)}
        </RoleGate>

        {/* Admin only */}
        <RoleGate allow={['Admin']}>
          {renderItem({ icon: 'person-add-outline', label: 'Users', color: COLORS.accent, route: '/users' }, 11)}
        </RoleGate>

        {/* Logout — always last */}
        {renderItem(logoutItem, 12)}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 32 },
  userCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: COLORS.surface, borderRadius: 12, padding: 16,
    marginBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: COLORS.surface, fontSize: 20, fontWeight: '700' },
  userName: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  userRole: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  menuItem: {
    width: '30%', alignItems: 'center', backgroundColor: COLORS.surface,
    borderRadius: 12, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 1,
  },
  menuIcon: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  menuLabel: { fontSize: 12, fontWeight: '600', color: COLORS.text, textAlign: 'center' },
});
