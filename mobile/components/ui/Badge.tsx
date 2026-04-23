import { View, Text, StyleSheet } from 'react-native';
import { COLORS, CHILD_BOX_STATUS_COLORS, CARTON_STATUS_COLORS } from '../../constants';

interface BadgeProps {
  label: string;
  color?: string;
  type?: 'childBox' | 'carton';
}

export default function Badge({ label, color, type }: BadgeProps) {
  let bgColor = color || COLORS.textSecondary;

  if (!color && type === 'childBox') {
    bgColor = CHILD_BOX_STATUS_COLORS[label] || COLORS.textSecondary;
  } else if (!color && type === 'carton') {
    bgColor = CARTON_STATUS_COLORS[label] || COLORS.textSecondary;
  }

  return (
    <View style={[styles.badge, { backgroundColor: bgColor + '18' }]}>
      <Text style={[styles.text, { color: bgColor }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
