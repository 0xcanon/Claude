import React from 'react';
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
  formatDate,
  getOrderStatusText,
  getOrderStatusColor,
  getOrderStatusIcon,
  getTimeAgo,
  hexToRgba,
} from '../utils/helpers';

export default function OrdersScreen({ navigation }) {
  const { orders, activeOrder } = useStore();

  if (orders.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIcon}>
          <MaterialIcons name="receipt-long" size={60} color={colors.textMuted} />
        </View>
        <Text style={styles.emptyTitle}>No Orders Yet</Text>
        <Text style={styles.emptySubtext}>
          Your gourmet meals will appear here after you place an order
        </Text>
        <TouchableOpacity
          style={styles.browseButton}
          onPress={() => navigation.navigate('HomeTab')}
        >
          <Text style={styles.browseButtonText}>Browse Kitchens</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Orders</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Active Order */}
        {activeOrder && activeOrder.status !== 'delivered' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Active Order</Text>
            <TouchableOpacity
              style={styles.activeOrderCard}
              onPress={() => navigation.navigate('OrderTracking', { order: activeOrder })}
            >
              <View style={styles.activeOrderHeader}>
                <View style={[styles.statusBadge, { backgroundColor: getOrderStatusColor(activeOrder.status) }]}>
                  <MaterialIcons
                    name={getOrderStatusIcon(activeOrder.status)}
                    size={16}
                    color={colors.white}
                  />
                  <Text style={styles.statusText}>
                    {getOrderStatusText(activeOrder.status)}
                  </Text>
                </View>
                <Text style={styles.activeOrderId}>{activeOrder.id}</Text>
              </View>

              {/* Progress Bar */}
              <View style={styles.progressContainer}>
                {['confirmed', 'shopping', 'preparing', 'cooking', 'ready', 'delivering', 'delivered'].map((step, index, arr) => {
                  const fullFlow = ['confirmed', 'shopping', 'preparing', 'cooking', 'ready', 'delivering', 'delivered'];
                  const currentIndex = fullFlow.indexOf(activeOrder.status);
                  const isActive = index <= currentIndex;
                  return (
                    <View key={step} style={styles.progressStep}>
                      <View style={[styles.progressDot, isActive && styles.progressDotActive]} />
                      {index < arr.length - 1 && (
                        <View style={[styles.progressLine, isActive && styles.progressLineActive]} />
                      )}
                    </View>
                  );
                })}
              </View>
              <View style={styles.progressLabels}>
                <Text style={styles.progressLabel}>Order</Text>
                <Text style={styles.progressLabel}>Shop</Text>
                <Text style={styles.progressLabel}>Prep</Text>
                <Text style={styles.progressLabel}>Cook</Text>
                <Text style={styles.progressLabel}>Ready</Text>
                <Text style={styles.progressLabel}>Transit</Text>
                <Text style={styles.progressLabel}>Done</Text>
              </View>

              <View style={styles.activeOrderItems}>
                {activeOrder.items.slice(0, 2).map((item) => (
                  <Text key={item.id} style={styles.activeItemText}>
                    {item.quantity}x {item.name}
                  </Text>
                ))}
                {activeOrder.items.length > 2 && (
                  <Text style={styles.moreItems}>
                    +{activeOrder.items.length - 2} more items
                  </Text>
                )}
              </View>

              <View style={styles.activeOrderFooter}>
                <Text style={styles.activeTotal}>{formatPrice(activeOrder.total)}</Text>
                <View style={styles.trackLink}>
                  <Text style={styles.trackLinkText}>Track Order</Text>
                  <MaterialIcons name="arrow-forward" size={16} color={colors.primary} />
                </View>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Past Orders */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order History</Text>
          {orders.map((order) => {
            const kitchen = ghostKitchens.find((k) => k.id === order.kitchenId);
            return (
              <TouchableOpacity
                key={order.id}
                style={styles.orderCard}
                onPress={() => navigation.navigate('OrderTracking', { order })}
              >
                <View style={styles.orderHeader}>
                  <View>
                    <Text style={styles.orderKitchen}>
                      {kitchen?.name || 'Unknown Kitchen'}
                    </Text>
                    <Text style={styles.orderDate}>
                      {formatDate(order.createdAt)} at {formatTime(order.createdAt)}
                    </Text>
                  </View>
                  <View style={[
                    styles.miniStatusBadge,
                    { backgroundColor: hexToRgba(getOrderStatusColor(order.status), 0.15) }
                  ]}>
                    <Text style={[
                      styles.miniStatusText,
                      { color: getOrderStatusColor(order.status) }
                    ]}>
                      {getOrderStatusText(order.status)}
                    </Text>
                  </View>
                </View>

                <View style={styles.orderItems}>
                  {order.items.map((item) => (
                    <Text key={item.id} style={styles.orderItemText}>
                      {item.quantity}x {item.name}
                    </Text>
                  ))}
                </View>

                <View style={styles.orderFooter}>
                  <Text style={styles.orderTotal}>{formatPrice(order.total)}</Text>
                  {order.paymentMethod === 'ebt' && (
                    <View style={styles.ebtBadge}>
                      <Text style={styles.ebtText}>Paid with EBT</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: sizes.xl,
    fontWeight: weights.bold,
  },
  emptySubtext: {
    color: colors.textSecondary,
    fontSize: sizes.base,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  browseButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    marginTop: spacing.xl,
  },
  browseButtonText: {
    color: colors.black,
    fontSize: sizes.base,
    fontWeight: weights.bold,
  },
  header: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.base,
  },
  headerTitle: {
    color: colors.text,
    fontSize: sizes.xl,
    fontWeight: weights.bold,
  },
  section: {
    padding: spacing.base,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: sizes.lg,
    fontWeight: weights.bold,
    marginBottom: spacing.md,
  },
  activeOrderCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  activeOrderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    gap: 4,
  },
  statusText: {
    color: colors.white,
    fontSize: sizes.sm,
    fontWeight: weights.bold,
  },
  activeOrderId: {
    color: colors.textSecondary,
    fontSize: sizes.sm,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  progressStep: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.textMuted,
  },
  progressDotActive: {
    backgroundColor: colors.primary,
  },
  progressLine: {
    flex: 1,
    height: 2,
    backgroundColor: colors.textMuted,
  },
  progressLineActive: {
    backgroundColor: colors.primary,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  progressLabel: {
    color: colors.textMuted,
    fontSize: 9,
  },
  activeOrderItems: {
    marginBottom: spacing.md,
  },
  activeItemText: {
    color: colors.textSecondary,
    fontSize: sizes.md,
    marginBottom: 2,
  },
  moreItems: {
    color: colors.textMuted,
    fontSize: sizes.sm,
    fontStyle: 'italic',
  },
  activeOrderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  activeTotal: {
    color: colors.primary,
    fontSize: sizes.lg,
    fontWeight: weights.bold,
  },
  trackLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  trackLinkText: {
    color: colors.primary,
    fontSize: sizes.md,
    fontWeight: weights.semibold,
  },
  orderCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  orderKitchen: {
    color: colors.text,
    fontSize: sizes.base,
    fontWeight: weights.bold,
  },
  orderDate: {
    color: colors.textSecondary,
    fontSize: sizes.sm,
    marginTop: 2,
  },
  miniStatusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  miniStatusText: {
    fontSize: sizes.xs,
    fontWeight: weights.bold,
  },
  orderItems: {
    marginBottom: spacing.md,
  },
  orderItemText: {
    color: colors.textSecondary,
    fontSize: sizes.sm,
    marginBottom: 2,
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  orderTotal: {
    color: colors.primary,
    fontSize: sizes.base,
    fontWeight: weights.bold,
  },
  ebtBadge: {
    backgroundColor: 'rgba(46, 204, 113, 0.1)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  ebtText: {
    color: colors.ebtGreen,
    fontSize: sizes.xs,
    fontWeight: weights.bold,
  },
});
