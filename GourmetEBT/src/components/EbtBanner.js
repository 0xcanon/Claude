import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, sizes, weights } from '../theme';
import { useStore } from '../store/useStore';
import { formatPrice } from '../utils/helpers';

export default function EbtBanner({ onLinkCard }) {
  const { ebtCardLinked, ebtBalance, ebtCardLast4 } = useStore();

  if (!ebtCardLinked) {
    return (
      <TouchableOpacity style={styles.linkBanner} onPress={onLinkCard}>
        <View style={styles.iconContainer}>
          <MaterialIcons name="credit-card" size={24} color={colors.ebtGreen} />
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.linkTitle}>Link Your EBT Card</Text>
          <Text style={styles.linkSubtitle}>
            Pay for gourmet meals with your EBT benefits
          </Text>
        </View>
        <MaterialIcons name="arrow-forward-ios" size={16} color={colors.textSecondary} />
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.balanceBanner}>
      <View style={styles.balanceLeft}>
        <View style={styles.cardIcon}>
          <MaterialIcons name="credit-card" size={20} color={colors.black} />
        </View>
        <View>
          <Text style={styles.balanceLabel}>EBT Balance</Text>
          <Text style={styles.cardNumber}>Card ****{ebtCardLast4}</Text>
        </View>
      </View>
      <Text style={styles.balance}>{formatPrice(ebtBalance)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  linkBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(46, 204, 113, 0.1)',
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.base,
    borderWidth: 1,
    borderColor: 'rgba(46, 204, 113, 0.3)',
    borderStyle: 'dashed',
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    backgroundColor: 'rgba(46, 204, 113, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  textContainer: {
    flex: 1,
  },
  linkTitle: {
    color: colors.ebtGreen,
    fontSize: sizes.base,
    fontWeight: weights.bold,
  },
  linkSubtitle: {
    color: colors.textSecondary,
    fontSize: sizes.sm,
    marginTop: 2,
  },
  balanceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(46, 204, 113, 0.1)',
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.base,
    borderWidth: 1,
    borderColor: 'rgba(46, 204, 113, 0.2)',
  },
  balanceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.ebtGreen,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  balanceLabel: {
    color: colors.text,
    fontSize: sizes.md,
    fontWeight: weights.semibold,
  },
  cardNumber: {
    color: colors.textSecondary,
    fontSize: sizes.sm,
    marginTop: 2,
  },
  balance: {
    color: colors.ebtGreen,
    fontSize: sizes.xl,
    fontWeight: weights.bold,
  },
});
