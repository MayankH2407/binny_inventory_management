import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ScrollView,
  Modal,
  Switch,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { COLORS } from '../constants';
import { userService } from '../services/user.service';
import type { User, UserRole, CreateUserRequest, UpdateUserRequest } from '../types';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import Spinner from '../components/ui/Spinner';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import RoleGate, { useHasRole } from '../components/RoleGate';
import { useAuthStore } from '../stores/authStore';

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

type RoleFilter = 'ALL' | UserRole;
const ROLE_OPTIONS: RoleFilter[] = [
  'ALL',
  'Admin',
  'Supervisor',
  'Warehouse Operator',
  'Dispatch Operator',
];

const ROLE_COLORS: Record<UserRole, string> = {
  Admin: COLORS.accent,
  Supervisor: COLORS.primary,
  'Warehouse Operator': COLORS.success,
  'Dispatch Operator': COLORS.warning,
};

// ─── Denied fallback ─────────────────────────────────────────────────────────

function DeniedView() {
  return (
    <View style={styles.deniedContainer}>
      <EmptyState
        icon="lock-closed-outline"
        title="Not authorized"
        message="You don't have permission to view users."
      />
    </View>
  );
}

// ─── Role Picker (inline button group) ───────────────────────────────────────

interface RolePickerProps {
  value: UserRole;
  onChange: (role: UserRole) => void;
  disabled?: boolean;
}

const ALL_ROLES: UserRole[] = [
  'Admin',
  'Supervisor',
  'Warehouse Operator',
  'Dispatch Operator',
];

