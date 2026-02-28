import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, sizes, weights } from '../theme';
import { useStore } from '../store/useStore';
import { formatPrice, formatTime } from '../utils/helpers';

export default function OrderConfirmationScreen({ navigation }) {
  const { activeOrder } = useStore();
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!activeOrder) {
      navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
      return;
    }
    const animation = Animated.sequence([
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [activeOrder]);

  if (!activeOrder) {
    return null;
  }

  return (
    <View style={styles.container}>
      {/* Success Animation */}
      <Animated.View style={[styles.successCircle, { transform: [{ scale: scaleAnim }] }]}>
        <View style={styles.checkCircle}>
          <MaterialIcons name="check" size={50} color={colors.black} />
        </View>
      </Animated.View>

      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <Text style={styles.title}>Order Confirmed!</Text>
        <Text style={styles.subtitle}>
          Your gourmet meal is being prepared
        </Text>

        {/* Order Details Card */}
        <View style={styles.orderCard}>
          <View style={styles.orderHeader}>
            <Text style={styles.orderId}>{activeOrder.id}</Text>
            <Text style={styles.orderTime}>
              {formatTime(activeOrder.createdAt)}
            </Text>
          </View>

          <View style={styles.divider} />

          {activeOrder.items.map((item) => (
            <View key={item.id} style={styles.orderItem}>
              <Text style={styles.itemQty}>{item.quantity}x</Text>
              <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.itemPrice}>{formatPrice(item.price * item.quantity)}</Text>
            </View>
          ))}

          <View style={styles.divider} />

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Paid</Text>
            <View style={styles.totalRight}>
              <Text style={styles.totalValue}>{formatPrice(activeOrder.total)}</Text>
              {activeOrder.paymentMethod === 'ebt' && (
                <View style={styles.ebtPaid}>
                  <Text style={styles.ebtPaidText}>via EBT</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Timeline */}
        <View style={styles.timelineCard}>
          <Text style={styles.timelineTitle}>What's Happening Next</Text>
          <View style={styles.timelineItem}>
            <View style={[styles.timelineDot, { backgroundColor: colors.ebtGreen }]} />
            <View style={styles.timelineContent}>
              <Text style={styles.timelineStepTitle}>Order Confirmed</Text>
              <Text style={styles.timelineStepDesc}>Your order has been received</Text>
            </View>
            <MaterialIcons name="check-circle" size={20} color={colors.ebtGreen} />
          </View>
          <View style={styles.timelineLine} />
          <View style={styles.timelineItem}>
            <View style={[styles.timelineDot, { backgroundColor: colors.warning }]} />
            <View style={styles.timelineContent}>
              <Text style={styles.timelineStepTitle}>Shopping for Ingredients</Text>
              <Text style={styles.timelineStepDesc}>Our team is at the grocery store</Text>
            </View>
            <MaterialIcons name="schedule" size={20} color={colors.textMuted} />
          </View>
          <View style={styles.timelineLine} />
          <View style={styles.timelineItem}>
            <View style={[styles.timelineDot, { backgroundColor: colors.textMuted }]} />
            <View style={styles.timelineContent}>
              <Text style={styles.timelineStepTitle}>Chef Preparing</Text>
              <Text style={styles.timelineStepDesc}>Gourmet cooking in progress</Text>
            </View>
            <MaterialIcons name="schedule" size={20} color={colors.textMuted} />
          </View>
          <View style={styles.timelineLine} />
          <View style={styles.timelineItem}>
            <View style={[styles.timelineDot, { backgroundColor: colors.textMuted }]} />
            <View style={styles.timelineContent}>
              <Text style={styles.timelineStepTitle}>Out for Delivery</Text>
              <Text style={styles.timelineStepDesc}>Hot meal on its way!</Text>
            </View>
            <MaterialIcons name="schedule" size={20} color={colors.textMuted} />
          </View>
        </View>

        <Text style={styles.eta}>
          Estimated delivery by {formatTime(activeOrder.estimatedDelivery)}
        </Text>

        {/* Action Buttons */}
        <TouchableOpacity
          style={styles.trackButton}
          onPress={() => navigation.reset({
            index: 0,
            routes: [{ name: 'MainTabs', params: { screen: 'OrdersTab' } }],
          })}
        >
          <MaterialIcons name="delivery-dining" size={20} color={colors.black} />
          <Text style={styles.trackButtonText}>Track Order</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.homeButton}
          onPress={() => navigation.reset({
            index: 0,
            routes: [{ name: 'MainTabs' }],
          })}
        >
          <Text style={styles.homeButtonText}>Back to Home</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    paddingTop: spacing.xxxl + spacing.xl,
    paddingHorizontal: spacing.base,
  },
  successCircle: {
    marginBottom: spacing.xl,
  },
  checkCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    width: '100%',
    alignItems: 'center',
  },
  title: {
    color: colors.text,
    fontSize: sizes.xxl,
    fontWeight: weights.bold,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: sizes.base,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  orderCard: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.base,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderId: {
    color: colors.primary,
    fontSize: sizes.md,
    fontWeight: weights.bold,
  },
  orderTime: {
    color: colors.textSecondary,
    fontSize: sizes.sm,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  orderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  itemQty: {
    color: colors.primary,
    fontSize: sizes.md,
    fontWeight: weights.bold,
    width: 30,
  },
  itemName: {
    color: colors.text,
    fontSize: sizes.md,
    flex: 1,
  },
  itemPrice: {
    color: colors.text,
    fontSize: sizes.md,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    color: colors.text,
    fontSize: sizes.lg,
    fontWeight: weights.bold,
  },
  totalRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  totalValue: {
    color: colors.primary,
    fontSize: sizes.lg,
    fontWeight: weights.bold,
  },
  ebtPaid: {
    backgroundColor: colors.ebtGreen,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    marginLeft: spacing.sm,
  },
  ebtPaidText: {
    color: colors.white,
    fontSize: sizes.xs,
    fontWeight: weights.bold,
  },
  timelineCard: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.base,
  },
  timelineTitle: {
    color: colors.text,
    fontSize: sizes.base,
    fontWeight: weights.bold,
    marginBottom: spacing.md,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.md,
  },
  timelineContent: {
    flex: 1,
  },
  timelineStepTitle: {
    color: colors.text,
    fontSize: sizes.md,
    fontWeight: weights.medium,
  },
  timelineStepDesc: {
    color: colors.textMuted,
    fontSize: sizes.sm,
  },
  timelineLine: {
    width: 2,
    height: 16,
    backgroundColor: colors.border,
    marginLeft: 4,
    marginVertical: 4,
  },
  eta: {
    color: colors.textSecondary,
    fontSize: sizes.md,
    marginBottom: spacing.lg,
  },
  trackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.base,
    width: '100%',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  trackButtonText: {
    color: colors.black,
    fontSize: sizes.base,
    fontWeight: weights.bold,
  },
  homeButton: {
    paddingVertical: spacing.md,
  },
  homeButtonText: {
    color: colors.textSecondary,
    fontSize: sizes.base,
    fontWeight: weights.medium,
  },
});
