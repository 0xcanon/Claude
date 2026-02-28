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
import { getMenuByKitchen, getMenuCategories } from '../data/menuItems';
import { useStore } from '../store/useStore';
import MenuItemCard from '../components/MenuItemCard';
import { formatPrice } from '../utils/helpers';

export default function KitchenDetailScreen({ route, navigation }) {
  const { kitchen } = route.params;
  const menuItems = getMenuByKitchen(kitchen.id);
  const menuCategories = getMenuCategories(kitchen.id);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const { cart, cartKitchenId, addToCart, updateQuantity, clearCart, favorites, toggleFavorite, getCartTotal, getCartItemCount } = useStore();

  const filteredItems = selectedCategory === 'All'
    ? menuItems
    : menuItems.filter((item) => item.category === selectedCategory);

  const cartItemCount = getCartItemCount();
  const cartTotal = getCartTotal();
  const isFavorite = favorites.includes(kitchen.id);

  const handleAddToCart = (item, delta) => {
    if (cartKitchenId && cartKitchenId !== kitchen.id) {
      Alert.alert(
        'Different Kitchen',
        'Your cart has items from another kitchen. Would you like to clear it and add from this kitchen?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Clear & Add',
            style: 'destructive',
            onPress: () => {
              clearCart();
              addToCart(item, kitchen.id);
            },
          },
        ]
      );
      return;
    }

    const existingItem = cart.find((i) => i.id === item.id);
    if (existingItem) {
      updateQuantity(item.id, existingItem.quantity + delta);
    } else {
      addToCart(item, kitchen.id);
    }
  };

  const getItemCartQuantity = (itemId) => {
    const item = cart.find((i) => i.id === itemId);
    return item ? item.quantity : 0;
  };

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Kitchen Header */}
        <View style={styles.headerImage}>
          <MaterialIcons name="restaurant" size={60} color={colors.primary} />
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <MaterialIcons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.heartButton}
            onPress={() => toggleFavorite(kitchen.id)}
          >
            <MaterialIcons
              name={isFavorite ? 'favorite' : 'favorite-border'}
              size={24}
              color={isFavorite ? colors.accent : colors.text}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.kitchenInfo}>
          <View style={styles.ebtRow}>
            <View style={styles.ebtBadge}>
              <MaterialIcons name="check-circle" size={14} color={colors.white} />
              <Text style={styles.ebtText}>EBT Accepted</Text>
            </View>
            <View style={styles.freeBadge}>
              <Text style={styles.freeText}>Free Delivery</Text>
            </View>
          </View>
          <Text style={styles.kitchenName}>{kitchen.name}</Text>
          <Text style={styles.kitchenSubtitle}>{kitchen.subtitle}</Text>
          <Text style={styles.kitchenDescription}>{kitchen.description}</Text>

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <MaterialIcons name="star" size={20} color={colors.primary} />
              <Text style={styles.statValue}>{kitchen.rating}</Text>
              <Text style={styles.statLabel}>({kitchen.reviewCount})</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <MaterialIcons name="schedule" size={20} color={colors.info} />
              <Text style={styles.statValue}>{kitchen.deliveryTime}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <MaterialIcons name="delivery-dining" size={20} color={colors.ebtGreen} />
              <Text style={styles.statValue}>Free</Text>
            </View>
          </View>

          {/* Ghost Kitchen Explanation */}
          <View style={styles.ghostBanner}>
            <MaterialIcons name="info-outline" size={18} color={colors.primary} />
            <Text style={styles.ghostText}>
              Our chefs shop for the freshest grocery ingredients and prepare your meal from scratch. 100% EBT eligible.
            </Text>
          </View>
        </View>

        {/* Category Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryScroll}
          contentContainerStyle={styles.categoryContent}
        >
          {menuCategories.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[
                styles.categoryTab,
                selectedCategory === cat && styles.categoryTabActive,
              ]}
              onPress={() => setSelectedCategory(cat)}
            >
              <Text
                style={[
                  styles.categoryTabText,
                  selectedCategory === cat && styles.categoryTabTextActive,
                ]}
              >
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Menu Items */}
        <View style={styles.menuSection}>
          <Text style={styles.menuTitle}>
            {selectedCategory === 'All' ? 'Full Menu' : selectedCategory}
          </Text>
          {filteredItems.map((item) => (
            <MenuItemCard
              key={item.id}
              item={item}
              onPress={() => navigation.navigate('ItemDetail', { item, kitchen })}
              onAddToCart={(item, delta) => handleAddToCart(item, delta)}
              cartQuantity={getItemCartQuantity(item.id)}
            />
          ))}
        </View>

        <View style={{ height: cartItemCount > 0 ? 120 : 40 }} />
      </ScrollView>

      {/* Cart Bar */}
      {cartItemCount > 0 && (
        <View style={styles.cartBar}>
          <TouchableOpacity
            style={styles.cartButton}
            onPress={() => navigation.navigate('CartTab')}
          >
            <View style={styles.cartLeft}>
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{cartItemCount}</Text>
              </View>
              <Text style={styles.cartButtonText}>View Cart</Text>
            </View>
            <Text style={styles.cartTotal}>{formatPrice(cartTotal)}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerImage: {
    height: 200,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButton: {
    position: 'absolute',
    top: spacing.xxxl,
    left: spacing.base,
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heartButton: {
    position: 'absolute',
    top: spacing.xxxl,
    right: spacing.base,
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  kitchenInfo: {
    padding: spacing.base,
  },
  ebtRow: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  ebtBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.ebtGreen,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  ebtText: {
    color: colors.white,
    fontSize: sizes.xs,
    fontWeight: weights.bold,
    marginLeft: 4,
  },
  freeBadge: {
    backgroundColor: 'rgba(52, 152, 219, 0.15)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  freeText: {
    color: colors.info,
    fontSize: sizes.xs,
    fontWeight: weights.bold,
  },
  kitchenName: {
    color: colors.text,
    fontSize: sizes.xxl,
    fontWeight: weights.bold,
  },
  kitchenSubtitle: {
    color: colors.primary,
    fontSize: sizes.base,
    fontWeight: weights.medium,
    marginTop: spacing.xs,
  },
  kitchenDescription: {
    color: colors.textSecondary,
    fontSize: sizes.md,
    lineHeight: 22,
    marginTop: spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginTop: spacing.base,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statValue: {
    color: colors.text,
    fontSize: sizes.base,
    fontWeight: weights.bold,
    marginLeft: spacing.xs,
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: sizes.sm,
    marginLeft: 2,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.border,
  },
  ghostBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(212, 175, 55, 0.08)',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.2)',
  },
  ghostText: {
    color: colors.textSecondary,
    fontSize: sizes.sm,
    flex: 1,
    marginLeft: spacing.sm,
    lineHeight: 20,
  },
  categoryScroll: {
    marginTop: spacing.base,
  },
  categoryContent: {
    paddingHorizontal: spacing.base,
  },
  categoryTab: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    marginRight: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryTabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryTabText: {
    color: colors.textSecondary,
    fontSize: sizes.md,
    fontWeight: weights.medium,
  },
  categoryTabTextActive: {
    color: colors.black,
    fontWeight: weights.bold,
  },
  menuSection: {
    padding: spacing.base,
    paddingTop: spacing.lg,
  },
  menuTitle: {
    color: colors.text,
    fontSize: sizes.lg,
    fontWeight: weights.bold,
    marginBottom: spacing.md,
  },
  cartBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.base,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cartButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.base,
  },
  cartLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cartBadge: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: borderRadius.full,
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  cartBadgeText: {
    color: colors.white,
    fontSize: sizes.sm,
    fontWeight: weights.bold,
  },
  cartButtonText: {
    color: colors.black,
    fontSize: sizes.base,
    fontWeight: weights.bold,
  },
  cartTotal: {
    color: colors.black,
    fontSize: sizes.lg,
    fontWeight: weights.bold,
  },
});
