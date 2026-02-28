import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, sizes, weights } from '../theme';

export default function KitchenCard({ kitchen, onPress, isFavorite, onToggleFavorite }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.imageContainer}>
        <View style={styles.imagePlaceholder}>
          <MaterialIcons name="restaurant" size={40} color={colors.primary} />
          <Text style={styles.imageText}>{kitchen.cuisineType}</Text>
        </View>
        {kitchen.featured && (
          <View style={styles.featuredBadge}>
            <MaterialIcons name="star" size={12} color={colors.black} />
            <Text style={styles.featuredText}>Featured</Text>
          </View>
        )}
        <View style={styles.ebtBadge}>
          <Text style={styles.ebtText}>EBT</Text>
        </View>
        <TouchableOpacity
          style={styles.favoriteButton}
          onPress={onToggleFavorite}
        >
          <MaterialIcons
            name={isFavorite ? 'favorite' : 'favorite-border'}
            size={22}
            color={isFavorite ? colors.accent : colors.white}
          />
        </TouchableOpacity>
      </View>
      <View style={styles.content}>
        <Text style={styles.name} numberOfLines={1}>{kitchen.name}</Text>
        <Text style={styles.subtitle} numberOfLines={1}>{kitchen.subtitle}</Text>
        <View style={styles.infoRow}>
          <View style={styles.ratingContainer}>
            <MaterialIcons name="star" size={16} color={colors.primary} />
            <Text style={styles.rating}>{kitchen.rating}</Text>
            <Text style={styles.reviewCount}>({kitchen.reviewCount})</Text>
          </View>
          <View style={styles.dot} />
          <View style={styles.deliveryInfo}>
            <MaterialIcons name="schedule" size={14} color={colors.textSecondary} />
            <Text style={styles.deliveryTime}>{kitchen.deliveryTime}</Text>
          </View>
          <View style={styles.dot} />
          <Text style={styles.freeDelivery}>Free Delivery</Text>
        </View>
        <View style={styles.tagsRow}>
          {kitchen.tags.slice(0, 3).map((tag, index) => (
            <View key={index} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.base,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  imageContainer: {
    height: 160,
    position: 'relative',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageText: {
    color: colors.textSecondary,
    fontSize: sizes.sm,
    marginTop: spacing.xs,
  },
  featuredBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  featuredText: {
    color: colors.black,
    fontSize: sizes.xs,
    fontWeight: weights.bold,
    marginLeft: 2,
  },
  ebtBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm + 36,
    backgroundColor: colors.ebtGreen,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  ebtText: {
    color: colors.white,
    fontSize: sizes.xs,
    fontWeight: weights.bold,
  },
  favoriteButton: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: borderRadius.full,
    padding: spacing.xs + 2,
  },
  content: {
    padding: spacing.md,
  },
  name: {
    color: colors.text,
    fontSize: sizes.lg,
    fontWeight: weights.bold,
  },
  subtitle: {
    color: colors.primary,
    fontSize: sizes.sm,
    fontWeight: weights.medium,
    marginTop: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rating: {
    color: colors.text,
    fontSize: sizes.md,
    fontWeight: weights.semibold,
    marginLeft: 4,
  },
  reviewCount: {
    color: colors.textSecondary,
    fontSize: sizes.sm,
    marginLeft: 2,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textMuted,
    marginHorizontal: spacing.sm,
  },
  deliveryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deliveryTime: {
    color: colors.textSecondary,
    fontSize: sizes.sm,
    marginLeft: 4,
  },
  freeDelivery: {
    color: colors.ebtGreen,
    fontSize: sizes.sm,
    fontWeight: weights.semibold,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  tag: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  tagText: {
    color: colors.textSecondary,
    fontSize: sizes.xs,
  },
});
