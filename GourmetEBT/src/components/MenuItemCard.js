import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, sizes, weights } from '../theme';
import { formatPrice } from '../utils/helpers';

export default function MenuItemCard({ item, onPress, onAddToCart, cartQuantity = 0 }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.imagePlaceholder}>
        <MaterialIcons name="lunch-dining" size={32} color={colors.primary} />
      </View>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
          {item.ebtEligible && (
            <View style={styles.ebtBadge}>
              <Text style={styles.ebtText}>EBT</Text>
            </View>
          )}
        </View>
        <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
        <View style={styles.tagsRow}>
          {item.tags?.map((tag, index) => (
            <View key={index} style={[styles.tag, tag === 'Best Seller' && styles.tagHighlight]}>
              <Text style={[styles.tagText, tag === 'Best Seller' && styles.tagTextHighlight]}>
                {tag}
              </Text>
            </View>
          ))}
        </View>
        <View style={styles.footer}>
          <View style={styles.priceContainer}>
            <Text style={styles.price}>{formatPrice(item.price)}</Text>
            <Text style={styles.prepTime}>
              <MaterialIcons name="schedule" size={12} color={colors.textMuted} /> {item.prepTime}
            </Text>
          </View>
          {cartQuantity > 0 ? (
            <View style={styles.quantityControls}>
              <TouchableOpacity
                style={styles.quantityButton}
                onPress={() => onAddToCart(item, -1)}
              >
                <MaterialIcons name="remove" size={18} color={colors.primary} />
              </TouchableOpacity>
              <Text style={styles.quantity}>{cartQuantity}</Text>
              <TouchableOpacity
                style={styles.quantityButton}
                onPress={() => onAddToCart(item, 1)}
              >
                <MaterialIcons name="add" size={18} color={colors.primary} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => onAddToCart(item, 1)}
            >
              <MaterialIcons name="add" size={20} color={colors.black} />
              <Text style={styles.addButtonText}>Add</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  imagePlaceholder: {
    width: 110,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  name: {
    color: colors.text,
    fontSize: sizes.base,
    fontWeight: weights.bold,
    flex: 1,
  },
  ebtBadge: {
    backgroundColor: colors.ebtGreen,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    marginLeft: spacing.sm,
  },
  ebtText: {
    color: colors.white,
    fontSize: 9,
    fontWeight: weights.bold,
  },
  description: {
    color: colors.textSecondary,
    fontSize: sizes.sm,
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  tagsRow: {
    flexDirection: 'row',
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  tag: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tagHighlight: {
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
  },
  tagText: {
    color: colors.textMuted,
    fontSize: 10,
  },
  tagTextHighlight: {
    color: colors.primary,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  priceContainer: {
    flexDirection: 'column',
  },
  price: {
    color: colors.primary,
    fontSize: sizes.lg,
    fontWeight: weights.bold,
  },
  prepTime: {
    color: colors.textMuted,
    fontSize: sizes.xs,
    marginTop: 2,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  addButtonText: {
    color: colors.black,
    fontSize: sizes.md,
    fontWeight: weights.bold,
    marginLeft: 4,
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  quantityButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  quantity: {
    color: colors.text,
    fontSize: sizes.base,
    fontWeight: weights.bold,
    minWidth: 24,
    textAlign: 'center',
  },
});
