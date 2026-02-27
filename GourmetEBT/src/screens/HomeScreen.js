import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StatusBar,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, sizes, weights } from '../theme';
import { ghostKitchens, categories } from '../data/stores';
import { useStore } from '../store/useStore';
import KitchenCard from '../components/KitchenCard';
import EbtBanner from '../components/EbtBanner';
import OrderStatusBar from '../components/OrderStatusBar';

export default function HomeScreen({ navigation }) {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const { favorites, toggleFavorite, activeOrder, user } = useStore();

  const filteredKitchens = ghostKitchens.filter((kitchen) => {
    const matchesCategory =
      selectedCategory === 'all' ||
      kitchen.cuisineType.toLowerCase().includes(selectedCategory);
    const matchesSearch =
      !searchQuery ||
      kitchen.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      kitchen.cuisineType.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const featuredKitchens = ghostKitchens.filter((k) => k.featured);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Good evening</Text>
            <View style={styles.locationRow}>
              <MaterialIcons name="location-on" size={16} color={colors.primary} />
              <Text style={styles.location} numberOfLines={1}>
                {user.address || 'Set delivery address'}
              </Text>
              <MaterialIcons name="keyboard-arrow-down" size={20} color={colors.textSecondary} />
            </View>
          </View>
          <TouchableOpacity
            style={styles.profileButton}
            onPress={() => navigation.navigate('Profile')}
          >
            <MaterialIcons name="person" size={24} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <MaterialIcons name="search" size={22} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search gourmet kitchens..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <MaterialIcons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Active Order Banner */}
        {activeOrder && activeOrder.status !== 'delivered' && (
          <View style={styles.section}>
            <OrderStatusBar
              order={activeOrder}
              onPress={() => navigation.navigate('Orders')}
            />
          </View>
        )}

        {/* EBT Banner */}
        <View style={styles.section}>
          <EbtBanner onLinkCard={() => navigation.navigate('Profile')} />
        </View>

        {/* Hero Banner */}
        <View style={styles.heroBanner}>
          <View style={styles.heroContent}>
            <View style={styles.heroBadge}>
              <MaterialIcons name="restaurant-menu" size={14} color={colors.black} />
              <Text style={styles.heroBadgeText}>GHOST KITCHEN</Text>
            </View>
            <Text style={styles.heroTitle}>Gourmet Meals.{'\n'}EBT Accepted.</Text>
            <Text style={styles.heroSubtitle}>
              Our chefs shop fresh groceries and cook restaurant-quality meals delivered to your door.
            </Text>
            <View style={styles.heroFeatures}>
              <View style={styles.heroFeature}>
                <MaterialIcons name="check-circle" size={16} color={colors.ebtGreen} />
                <Text style={styles.heroFeatureText}>100% EBT Eligible</Text>
              </View>
              <View style={styles.heroFeature}>
                <MaterialIcons name="check-circle" size={16} color={colors.ebtGreen} />
                <Text style={styles.heroFeatureText}>Chef Prepared</Text>
              </View>
              <View style={styles.heroFeature}>
                <MaterialIcons name="check-circle" size={16} color={colors.ebtGreen} />
                <Text style={styles.heroFeatureText}>Free Delivery</Text>
              </View>
            </View>
          </View>
        </View>

        {/* How It Works */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How It Works</Text>
          <View style={styles.stepsRow}>
            <View style={styles.step}>
              <View style={[styles.stepIcon, { backgroundColor: 'rgba(52, 152, 219, 0.15)' }]}>
                <MaterialIcons name="menu-book" size={24} color="#3498db" />
              </View>
              <Text style={styles.stepTitle}>Browse</Text>
              <Text style={styles.stepDesc}>Pick gourmet meals</Text>
            </View>
            <View style={styles.stepArrow}>
              <MaterialIcons name="arrow-forward" size={16} color={colors.textMuted} />
            </View>
            <View style={styles.step}>
              <View style={[styles.stepIcon, { backgroundColor: 'rgba(243, 156, 18, 0.15)' }]}>
                <MaterialIcons name="shopping-cart" size={24} color="#f39c12" />
              </View>
              <Text style={styles.stepTitle}>We Shop</Text>
              <Text style={styles.stepDesc}>Fresh groceries</Text>
            </View>
            <View style={styles.stepArrow}>
              <MaterialIcons name="arrow-forward" size={16} color={colors.textMuted} />
            </View>
            <View style={styles.step}>
              <View style={[styles.stepIcon, { backgroundColor: 'rgba(231, 76, 60, 0.15)' }]}>
                <MaterialIcons name="local-fire-department" size={24} color="#e74c3c" />
              </View>
              <Text style={styles.stepTitle}>Chef Cooks</Text>
              <Text style={styles.stepDesc}>Made gourmet</Text>
            </View>
            <View style={styles.stepArrow}>
              <MaterialIcons name="arrow-forward" size={16} color={colors.textMuted} />
            </View>
            <View style={styles.step}>
              <View style={[styles.stepIcon, { backgroundColor: 'rgba(46, 204, 113, 0.15)' }]}>
                <MaterialIcons name="delivery-dining" size={24} color="#2ecc71" />
              </View>
              <Text style={styles.stepTitle}>Delivered</Text>
              <Text style={styles.stepDesc}>To your door</Text>
            </View>
          </View>
        </View>

        {/* Categories */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cuisine</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.categoryChip,
                  selectedCategory === cat.id && styles.categoryChipActive,
                ]}
                onPress={() => setSelectedCategory(cat.id)}
              >
                <MaterialIcons
                  name={cat.icon}
                  size={18}
                  color={selectedCategory === cat.id ? colors.black : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.categoryText,
                    selectedCategory === cat.id && styles.categoryTextActive,
                  ]}
                >
                  {cat.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Featured Kitchens */}
        {selectedCategory === 'all' && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Featured Kitchens</Text>
              <TouchableOpacity>
                <Text style={styles.seeAll}>See All</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {featuredKitchens.map((kitchen) => (
                <TouchableOpacity
                  key={kitchen.id}
                  style={styles.featuredCard}
                  onPress={() => navigation.navigate('KitchenDetail', { kitchen })}
                >
                  <View style={styles.featuredImage}>
                    <MaterialIcons name="restaurant" size={30} color={colors.primary} />
                  </View>
                  <View style={styles.featuredContent}>
                    <Text style={styles.featuredName} numberOfLines={1}>{kitchen.name}</Text>
                    <Text style={styles.featuredCuisine}>{kitchen.cuisineType}</Text>
                    <View style={styles.featuredRating}>
                      <MaterialIcons name="star" size={14} color={colors.primary} />
                      <Text style={styles.featuredRatingText}>{kitchen.rating}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* All Kitchens */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {selectedCategory === 'all' ? 'All Kitchens' : `${categories.find(c => c.id === selectedCategory)?.name || ''} Kitchens`}
          </Text>
          {filteredKitchens.map((kitchen) => (
            <KitchenCard
              key={kitchen.id}
              kitchen={kitchen}
              isFavorite={favorites.includes(kitchen.id)}
              onToggleFavorite={() => toggleFavorite(kitchen.id)}
              onPress={() => navigation.navigate('KitchenDetail', { kitchen })}
            />
          ))}
          {filteredKitchens.length === 0 && (
            <View style={styles.emptyState}>
              <MaterialIcons name="search-off" size={48} color={colors.textMuted} />
              <Text style={styles.emptyText}>No kitchens found</Text>
              <Text style={styles.emptySubtext}>Try a different search or category</Text>
            </View>
          )}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.base,
  },
  greeting: {
    color: colors.text,
    fontSize: sizes.xl,
    fontWeight: weights.bold,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  location: {
    color: colors.textSecondary,
    fontSize: sizes.md,
    marginLeft: 4,
    maxWidth: 220,
  },
  profileButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    marginHorizontal: spacing.base,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.base,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: sizes.base,
    marginLeft: spacing.sm,
    paddingVertical: spacing.sm,
  },
  section: {
    paddingHorizontal: spacing.base,
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: sizes.lg,
    fontWeight: weights.bold,
    marginBottom: spacing.md,
  },
  seeAll: {
    color: colors.primary,
    fontSize: sizes.md,
    fontWeight: weights.semibold,
    marginBottom: spacing.md,
  },
  heroBanner: {
    marginHorizontal: spacing.base,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.3)',
  },
  heroContent: {
    padding: spacing.xl,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.md,
  },
  heroBadgeText: {
    color: colors.black,
    fontSize: sizes.xs,
    fontWeight: weights.bold,
    marginLeft: 4,
    letterSpacing: 1,
  },
  heroTitle: {
    color: colors.text,
    fontSize: sizes.xxxl,
    fontWeight: weights.extrabold,
    lineHeight: 40,
  },
  heroSubtitle: {
    color: colors.textSecondary,
    fontSize: sizes.md,
    marginTop: spacing.sm,
    lineHeight: 22,
  },
  heroFeatures: {
    marginTop: spacing.base,
    gap: spacing.sm,
  },
  heroFeature: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroFeatureText: {
    color: colors.text,
    fontSize: sizes.md,
    marginLeft: spacing.sm,
  },
  stepsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  step: {
    alignItems: 'center',
    flex: 1,
  },
  stepIcon: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  stepTitle: {
    color: colors.text,
    fontSize: sizes.sm,
    fontWeight: weights.semibold,
  },
  stepDesc: {
    color: colors.textMuted,
    fontSize: sizes.xs,
    marginTop: 2,
  },
  stepArrow: {
    marginBottom: spacing.xl,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    marginRight: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryText: {
    color: colors.textSecondary,
    fontSize: sizes.md,
    marginLeft: spacing.xs,
  },
  categoryTextActive: {
    color: colors.black,
    fontWeight: weights.bold,
  },
  featuredCard: {
    width: 180,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    marginRight: spacing.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  featuredImage: {
    height: 100,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featuredContent: {
    padding: spacing.md,
  },
  featuredName: {
    color: colors.text,
    fontSize: sizes.md,
    fontWeight: weights.bold,
  },
  featuredCuisine: {
    color: colors.primary,
    fontSize: sizes.sm,
    marginTop: 2,
  },
  featuredRating: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  featuredRatingText: {
    color: colors.text,
    fontSize: sizes.sm,
    fontWeight: weights.semibold,
    marginLeft: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
  },
  emptyText: {
    color: colors.text,
    fontSize: sizes.lg,
    fontWeight: weights.semibold,
    marginTop: spacing.md,
  },
  emptySubtext: {
    color: colors.textMuted,
    fontSize: sizes.md,
    marginTop: spacing.xs,
  },
});
