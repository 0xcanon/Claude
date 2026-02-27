import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, sizes, weights } from '../theme';
import { useStore } from '../store/useStore';
import { ghostKitchens } from '../data/stores';
import {
  formatPrice,
  formatTime,
  getOrderStatusText,
  getOrderStatusColor,
  getOrderStatusIcon,
} from '../utils/helpers';

const ORDER_STEPS = [
  { key: 'confirmed', icon: 'check-circle', label: 'Order Confirmed', description: 'Your order has been received and confirmed' },
  { key: 'shopping', icon: 'shopping-cart', label: 'Shopping for Ingredients', description: 'Our team is shopping for fresh groceries at the store' },
  { key: 'preparing', icon: 'kitchen', label: 'Preparing Ingredients', description: 'Chef is prepping your fresh ingredients' },
  { key: 'cooking', icon: 'local-fire-department', label: 'Chef is Cooking', description: 'Your gourmet meal is being cooked to perfection' },
  { key: 'ready', icon: 'check-circle', label: 'Ready for Pickup', description: 'Your meal is packed and ready for the driver' },
  { key: 'delivering', icon: 'delivery-dining', label: 'Out for Delivery', description: 'Your gourmet meal is on its way!' },
  { key: 'delivered', icon: 'done-all', label: 'Delivered', description: 'Enjoy your gourmet meal!' },
];

