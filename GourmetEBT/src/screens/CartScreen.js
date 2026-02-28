import React from 'react';
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
import { ghostKitchens } from '../data/stores';
import { formatPrice } from '../utils/helpers';

export default function CartScreen({ navigation }) {
  const { cart, cartKitchenId, updateQuantity, removeFromCart, clearCart, getCartTotal } = useStore();

  const cartTotal = getCartTotal();
  const serviceFee = cartTotal > 0 ? 2.99 : 0;
  const tax = 0; // No tax on EBT-eligible grocery items
  const total = cartTotal + serviceFee + tax;

  const kitchen = ghostKitchens.find((k) => k.id === cartKitchenId);

  if (cart.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyContent}>
          <View style={styles.emptyIcon}>
            <MaterialIcons name="shopping-cart" size={60} color={colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>Your Cart is Empty</Text>
          <Text style={styles.emptySubtext}>
            Browse our gourmet kitchens and add some chef-prepared meals!
          </Text>
          <TouchableOpacity
            style={styles.browseButton}
            onPress={() => navigation.navigate('HomeTab')}
          >
            <Text style={styles.browseButtonText}>Browse Kitchens</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Your Cart</Text>
        <TouchableOpacity
          onPress={() => {
            Alert.alert('Clear Cart', 'Remove all items from your cart?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Clear', style: 'destructive', onPress: clearCart },
            ]);
          }}
        >
          <Text style={styles.clearText}>Clear All</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Kitchen Info */}
        {kitchen && (
          <View style={styles.kitchenBanner}>
            <MaterialIcons name="restaurant" size={20} color={colors.primary} />
            <View style={styles.kitchenInfo}>
              <Text style={styles.kitchenName}>{kitchen.name}</Text>
              <Text style={styles.kitchenDelivery}>{kitchen.deliveryTime} delivery</Text>
            </View>
          </View>
        )}

        {/* Cart Items */}
        <View style={styles.itemsSection}>
          {cart.map((item) => (
            <View key={item.id} style={styles.cartItem}>
              <View style={styles.itemImagePlaceholder}>
                <MaterialIcons name="lunch-dining" size={24} color={colors.primary} />
              </View>
              <View style={styles.itemContent}>
                <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                <View style={styles.itemPriceRow}>
                  <Text style={styles.itemPrice}>{formatPrice(item.price)}</Text>
                  {item.ebtEligible && (
                    <View style={styles.ebtMini}>
                      <Text style={styles.ebtMiniText}>EBT</Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={styles.quantityControls}>
                <TouchableOpacity
                  style={styles.qtyBtn}
                  onPress={() => updateQuantity(item.id, item.quantity - 1)}
                >
                  <MaterialIcons
                    name={item.quantity === 1 ? 'delete-outline' : 'remove'}
                    size={18}
                    color={item.quantity === 1 ? colors.accent : colors.primary}
                  />
                </TouchableOpacity>
                <Text style={styles.qtyText}>{item.quantity}</Text>
                <TouchableOpacity
                  style={styles.qtyBtn}
                  onPress={() => updateQuantity(item.id, item.quantity + 1)}
                >
                  <MaterialIcons name="add" size={18} color={colors.primary} />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>

        {/* Order Summary */}
        <View style={styles.summarySection}>
          <Text style={styles.summaryTitle}>Order Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal</Text>
            <Text style={styles.summaryValue}>{formatPrice(cartTotal)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Service Fee</Text>
            <Text style={styles.summaryValue}>{formatPrice(serviceFee)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Tax</Text>
            <Text style={styles.summaryValue}>{formatPrice(tax)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Delivery</Text>
            <Text style={styles.freeDelivery}>FREE</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.summaryRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatPrice(total)}</Text>
          </View>

          {/* EBT Notice */}
          <View style={styles.ebtNotice}>
            <MaterialIcons name="info-outline" size={16} color={colors.ebtGreen} />
            <Text style={styles.ebtNoticeText}>
              All items in your cart are EBT eligible. Grocery ingredients are purchased with EBT and professionally prepared by our chefs.
            </Text>
          </View>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Checkout Button */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.checkoutButton}
          onPress={() => navigation.navigate('Checkout', { total })}
        >
          <MaterialIcons name="lock" size={20} color={colors.black} />
          <Text style={styles.checkoutText}>Proceed to Checkout</Text>
          <Text style={styles.checkoutTotal}>{formatPrice(total)}</Text>
        </TouchableOpacity>
      </View>
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
  emptyContent: {
    alignItems: 'center',
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: borderRadius.full,
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
    lineHeight: 22,
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
  clearText: {
    color: colors.accent,
    fontSize: sizes.md,
    fontWeight: weights.semibold,
  },
  kitchenBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    marginHorizontal: spacing.base,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  kitchenInfo: {
    marginLeft: spacing.md,
  },
  kitchenName: {
    color: colors.text,
    fontSize: sizes.base,
    fontWeight: weights.semibold,
  },
  kitchenDelivery: {
    color: colors.textSecondary,
    fontSize: sizes.sm,
    marginTop: 2,
  },
  itemsSection: {
    padding: spacing.base,
  },
  cartItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  itemImagePlaceholder: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemContent: {
    flex: 1,
    marginLeft: spacing.md,
  },
  itemName: {
    color: colors.text,
    fontSize: sizes.md,
    fontWeight: weights.semibold,
  },
  itemPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  itemPrice: {
    color: colors.primary,
    fontSize: sizes.base,
    fontWeight: weights.bold,
  },
  ebtMini: {
    backgroundColor: colors.ebtGreen,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    marginLeft: spacing.sm,
  },
  ebtMiniText: {
    color: colors.white,
    fontSize: 8,
    fontWeight: weights.bold,
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.sm,
  },
  qtyBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  qtyText: {
    color: colors.text,
    fontSize: sizes.base,
    fontWeight: weights.bold,
    minWidth: 24,
    textAlign: 'center',
  },
  summarySection: {
    marginHorizontal: spacing.base,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryTitle: {
    color: colors.text,
    fontSize: sizes.lg,
    fontWeight: weights.bold,
    marginBottom: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  summaryLabel: {
    color: colors.textSecondary,
    fontSize: sizes.md,
  },
  summaryValue: {
    color: colors.text,
    fontSize: sizes.md,
  },
  freeDelivery: {
    color: colors.ebtGreen,
    fontSize: sizes.md,
    fontWeight: weights.bold,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
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
  ebtNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(46, 204, 113, 0.08)',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  ebtNoticeText: {
    color: colors.textSecondary,
    fontSize: sizes.sm,
    flex: 1,
    marginLeft: spacing.sm,
    lineHeight: 20,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.base,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  checkoutButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.base,
    gap: spacing.sm,
  },
  checkoutText: {
    color: colors.black,
    fontSize: sizes.base,
    fontWeight: weights.bold,
  },
  checkoutTotal: {
    color: colors.black,
    fontSize: sizes.base,
    fontWeight: weights.bold,
    opacity: 0.8,
  },
});
