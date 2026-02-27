import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, sizes, weights } from '../theme';
import { getOrderStatusText, getOrderStatusColor, getOrderStatusIcon } from '../utils/helpers';

export default function OrderStatusBar({ order, onPress }) {
  if (!order) return null;

  const statusColor = getOrderStatusColor(order.status);
  const statusText = getOrderStatusText(order.status);
  const statusIcon = getOrderStatusIcon(order.status);

  return (
    <TouchableOpacity style={[styles.container, { borderColor: statusColor }]} onPress={onPress}>
      <View style={[styles.iconContainer, { backgroundColor: statusColor }]}>
        <MaterialIcons name={statusIcon} size={20} color={colors.white} />
      </View>
      <View style={styles.content}>
        <Text style={styles.statusText}>{statusText}</Text>
        <Text style={styles.orderNumber}>Order {order.id}</Text>
      </View>
      <MaterialIcons name="arrow-forward-ios" size={16} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.base,
    borderWidth: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  content: {
    flex: 1,
  },
  statusText: {
    color: colors.text,
    fontSize: sizes.md,
    fontWeight: weights.semibold,
  },
  orderNumber: {
    color: colors.textSecondary,
    fontSize: sizes.sm,
    marginTop: 2,
  },
});