export default function OrderTrackingScreen({ route, navigation }) {
  const { order } = route.params;
  const { updateOrderStatus } = useStore();
  const kitchen = ghostKitchens.find((k) => k.id === order.kitchenId);
  const [currentOrder, setCurrentOrder] = useState(order);

  // Simulate order progress for demo
  useEffect(() => {
    const statusFlow = ['confirmed', 'shopping', 'preparing', 'cooking', 'ready', 'delivering', 'delivered'];
    const currentIndex = statusFlow.indexOf(currentOrder.status);

    if (currentIndex < statusFlow.length - 1) {
      const timer = setTimeout(() => {
        const nextStatus = statusFlow[currentIndex + 1];
        const step = ORDER_STEPS.find(s => s.key === nextStatus);
        updateOrderStatus(currentOrder.id, nextStatus, step?.description || '');
        setCurrentOrder(prev => ({ ...prev, status: nextStatus }));
      }, 15000); // Progress every 15 seconds for demo

      return () => clearTimeout(timer);
    }
  }, [currentOrder.status]);

  const currentStepIndex = ORDER_STEPS.findIndex(s => s.key === currentOrder.status);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Track Order</Text>
        <Text style={styles.orderId}>{currentOrder.id}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Status Header */}
        <View style={styles.statusCard}>
          <View style={[styles.statusIconContainer, { backgroundColor: getOrderStatusColor(currentOrder.status) }]}>
            <MaterialIcons
              name={getOrderStatusIcon(currentOrder.status)}
              size={32}
              color={colors.white}
            />
          </View>
          <Text style={styles.statusTitle}>{getOrderStatusText(currentOrder.status)}</Text>
          <Text style={styles.statusSubtitle}>
            {ORDER_STEPS.find(s => s.key === currentOrder.status)?.description}
          </Text>
          {currentOrder.status !== 'delivered' && (
            <Text style={styles.eta}>
              Estimated delivery: {formatTime(currentOrder.estimatedDelivery)}
            </Text>
          )}
        </View>

        {/* Map Placeholder */}
        {(currentOrder.status === 'delivering' || currentOrder.status === 'delivered') && (
          <View style={styles.mapPlaceholder}>
            <MaterialIcons name="map" size={40} color={colors.primary} />
            <Text style={styles.mapText}>Live tracking available</Text>
            <Text style={styles.mapSubtext}>Driver is on the way</Text>
          </View>
        )}

        {/* Timeline */}
        <View style={styles.timelineSection}>
          <Text style={styles.sectionTitle}>Order Progress</Text>
          {ORDER_STEPS.map((step, index) => {
            const isCompleted = index <= currentStepIndex;
            const isCurrent = index === currentStepIndex;
            return (
              <View key={step.key}>
                <View style={styles.timelineRow}>
                  <View style={styles.timelineLeft}>
                    <View style={[
                      styles.timelineDot,
                      isCompleted && styles.timelineDotActive,
                      isCurrent && styles.timelineDotCurrent,
                    ]}>
                      <MaterialIcons
                        name={isCompleted ? step.icon : 'schedule'}
                        size={16}
                        color={isCompleted ? colors.white : colors.textMuted}
                      />
                    </View>
                    {index < ORDER_STEPS.length - 1 && (
                      <View style={[
                        styles.timelineLine,
                        isCompleted && styles.timelineLineActive,
                      ]} />
                    )}
                  </View>
                  <View style={styles.timelineContent}>
                    <Text style={[styles.stepLabel, isCompleted && styles.stepLabelActive]}>
                      {step.label}
                    </Text>
                    <Text style={styles.stepDesc}>{step.description}</Text>
                    {isCurrent && (
                      <View style={styles.currentBadge}>
                        <View style={styles.pulseDot} />
                        <Text style={styles.currentText}>Current</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        {/* Grocery Shopping List */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Grocery Shopping List</Text>
          <Text style={styles.sectionSubtitle}>
            Our team shops for these fresh ingredients to prepare your meal
          </Text>
          <View style={styles.groceryList}>
            {currentOrder.items.map((item) => (
              <View key={item.id} style={styles.groceryItem}>
                <MaterialIcons name="shopping-basket" size={16} color={colors.primary} />
                <Text style={styles.groceryText}>
                  Ingredients for {item.name} (x{item.quantity})
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Order Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order Details</Text>
          <View style={styles.detailCard}>
            {kitchen && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Kitchen</Text>
                <Text style={styles.detailValue}>{kitchen.name}</Text>
              </View>
            )}
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Payment</Text>
              <View style={styles.paymentBadge}>
                <Text style={styles.paymentText}>
                  {currentOrder.paymentMethod === 'ebt' ? 'EBT Card' : 'Cash'}
                </Text>
              </View>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Delivery Address</Text>
              <Text style={styles.detailValue}>{currentOrder.address}</Text>
            </View>
            <View style={styles.divider} />
            {currentOrder.items.map((item) => (
              <View key={item.id} style={styles.itemRow}>
                <Text style={styles.itemText}>{item.quantity}x {item.name}</Text>
                <Text style={styles.itemPrice}>{formatPrice(item.price * item.quantity)}</Text>
              </View>
            ))}
            <View style={styles.divider} />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{formatPrice(currentOrder.total)}</Text>
            </View>
          </View>
        </View>

        {/* Help */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.helpButton}>
            <MaterialIcons name="headset-mic" size={20} color={colors.primary} />
            <Text style={styles.helpText}>Need Help with Order?</Text>
            <MaterialIcons name="arrow-forward-ios" size={14} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.base,
  },
  headerTitle: {
    color: colors.text,
    fontSize: sizes.xl,
    fontWeight: weights.bold,
  },
  orderId: {
    color: colors.textSecondary,
    fontSize: sizes.sm,
  },
  statusCard: {
    alignItems: 'center',
    padding: spacing.xl,
    marginHorizontal: spacing.base,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  statusTitle: {
    color: colors.text,
    fontSize: sizes.xl,
    fontWeight: weights.bold,
  },
  statusSubtitle: {
    color: colors.textSecondary,
    fontSize: sizes.md,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  eta: {
    color: colors.primary,
    fontSize: sizes.md,
    fontWeight: weights.semibold,
    marginTop: spacing.md,
  },
  mapPlaceholder: {
    margin: spacing.base,
    height: 160,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  mapText: {
    color: colors.text,
    fontSize: sizes.base,
    fontWeight: weights.semibold,
    marginTop: spacing.sm,
  },
  mapSubtext: {
    color: colors.textSecondary,
    fontSize: sizes.sm,
    marginTop: 2,
  },
  timelineSection: {
    padding: spacing.base,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: sizes.lg,
    fontWeight: weights.bold,
    marginBottom: spacing.md,
  },
  sectionSubtitle: {
    color: colors.textSecondary,
    fontSize: sizes.sm,
    marginBottom: spacing.md,
    marginTop: -spacing.sm,
  },
  timelineRow: {
    flexDirection: 'row',
  },
  timelineLeft: {
    alignItems: 'center',
    width: 36,
  },
  timelineDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timelineDotActive: {
    backgroundColor: colors.ebtGreen,
  },
  timelineDotCurrent: {
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.primaryLight,
  },
  timelineLine: {
    width: 2,
    height: 40,
    backgroundColor: colors.surfaceLight,
    marginVertical: 4,
  },
  timelineLineActive: {
    backgroundColor: colors.ebtGreen,
  },
  timelineContent: {
    flex: 1,
    marginLeft: spacing.md,
    paddingBottom: spacing.lg,
  },
  stepLabel: {
    color: colors.textMuted,
    fontSize: sizes.md,
    fontWeight: weights.semibold,
  },
  stepLabelActive: {
    color: colors.text,
  },
  stepDesc: {
    color: colors.textMuted,
    fontSize: sizes.sm,
    marginTop: 2,
  },
  currentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginRight: spacing.xs,
  },
  currentText: {
    color: colors.primary,
    fontSize: sizes.sm,
    fontWeight: weights.bold,
  },
  section: {
    padding: spacing.base,
  },
  groceryList: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.border,
  },
  groceryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  groceryText: {
    color: colors.text,
    fontSize: sizes.md,
    marginLeft: spacing.sm,
  },
  detailCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.border,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  detailLabel: {
    color: colors.textSecondary,
    fontSize: sizes.md,
  },
  detailValue: {
    color: colors.text,
    fontSize: sizes.md,
    fontWeight: weights.medium,
    textAlign: 'right',
    flex: 1,
    marginLeft: spacing.base,
  },
  paymentBadge: {
    backgroundColor: 'rgba(46, 204, 113, 0.1)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  paymentText: {
    color: colors.ebtGreen,
    fontSize: sizes.sm,
    fontWeight: weights.bold,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  itemText: {
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
  },
  totalLabel: {
    color: colors.text,
    fontSize: sizes.lg,
    fontWeight: weights.bold,
  },
  totalValue: {
    color: colors.primary,
    fontSize: sizes.lg,
    fontWeight: weights.bold,
  },
  helpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  helpText: {
    color: colors.text,
    fontSize: sizes.base,
    fontWeight: weights.medium,
    flex: 1,
  },
});
