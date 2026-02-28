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
import { formatPrice } from '../utils/helpers';

export default function ItemDetailScreen({ route, navigation }) {
  const { item, kitchen } = route.params;
  const { cart, cartKitchenId, addToCart, updateQuantity, clearCart, getCartTotal, getCartItemCount } = useStore();
  const [quantity, setQuantity] = useState(1);

  const existingItem = cart.find((i) => i.id === item.id);
  const currentQuantity = existingItem ? existingItem.quantity : 0;

  const handleAddToCart = () => {
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
              addToCart(item, kitchen.id, quantity);
              navigation.goBack();
            },
          },
        ]
      );
      return;
    }

    if (existingItem) {
      updateQuantity(item.id, currentQuantity + quantity);
    } else {
      addToCart(item, kitchen.id, quantity);
    }
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Image Header */}
        <View style={styles.imageContainer}>
          <MaterialIcons name="lunch-dining" size={60} color={colors.primary} />
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <MaterialIcons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          {/* Badges */}
          <View style={styles.badgeRow}>
            {item.ebtEligible && (
              <View style={styles.ebtBadge}>
                <MaterialIcons name="check-circle" size={14} color={colors.white} />
                <Text style={styles.ebtText}>EBT Eligible</Text>
              </View>
            )}
            {item.tags?.map((tag, index) => (
              <View key={index} style={styles.tagBadge}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>

          {/* Title & Price */}
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.price}>{formatPrice(item.price)}</Text>
          <Text style={styles.description}>{item.description}</Text>

          {/* Info Cards */}
          <View style={styles.infoRow}>
            <View style={styles.infoCard}>
              <MaterialIcons name="schedule" size={22} color={colors.info} />
              <Text style={styles.infoValue}>{item.prepTime}</Text>
              <Text style={styles.infoLabel}>Prep Time</Text>
            </View>
            <View style={styles.infoCard}>
              <MaterialIcons name="local-fire-department" size={22} color={colors.accent} />
              <Text style={styles.infoValue}>{item.calories}</Text>
              <Text style={styles.infoLabel}>Calories</Text>
            </View>
            <View style={styles.infoCard}>
              <MaterialIcons name="shopping-cart" size={22} color={colors.ebtGreen} />
              <Text style={styles.infoValue}>{formatPrice(item.groceryCost)}</Text>
              <Text style={styles.infoLabel}>Grocery Cost</Text>
            </View>
          </View>

          {/* How it's Made */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>How It's Made</Text>
            <View style={styles.processSteps}>
              <View style={styles.processStep}>
                <View style={[styles.processIcon, { backgroundColor: 'rgba(243, 156, 18, 0.15)' }]}>
                  <MaterialIcons name="shopping-basket" size={20} color="#f39c12" />
                </View>
                <View style={styles.processContent}>
                  <Text style={styles.processTitle}>Fresh Shopping</Text>
                  <Text style={styles.processDesc}>Our team shops for the freshest ingredients from local grocery stores</Text>
                </View>
              </View>
              <View style={styles.processLine} />
              <View style={styles.processStep}>
                <View style={[styles.processIcon, { backgroundColor: 'rgba(231, 76, 60, 0.15)' }]}>
                  <MaterialIcons name="restaurant" size={20} color="#e74c3c" />
                </View>
                <View style={styles.processContent}>
                  <Text style={styles.processTitle}>Chef Preparation</Text>
                  <Text style={styles.processDesc}>Professional chefs transform grocery ingredients into a gourmet meal</Text>
                </View>
              </View>
              <View style={styles.processLine} />
              <View style={styles.processStep}>
                <View style={[styles.processIcon, { backgroundColor: 'rgba(46, 204, 113, 0.15)' }]}>
                  <MaterialIcons name="delivery-dining" size={20} color="#2ecc71" />
                </View>
                <View style={styles.processContent}>
                  <Text style={styles.processTitle}>Delivered Hot</Text>
                  <Text style={styles.processDesc}>Your gourmet meal is delivered fresh and hot to your door</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Ingredients */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Grocery Ingredients</Text>
            <Text style={styles.ingredientsNote}>
              All ingredients are sourced from local grocery stores and are EBT eligible
            </Text>
            <View style={styles.ingredientsList}>
              {item.ingredients?.map((ingredient, index) => (
                <View key={index} style={styles.ingredientChip}>
                  <MaterialIcons name="check" size={14} color={colors.ebtGreen} />
                  <Text style={styles.ingredientText}>{ingredient}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Dietary */}
          {item.dietary && item.dietary.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Dietary Info</Text>
              <View style={styles.dietaryRow}>
                {item.dietary.map((diet, index) => (
                  <View key={index} style={styles.dietaryBadge}>
                    <MaterialIcons name="eco" size={14} color={colors.ebtGreen} />
                    <Text style={styles.dietaryText}>{diet}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Bottom Add to Cart */}
      <View style={styles.bottomBar}>
        <View style={styles.quantitySelector}>
          <TouchableOpacity
            style={styles.qtyButton}
            onPress={() => setQuantity(Math.max(1, quantity - 1))}
          >
            <MaterialIcons name="remove" size={20} color={colors.primary} />
          </TouchableOpacity>
          <Text style={styles.qtyText}>{quantity}</Text>
          <TouchableOpacity
            style={styles.qtyButton}
            onPress={() => setQuantity(Math.min(99, quantity + 1))}
          >
            <MaterialIcons name="add" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.addToCartButton} onPress={handleAddToCart}>
          <Text style={styles.addToCartText}>
            Add to Cart - {formatPrice(item.price * quantity)}
          </Text>
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
  imageContainer: {
    height: 220,
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
  content: {
    padding: spacing.base,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
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
  tagBadge: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  tagText: {
    color: colors.textSecondary,
    fontSize: sizes.xs,
  },
  name: {
    color: colors.text,
    fontSize: sizes.xxl,
    fontWeight: weights.bold,
  },
  price: {
    color: colors.primary,
    fontSize: sizes.xl,
    fontWeight: weights.bold,
    marginTop: spacing.xs,
  },
  description: {
    color: colors.textSecondary,
    fontSize: sizes.base,
    lineHeight: 24,
    marginTop: spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  infoCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoValue: {
    color: colors.text,
    fontSize: sizes.base,
    fontWeight: weights.bold,
    marginTop: spacing.xs,
  },
  infoLabel: {
    color: colors.textMuted,
    fontSize: sizes.xs,
    marginTop: 2,
  },
  section: {
    marginTop: spacing.xl,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: sizes.lg,
    fontWeight: weights.bold,
    marginBottom: spacing.md,
  },
  processSteps: {
    paddingLeft: spacing.sm,
  },
  processStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  processIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  processContent: {
    flex: 1,
    marginLeft: spacing.md,
  },
  processTitle: {
    color: colors.text,
    fontSize: sizes.base,
    fontWeight: weights.semibold,
  },
  processDesc: {
    color: colors.textSecondary,
    fontSize: sizes.sm,
    marginTop: 2,
    lineHeight: 20,
  },
  processLine: {
    width: 2,
    height: 20,
    backgroundColor: colors.border,
    marginLeft: 19,
    marginVertical: spacing.xs,
  },
  ingredientsNote: {
    color: colors.textMuted,
    fontSize: sizes.sm,
    marginBottom: spacing.md,
    fontStyle: 'italic',
  },
  ingredientsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  ingredientChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ingredientText: {
    color: colors.text,
    fontSize: sizes.sm,
    marginLeft: spacing.xs,
  },
  dietaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dietaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(46, 204, 113, 0.1)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  dietaryText: {
    color: colors.ebtGreen,
    fontSize: sizes.sm,
    fontWeight: weights.medium,
    marginLeft: spacing.xs,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    padding: spacing.base,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.md,
  },
  quantitySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  qtyButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  qtyText: {
    color: colors.text,
    fontSize: sizes.lg,
    fontWeight: weights.bold,
    minWidth: 28,
    textAlign: 'center',
  },
  addToCartButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.base,
  },
  addToCartText: {
    color: colors.black,
    fontSize: sizes.base,
    fontWeight: weights.bold,
  },
});