function RolePicker({ value, onChange, disabled }: RolePickerProps) {
  return (
    <View style={styles.rolePickerContainer}>
      <Text style={styles.rolePickerLabel}>Role</Text>
      <View style={styles.rolePickerGrid}>
        {ALL_ROLES.map((role) => {
          const active = value === role;
          return (
            <TouchableOpacity
              key={role}
              disabled={disabled}
              activeOpacity={0.7}
              onPress={() => onChange(role)}
              style={[
                styles.rolePickerBtn,
                active ? styles.rolePickerBtnActive : styles.rolePickerBtnInactive,
                disabled && styles.rolePickerBtnDisabled,
              ]}
            >
              <Text
                style={[
                  styles.rolePickerBtnText,
                  active ? styles.rolePickerBtnTextActive : styles.rolePickerBtnTextInactive,
                ]}
              >
                {role}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

interface EditModalProps {
  user: User | null;
  visible: boolean;
  onClose: () => void;
}

function EditModal({ user, visible, onClose }: EditModalProps) {
  const queryClient = useQueryClient();
  const isAdmin = useHasRole(['Admin']);
  const currentUser = useAuthStore((s) => s.user);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('Warehouse Operator');
  const [isActive, setIsActive] = useState(true);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Populate form when user changes
  useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
      setRole(user.role);
      setIsActive(user.is_active);
      setPassword('');
    }
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    if (!name.trim()) {
      Alert.alert('Validation', 'Name is required.');
      return;
    }
    if (!email.trim()) {
      Alert.alert('Validation', 'Email is required.');
      return;
    }

    const payload: UpdateUserRequest = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role,
      is_active: isActive,
    };
    if (password.trim()) {
      payload.password = password.trim();
    }

    try {
      setSaving(true);
      await userService.update(user.id, payload);
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onClose();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Failed to update user.';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!user) return;
    Alert.alert(
      'Delete User',
      `Delete "${user.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeleting(true);
              await userService.remove(user.id);
              queryClient.invalidateQueries({ queryKey: ['users'] });
              onClose();
            } catch (err: unknown) {
              const msg =
                err instanceof Error ? err.message : 'Failed to delete user.';
              Alert.alert('Error', msg);
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const canDeleteSelf =
    isAdmin && user && currentUser && user.id !== currentUser.id;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalKav}
        >
          <View style={styles.modalSheet}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {isAdmin ? 'Edit User' : 'User Details'}
              </Text>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalBody}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {isAdmin ? (
                /* ── Admin: editable form ── */
                <>
                  <Input
                    label="Name"
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                    returnKeyType="next"
                    placeholder="Full name"
                  />
                  <Input
                    label="Email"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    returnKeyType="next"
                    placeholder="email@example.com"
                  />
                  <RolePicker value={role} onChange={setRole} />
                  <View style={styles.toggleRow}>
                    <Text style={styles.toggleLabel}>Active</Text>
                    <Switch
                      value={isActive}
                      onValueChange={setIsActive}
                      trackColor={{ false: COLORS.border, true: COLORS.primary }}
                      thumbColor={COLORS.surface}
                    />
                  </View>
                  <Input
                    label="New Password (optional)"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoCapitalize="none"
                    returnKeyType="done"
                    placeholder="Leave blank to keep current"
                    containerStyle={{ marginBottom: 8 }}
                  />
                </>
              ) : (
                /* ── Supervisor: read-only view ── */
                <>
                  <ReadonlyRow label="Name" value={user?.name ?? ''} />
                  <ReadonlyRow label="Email" value={user?.email ?? ''} />
                  <ReadonlyRow label="Role" value={user?.role ?? ''} />
                  <ReadonlyRow label="Status" value={user?.is_active ? 'Active' : 'Inactive'} />
                </>
              )}
            </ScrollView>

            {/* Footer buttons */}
            {isAdmin && (
              <View style={styles.modalFooter}>
                {canDeleteSelf && (
                  <Button
                    title="Delete"
                    variant="danger"
                    onPress={handleDelete}
                    loading={deleting}
                    disabled={saving}
                    style={styles.footerBtnLeft}
                  />
                )}
                <View style={styles.footerBtnRight}>
                  <Button
                    title="Cancel"
                    variant="outline"
                    onPress={onClose}
                    disabled={saving || deleting}
                    style={styles.footerBtnCancel}
                  />
                  <Button
                    title="Save"
                    variant="primary"
                    onPress={handleSave}
                    loading={saving}
                    disabled={deleting}
                    style={styles.footerBtnSave}
                  />
                </View>
              </View>
            )}
            {!isAdmin && (
              <View style={styles.modalFooterSingle}>
                <Button title="Close" variant="outline" onPress={onClose} fullWidth />
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Create Modal ─────────────────────────────────────────────────────────────

interface CreateModalProps {
  visible: boolean;
  onClose: () => void;
}

function CreateModal({ visible, onClose }: CreateModalProps) {
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('Warehouse Operator');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName('');
    setEmail('');
    setPassword('');
    setRole('Warehouse Operator');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Validation', 'Name is required.');
      return;
    }
    if (!email.trim()) {
      Alert.alert('Validation', 'Email is required.');
      return;
    }
    if (!password.trim() || password.trim().length < 8) {
      Alert.alert('Validation', 'Password must be at least 8 characters.');
      return;
    }

    const payload: CreateUserRequest = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: password.trim(),
      role,
    };

    try {
      setSaving(true);
      await userService.create(payload);
      queryClient.invalidateQueries({ queryKey: ['users'] });
      handleClose();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Failed to create user.';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalKav}
        >
          <View style={styles.modalSheet}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create User</Text>
              <TouchableOpacity
                onPress={handleClose}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalBody}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Input
                label="Name"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                returnKeyType="next"
                placeholder="Full name"
              />
              <Input
                label="Email"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                returnKeyType="next"
                placeholder="email@example.com"
              />
              <Input
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                returnKeyType="done"
                placeholder="Min 8 characters"
              />
              <RolePicker value={role} onChange={setRole} />
            </ScrollView>

            <View style={styles.modalFooter}>
              <View style={styles.footerBtnRight}>
                <Button
                  title="Cancel"
                  variant="outline"
                  onPress={handleClose}
                  disabled={saving}
                  style={styles.footerBtnCancel}
                />
                <Button
                  title="Create"
                  variant="primary"
                  onPress={handleCreate}
                  loading={saving}
                  style={styles.footerBtnSave}
                />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Readonly row (supervisor view) ──────────────────────────────────────────

function ReadonlyRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.readonlyRow}>
      <Text style={styles.readonlyLabel}>{label}</Text>
      <Text style={styles.readonlyValue}>{value}</Text>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

function UsersScreen() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL');
  const [activeOnly, setActiveOnly] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [editVisible, setEditVisible] = useState(false);
  const [createVisible, setCreateVisible] = useState(false);
  const isAdmin = useHasRole(['Admin']);

  // 300 ms debounce
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const queryKey = ['users', { role: roleFilter, search, activeOnly }];

  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      userService.getAll({
        page: pageParam as number,
        limit: PAGE_SIZE,
        role: roleFilter === 'ALL' ? undefined : roleFilter,
        search: search || undefined,
        is_active: activeOnly ? true : undefined,
      }),
    getNextPageParam: (last) =>
      last.page < last.totalPages ? last.page + 1 : undefined,
    initialPageParam: 1,
  });

  const items: User[] = query.data?.pages.flatMap((p) => p.data) ?? [];

  const handleLoadMore = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) {
      query.fetchNextPage();
    }
  }, [query]);

  const openEdit = useCallback((user: User) => {
    setSelectedUser(user);
    setEditVisible(true);
  }, []);

  const closeEdit = useCallback(() => {
    setEditVisible(false);
    setSelectedUser(null);
  }, []);

  // ─── Row renderer ────────────────────────────────────────────────────────

  const renderItem = useCallback(
    ({ item: user }: { item: User }) => {
      const badgeColor = ROLE_COLORS[user.role] ?? COLORS.textSecondary;
      return (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => openEdit(user)}
          style={styles.rowTouchable}
        >
          <Card style={styles.itemCard}>
            <View style={styles.row1}>
              <Text style={styles.userName} numberOfLines={1}>
                {user.name}
              </Text>
              <Badge label={user.role} color={badgeColor} />
            </View>
            <Text style={styles.emailLine} numberOfLines={1}>
              {user.email}
            </Text>
            {!user.is_active && (
              <View style={styles.inactiveRow}>
                <Text style={styles.inactiveBadge}>Inactive</Text>
              </View>
            )}
          </Card>
        </TouchableOpacity>
      );
    },
    [openEdit]
  );

  // ─── Footer ──────────────────────────────────────────────────────────────

  const ListFooter = useCallback(() => {
    if (query.isFetchingNextPage) {
      return (
        <View style={styles.footer}>
          <Spinner size="small" />
        </View>
      );
    }
    if (!query.hasNextPage && items.length > 0) {
      return (
        <View style={styles.footer}>
          <Text style={styles.footerText}>End of list</Text>
        </View>
      );
    }
    return null;
  }, [query.isFetchingNextPage, query.hasNextPage, items.length]);

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <>
      <Stack.Screen options={{ title: 'Users' }} />

      <View style={styles.container}>
        {/* Search bar */}
        <View style={styles.searchWrapper}>
          <Ionicons
            name="search-outline"
            size={18}
            color={COLORS.textSecondary}
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            value={searchInput}
            onChangeText={setSearchInput}
            placeholder="Search by name or email…"
            placeholderTextColor={COLORS.textLight}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {searchInput.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchInput('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={18} color={COLORS.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Role filter chips + Active toggle */}
        <View style={styles.filtersRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipsScroll}
            contentContainerStyle={styles.chipsContent}
          >
            {ROLE_OPTIONS.map((r) => {
              const active = roleFilter === r;
              return (
                <TouchableOpacity
                  key={r}
                  onPress={() => setRoleFilter(r)}
                  style={[
                    styles.chip,
                    active ? styles.chipActive : styles.chipInactive,
                  ]}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.chipText,
                      active ? styles.chipTextActive : styles.chipTextInactive,
                    ]}
                  >
                    {r}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Active-only toggle */}
          <TouchableOpacity
            onPress={() => setActiveOnly((v) => !v)}
            style={[
              styles.chip,
              styles.activeToggleChip,
              activeOnly ? styles.chipActive : styles.chipInactive,
            ]}
            activeOpacity={0.7}
          >
            <Ionicons
              name={activeOnly ? 'checkmark-circle' : 'ellipse-outline'}
              size={14}
              color={activeOnly ? COLORS.surface : COLORS.textSecondary}
              style={{ marginRight: 4 }}
            />
            <Text
              style={[
                styles.chipText,
                activeOnly ? styles.chipTextActive : styles.chipTextInactive,
              ]}
            >
              Active
            </Text>
          </TouchableOpacity>
        </View>

        {/* List / loading / empty */}
        {query.isLoading && items.length === 0 ? (
          <View style={styles.centered}>
            <Spinner />
          </View>
        ) : !query.isLoading && items.length === 0 ? (
          <EmptyState
            icon="person-add-outline"
            title="No users"
            message="No users match the current filters."
          />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.4}
            ListFooterComponent={ListFooter}
            refreshControl={
              <RefreshControl
                refreshing={query.isRefetching && !query.isFetchingNextPage}
                onRefresh={() => query.refetch()}
                tintColor={COLORS.primary}
                colors={[COLORS.primary]}
              />
            }
          />
        )}

        {/* FAB — Admin only */}
        {isAdmin && (
          <TouchableOpacity
            style={styles.fab}
            onPress={() => setCreateVisible(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="add" size={28} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>

      {/* Modals */}
      <EditModal user={selectedUser} visible={editVisible} onClose={closeEdit} />
      <CreateModal visible={createVisible} onClose={() => setCreateVisible(false)} />
    </>
  );
}

// ─── Export (role-gated) ─────────────────────────────────────────────────────

export default function UsersScreenGated() {
  return (
    <RoleGate allow={['Admin', 'Supervisor']} fallback={<DeniedView />}>
      <UsersScreen />
    </RoleGate>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  deniedContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // Search
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    margin: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 42,
    fontSize: 14,
    color: COLORS.text,
  },

  // Filters row
  filtersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  chipsScroll: {
    flexGrow: 1,
    flexShrink: 1,
  },
  chipsContent: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 8,
  },
  activeToggleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
    marginBottom: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
  },
  chipInactive: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: COLORS.surface,
  },
  chipTextInactive: {
    color: COLORS.textSecondary,
  },

  // List
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 88,
    paddingTop: 4,
  },
  rowTouchable: {
    marginBottom: 8,
  },
  itemCard: {
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  row1: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  userName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginRight: 8,
  },
  emailLine: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  inactiveRow: {
    marginTop: 6,
    alignSelf: 'flex-end',
  },
  inactiveBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.error,
    backgroundColor: COLORS.error + '18',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    overflow: 'hidden',
  },

  // Misc
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  footer: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 13,
    color: COLORS.textLight,
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalKav: {
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
  },
  modalBody: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  modalFooterSingle: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  footerBtnLeft: {
    minWidth: 88,
  },
  footerBtnRight: {
    flexDirection: 'row',
    gap: 10,
    marginLeft: 'auto',
  },
  footerBtnCancel: {
    minWidth: 80,
  },
  footerBtnSave: {
    minWidth: 88,
  },

  // Role picker
  rolePickerContainer: {
    marginBottom: 16,
  },
  rolePickerLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  rolePickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  rolePickerBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  rolePickerBtnActive: {
    backgroundColor: COLORS.primary,
  },
  rolePickerBtnInactive: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  rolePickerBtnDisabled: {
    opacity: 0.5,
  },
  rolePickerBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  rolePickerBtnTextActive: {
    color: COLORS.surface,
  },
  rolePickerBtnTextInactive: {
    color: COLORS.textSecondary,
  },

  // Toggle
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingVertical: 4,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },

  // Readonly rows
  readonlyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  readonlyLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  readonlyValue: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '600',
    maxWidth: '60%',
    textAlign: 'right',
  },
});
