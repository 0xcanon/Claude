import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, sizes, weights } from '../theme';
import { useStore } from '../store/useStore';
import { formatPrice, getTimeAgo, getOrderStatusColor } from '../utils/helpers';

const STATUS_FLOW = ['shopping', 'preparing', 'cooking', 'ready', 'delivering', 'delivered'];

export default function ChefDashboardScreen({ navigation }) {
  const { kitchenOrders, updateKitchenOrderStatus } = useStore();
  const [selectedTab, setSelectedTab] = useState('active');

  const activeOrders = kitchenOrders.filter(
    (o) => !['delivered', 'cancelled'].includes(o.status)
  );
  const completedOrders = kitchenOrders.filter(
    (o) => ['delivered', 'cancelled'].includes(o.status)
  );

  const displayOrders = selectedTab === 'active' ? activeOrders : completedOrders;

  const handleAdvanceStatus = (order) => {
    const currentIndex = STATUS_FLOW.indexOf(order.status);
    if (currentIndex < STATUS_FLOW.length - 1) {
      const nextStatus = STATUS_FLOW[currentIndex + 1];
      Alert.alert(
        'Update Order Status',
        `Move order ${order.id} to "${nextStatus}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Update',
            onPress: () => updateKitchenOrderStatus(order.id, nextStatus),
          },
        ]
      );
    }
  };

  const getStatusAction = (status) => {
    const actions = {
      shopping: 'Start Preparing',
      preparing: 'Start Cooking',
      cooking: 'Mark Ready',
      ready: 'Send for Delivery',
      delivering: 'Mark Delivered',
    };
    return actions[status] || null;
  };

  const getStatusEmoji = (status) => {
    const emojis = {
      shopping: 'shopping-cart',
      preparing: 'kitchen',
      cooking: 'local-fire-department',
      ready: 'check-circle',
      delivering: 'delivery-dining',
      delivered: 'done-all',
    };
    return emojis[status] || 'help';
  };

  // Dashboard stats
  const totalRevenue = kitchenOrders.reduce((t, o) => t + o.total, 0);
  const totalOrders = kitchenOrders.length;
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chef Dashboard</Text>
        <View style={styles.headerBadge}>
          <MaterialIcons name="restaurant" size={14} color={colors.black} />
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Stats */}
        <View style={styles.statsSection}>
          <View style={styles.statCard}>
            <MaterialIcons name="receipt" size={24} color={colors.primary} />
            <Text style={styles.statValue}>{activeOrders.length}</Text>
            <Text style={styles.statLabel}>Active Orders</Text>
          </View>
          <View style={styles.statCard}>
            <MaterialIcons name="attach-money" size={24} color={colors.ebtGreen} />
            <Text style={styles.statValue}>{formatPrice(totalRevenue)}</Text>
            <Text style={styles.statLabel}>Total Revenue</Text>
          </View>
          <View style={styles.statCard}>
            <MaterialIcons name="trending-up" size={24} color={colors.info} />
            <Text style={styles.statValue}>{formatPrice(avgOrderValue)}</Text>
            <Text style={styles.statLabel}>Avg Order</Text>
          </View>
        </View>

        {/* Workflow Overview */}
        <View style={styles.workflowSection}>
          <Text style={styles.sectionTitle}>Kitchen Workflow</Text>
          <View style={styles.workflowRow}>
            <View style={styles.workflowStep}>
              <View style={[styles.workflowIcon, { backgroundColor: 'rgba(243, 156, 18, 0.15)' }]}>
                <MaterialIcons name="shopping-cart" size={20} color="#f39c12" />
              </View>
              <Text style={styles.workflowCount}>
                {kitchenOrders.filter(o => o.status === 'shopping').length}
              </Text>
              <Text style={styles.workflowLabel}>Shopping</Text>
            </View>
            <MaterialIcons name="arrow-forward" size={14} color={colors.textMuted} />
            <View style={styles.workflowStep}>
              <View style={[styles.workflowIcon, { backgroundColor: 'rgba(230, 126, 34, 0.15)' }]}>
                <MaterialIcons name="kitchen" size={20} color="#e67e22" />
              </View>
              <Text style={styles.workflowCount}>
                {kitchenOrders.filter(o => o.status === 'preparing').length}
              </Text>
              <Text style={styles.workflowLabel}>Prepping</Text>
            </View>
            <MaterialIcons name="arrow-forward" size={14} color={colors.textMuted} />
            <View style={styles.workflowStep}>
              <View style={[styles.workflowIcon, { backgroundColor: 'rgba(231, 76, 60, 0.15)' }]}>
                <MaterialIcons name="local-fire-department" size={20} color="#e74c3c" />
              </View>
              <Text style={styles.workflowCount}>
                {kitchenOrders.filter(o => o.status === 'cooking').length}
              </Text>
              <Text style={styles.workflowLabel}>Cooking</Text>
            </View>
            <MaterialIcons name="arrow-forward" size={14} color={colors.textMuted} />
            <View style={styles.workflowStep}>
              <View style={[styles.workflowIcon, { backgroundColor: 'rgba(46, 204, 113, 0.15)' }]}>
                <MaterialIcons name="check-circle" size={20} color="#2ecc71" />
              </View>
              <Text style={styles.workflowCount}>
                {kitchenOrders.filter(o => o.status === 'ready').length}
              </Text>
              <Text style={styles.workflowLabel}>Ready</Text>
            </View>
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabsRow}>
          <TouchableOpacity
            style={[styles.tab, selectedTab === 'active' && styles.tabActive]}
            onPress={() => setSelectedTab('active')}
          >
            <Text style={[styles.tabText, selectedTab === 'active' && styles.tabTextActive]}>
              Active ({activeOrders.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, selectedTab === 'completed' && styles.tabActive]}
            onPress={() => setSelectedTab('completed')}
          >
            <Text style={[styles.tabText, selectedTab === 'completed' && styles.tabTextActive]}>
              Completed ({completedOrders.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Orders List */}
        <View style={styles.ordersSection}>
          {displayOrders.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons
                name={selectedTab === 'active' ? 'pending-actions' : 'history'}
                size={48}
                color={colors.textMuted}
              />
              <Text style={styles.emptyText}>
                No {selectedTab} orders
              </Text>
            </View>
          ) : (
            displayOrders.map((order) => (
              <View key={order.id} style={styles.orderCard}>
                {/* Order Header */}
                <View style={styles.orderHeader}>
                  <View>
                    <Text style={styles.orderId}>{order.id}</Text>
                    <Text style={styles.orderCustomer}>{order.customerName}</Text>
                  </View>
                  <View style={styles.orderHeaderRight}>
                    <View style={[styles.statusBadge, { backgroundColor: getOrderStatusColor(order.status) }]}>
                      <MaterialIcons name={getStatusEmoji(order.status)} size={14} color={colors.white} />
                      <Text style={styles.statusText}>{order.status}</Text>
                    </View>
                    <Text style={styles.orderTime}>{getTimeAgo(order.createdAt)}</Text>
                  </View>
                </View>

                {/* Items */}
                <View style={styles.orderItems}>
                  {order.items.map((item, index) => (
                    <View key={index} style={styles.orderItem}>
                      <Text style={styles.itemQty}>{item.quantity}x</Text>
                      <Text style={styles.itemName}>{item.name}</Text>
                      <Text style={styles.itemPrice}>{formatPrice(item.price * item.quantity)}</Text>
                    </View>
                  ))}
                </View>

                {/* Grocery List */}
                <View style={styles.grocerySection}>
                  <TouchableOpacity style={styles.groceryHeader}>
                    <MaterialIcons name="shopping-basket" size={18} color={colors.primary} />
                    <Text style={styles.groceryTitle}>Shopping List</Text>
                  </TouchableOpacity>
                  <View style={styles.groceryList}>
                    {order.groceryList.map((item, index) => (
                      <View key={index} style={styles.groceryItem}>
                        <MaterialIcons name="check-box-outline-blank" size={16} color={colors.textMuted} />
                        <Text style={styles.groceryText}>{item}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {/* Footer */}
                <View style={styles.orderFooter}>
                  <View>
                    <Text style={styles.orderTotal}>{formatPrice(order.total)}</Text>
                    {order.paymentMethod === 'ebt' && (
                      <Text style={styles.ebtPaid}>Paid via EBT</Text>
                    )}
                  </View>
                  {getStatusAction(order.status) && (
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => handleAdvanceStatus(order)}
                    >
                      <Text style={styles.actionText}>{getStatusAction(order.status)}</Text>
                      <MaterialIcons name="arrow-forward" size={16} color={colors.black} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))
          )}
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
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.base,
    gap: spacing.md,
  },
  headerTitle: {
    flex: 1,
    color: colors.text,
    fontSize: sizes.xl,
    fontWeight: weights.bold,
  },
  headerBadge: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.full,
    padding: spacing.sm,
  },
  statsSection: {
    flexDirection: 'row',
    paddingHorizontal: spacing.base,
    gap: spacing.sm,
    marginBottom: spacing.base,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: {
    color: colors.text,
    fontSize: sizes.lg,
    fontWeight: weights.bold,
    marginTop: spacing.sm,
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: sizes.xs,
    marginTop: 2,
  },
  workflowSection: {
    paddingHorizontal: spacing.base,
    marginBottom: spacing.base,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: sizes.lg,
    fontWeight: weights.bold,
    marginBottom: spacing.md,
  },
  workflowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.border,
  },
  workflowStep: {
    alignItems: 'center',
  },
  workflowIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  workflowCount: {
    color: colors.text,
    fontSize: sizes.lg,
    fontWeight: weights.bold,
    marginTop: spacing.xs,
  },
  workflowLabel: {
    color: colors.textMuted,
    fontSize: sizes.xs,
  },
  tabsRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.base,
    marginBottom: spacing.base,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    color: colors.textSecondary,
    fontSize: sizes.md,
    fontWeight: weights.semibold,
  },
  tabTextActive: {
    color: colors.black,
  },
  ordersSection: {
    paddingHorizontal: spacing.base,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: sizes.base,
    marginTop: spacing.md,
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
    marginBottom: spacing.md,
  },
  orderId: {
    color: colors.primary,
    fontSize: sizes.md,
    fontWeight: weights.bold,
  },
  orderCustomer: {
    color: colors.text,
    fontSize: sizes.base,
    fontWeight: weights.semibold,
    marginTop: 2,
  },
  orderHeaderRight: {
    alignItems: 'flex-end',
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
    fontSize: sizes.xs,
    fontWeight: weights.bold,
    textTransform: 'capitalize',
  },
  orderTime: {
    color: colors.textMuted,
    fontSize: sizes.xs,
    marginTop: 4,
  },
  orderItems: {
    marginBottom: spacing.md,
  },
  orderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  itemQty: {
    color: colors.primary,
    fontSize: sizes.md,
    fontWeight: weights.bold,
    width: 28,
  },
  itemName: {
    color: colors.text,
    fontSize: sizes.md,
    flex: 1,
  },
  itemPrice: {
    color: colors.textSecondary,
    fontSize: sizes.md,
  },
  grocerySection: {
    backgroundColor: 'rgba(212, 175, 55, 0.05)',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  groceryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  groceryTitle: {
    color: colors.primary,
    fontSize: sizes.md,
    fontWeight: weights.bold,
    marginLeft: spacing.sm,
  },
  groceryList: {
    gap: spacing.xs,
  },
  groceryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  groceryText: {
    color: colors.textSecondary,
    fontSize: sizes.sm,
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
    fontSize: sizes.lg,
    fontWeight: weights.bold,
  },
  ebtPaid: {
    color: colors.ebtGreen,
    fontSize: sizes.xs,
    fontWeight: weights.bold,
    marginTop: 2,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    gap: spacing.xs,
  },
  actionText: {
    color: colors.black,
    fontSize: sizes.sm,
    fontWeight: weights.bold,
  },
});
