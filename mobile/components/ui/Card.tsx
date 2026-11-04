import { View, StyleSheet, type ViewStyle } from 'react-native';
import { COLORS } from '../../constants';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  padded?: boolean;
}

export default function Card({ children, style, padded = true }: CardProps) {
  return (
    <View style={[styles.card, padded && styles.padded, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    shadowColor: '#1E1A5F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  padded: {
    padding: 16,
  },
});
