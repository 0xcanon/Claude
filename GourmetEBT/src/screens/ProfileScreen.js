import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, sizes, weights } from '../theme';
import { useStore } from '../store/useStore';
import { formatPrice, validateEbtCard } from '../utils/helpers';

export default function ProfileScreen({ navigation }) {
  const {
    user,
    setUser,
    ebtCardLinked,
    ebtBalance,
    ebtCardLast4,
    linkEbtCard,
    unlinkEbtCard,
    chefMode,
    toggleChefMode,
    orders,
  } = useStore();

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone);
  const [address, setAddress] = useState(user.address);

  const [showLinkEbt, setShowLinkEbt] = useState(false);
  const [cardNumber, setCardNumber] = useState('');
  const [cardPin, setCardPin] = useState('');

  const handleSaveProfile = () => {
    setUser({ name, email, phone, address });
    setIsEditing(false);
  };

  const handleLinkEbt = () => {
    if (!validateEbtCard(cardNumber)) {
      Alert.alert('Invalid Card', 'Please enter a valid EBT card number.');
      return;
    }
    if (cardPin.length < 4) {
      Alert.alert('Invalid PIN', 'Please enter your 4-digit PIN.');
      return;
    }
    const cleaned = cardNumber.replace(/\D/g, '');
    const last4 = cleaned.slice(-4);
    linkEbtCard(last4, 487.50);
    setShowLinkEbt(false);
    setCardNumber('');
    setCardPin('');
    Alert.alert('Success', `EBT card ending in ${last4} has been linked!`);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
        {!isEditing ? (
          <TouchableOpacity onPress={() => setIsEditing(true)}>
            <MaterialIcons name="edit" size={22} color={colors.primary} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={handleSaveProfile}>
            <Text style={styles.saveText}>Save</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <MaterialIcons name="person" size={40} color={colors.primary} />
          </View>
          {isEditing ? (
            <View style={styles.editFields}>
              <TextInput
                style={styles.editInput}
                value={name}
                onChangeText={setName}
                placeholder="Full Name"
                placeholderTextColor={colors.textMuted}
              />
              <TextInput
                style={styles.editInput}
                value={email}
                onChangeText={setEmail}
                placeholder="Email Address"
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
              />
              <TextInput
                style={styles.editInput}
                value={phone}
                onChangeText={setPhone}
                placeholder="Phone Number"
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
              />
              <TextInput
                style={styles.editInput}
                value={address}
                onChangeText={setAddress}
                placeholder="Delivery Address"
                placeholderTextColor={colors.textMuted}
                multiline
              />
            </View>
          ) : (
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{user.name || 'Guest User'}</Text>
              {user.email ? <Text style={styles.profileDetail}>{user.email}</Text> : null}
              {user.phone ? <Text style={styles.profileDetail}>{user.phone}</Text> : null}
              <View style={styles.addressRow}>
                <MaterialIcons name="location-on" size={14} color={colors.primary} />
                <Text style={styles.profileAddress}>{user.address || 'No address set'}</Text>
              </View>
            </View>
          )}
        </View>

        {/* EBT Card Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>EBT Card</Text>
          {ebtCardLinked ? (
            <View style={styles.ebtCard}>
              <View style={styles.ebtCardVisual}>
                <View style={styles.ebtCardHeader}>
                  <Text style={styles.ebtCardLabel}>EBT BENEFIT CARD</Text>
                  <MaterialIcons name="credit-card" size={24} color={colors.white} />
                </View>
                <Text style={styles.ebtCardNumber}>**** **** **** {ebtCardLast4}</Text>
                <View style={styles.ebtCardFooter}>
                  <View>
                    <Text style={styles.ebtBalanceLabel}>Available Balance</Text>
                    <Text style={styles.ebtBalanceAmount}>{formatPrice(ebtBalance)}</Text>
                  </View>
                  <View style={styles.ebtChip}>
                    <View style={styles.chipLines}>
                      <View style={styles.chipLine} />
                      <View style={styles.chipLine} />
                      <View style={styles.chipLine} />
                    </View>
                  </View>
                </View>
              </View>
              <TouchableOpacity
                style={styles.unlinkButton}
                onPress={() => {
                  Alert.alert(
                    'Unlink Card',
                    'Are you sure you want to remove your EBT card?',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Remove', style: 'destructive', onPress: unlinkEbtCard },
                    ]
                  );
                }}
              >
                <MaterialIcons name="link-off" size={16} color={colors.accent} />
                <Text style={styles.unlinkText}>Remove Card</Text>
              </TouchableOpacity>
            </View>
          ) : showLinkEbt ? (
            <View style={styles.linkSection}>
              <TextInput
                style={styles.cardInput}
                value={cardNumber}
                onChangeText={setCardNumber}
                placeholder="EBT Card Number"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                maxLength={19}
              />
              <TextInput
                style={styles.cardInput}
                value={cardPin}
                onChangeText={setCardPin}
                placeholder="4-Digit PIN"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                maxLength={4}
                secureTextEntry
              />
              <View style={styles.linkActions}>
                <TouchableOpacity
                  style={styles.cancelLink}
                  onPress={() => setShowLinkEbt(false)}
                >
                  <Text style={styles.cancelLinkText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmLink} onPress={handleLinkEbt}>
                  <Text style={styles.confirmLinkText}>Link Card</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.addEbtButton}
              onPress={() => setShowLinkEbt(true)}
            >
              <MaterialIcons name="add-circle-outline" size={22} color={colors.ebtGreen} />
              <View style={styles.addEbtContent}>
                <Text style={styles.addEbtTitle}>Link EBT Card</Text>
                <Text style={styles.addEbtSubtitle}>Pay for meals with your EBT benefits</Text>
              </View>
              <MaterialIcons name="arrow-forward-ios" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Quick Stats */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Stats</Text>
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <MaterialIcons name="receipt" size={24} color={colors.primary} />
              <Text style={styles.statValue}>{orders.length}</Text>
              <Text style={styles.statLabel}>Orders</Text>
            </View>
            <View style={styles.statCard}>
              <MaterialIcons name="savings" size={24} color={colors.ebtGreen} />
              <Text style={styles.statValue}>
                {formatPrice(orders.reduce((t, o) => t + (o.total - (o.groceryCost || 0)), 0))}
              </Text>
              <Text style={styles.statLabel}>Saved vs Eating Out</Text>
            </View>
            <View style={styles.statCard}>
              <MaterialIcons name="favorite" size={24} color={colors.accent} />
              <Text style={styles.statValue}>{orders.filter(o => o.paymentMethod === 'ebt').length}</Text>
              <Text style={styles.statLabel}>EBT Orders</Text>
            </View>
          </View>
        </View>

        {/* Menu Options */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Settings</Text>

          {/* Chef Mode Toggle */}
          <TouchableOpacity style={styles.menuItem} onPress={toggleChefMode}>
            <View style={[styles.menuIcon, { backgroundColor: 'rgba(231, 76, 60, 0.15)' }]}>
              <MaterialIcons name="restaurant" size={20} color="#e74c3c" />
            </View>
            <View style={styles.menuContent}>
              <Text style={styles.menuTitle}>Chef Dashboard</Text>
              <Text style={styles.menuSubtitle}>Switch to kitchen management view</Text>
            </View>
            <View style={[styles.toggle, chefMode && styles.toggleActive]}>
              <View style={[styles.toggleDot, chefMode && styles.toggleDotActive]} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <View style={[styles.menuIcon, { backgroundColor: 'rgba(52, 152, 219, 0.15)' }]}>
              <MaterialIcons name="notifications" size={20} color="#3498db" />
            </View>
            <View style={styles.menuContent}>
              <Text style={styles.menuTitle}>Notifications</Text>
              <Text style={styles.menuSubtitle}>Order updates and promotions</Text>
            </View>
            <MaterialIcons name="arrow-forward-ios" size={14} color={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <View style={[styles.menuIcon, { backgroundColor: 'rgba(46, 204, 113, 0.15)' }]}>
              <MaterialIcons name="location-on" size={20} color="#2ecc71" />
            </View>
            <View style={styles.menuContent}>
              <Text style={styles.menuTitle}>Saved Addresses</Text>
              <Text style={styles.menuSubtitle}>Manage delivery locations</Text>
            </View>
            <MaterialIcons name="arrow-forward-ios" size={14} color={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <View style={[styles.menuIcon, { backgroundColor: 'rgba(155, 89, 182, 0.15)' }]}>
              <MaterialIcons name="help" size={20} color="#9b59b6" />
            </View>
            <View style={styles.menuContent}>
              <Text style={styles.menuTitle}>Help & Support</Text>
              <Text style={styles.menuSubtitle}>FAQs, contact us</Text>
            </View>
            <MaterialIcons name="arrow-forward-ios" size={14} color={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <View style={[styles.menuIcon, { backgroundColor: 'rgba(212, 175, 55, 0.15)' }]}>
              <MaterialIcons name="info" size={20} color={colors.primary} />
            </View>
            <View style={styles.menuContent}>
              <Text style={styles.menuTitle}>About GourmetEBT</Text>
              <Text style={styles.menuSubtitle}>Our mission and how it works</Text>
            </View>
            <MaterialIcons name="arrow-forward-ios" size={14} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Chef Dashboard Link */}
        {chefMode && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.chefDashboardButton}
              onPress={() => navigation.navigate('ChefDashboard')}
            >
              <MaterialIcons name="restaurant" size={22} color={colors.black} />
              <Text style={styles.chefDashboardText}>Open Chef Dashboard</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>GourmetEBT v1.0.0</Text>
          <Text style={styles.footerSubtext}>
            Gourmet meals, made accessible for everyone
          </Text>
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
  headerTitle: {
    color: colors.text,
    fontSize: sizes.xl,
    fontWeight: weights.bold,
  },
  saveText: {
    color: colors.primary,
    fontSize: sizes.base,
    fontWeight: weights.bold,
  },
  profileCard: {
    margin: spacing.base,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.base,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  profileInfo: {
    alignItems: 'center',
  },
  profileName: {
    color: colors.text,
    fontSize: sizes.xl,
    fontWeight: weights.bold,
  },
  profileDetail: {
    color: colors.textSecondary,
    fontSize: sizes.md,
    marginTop: spacing.xs,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  profileAddress: {
    color: colors.textSecondary,
    fontSize: sizes.sm,
    marginLeft: 4,
  },
  editFields: {
    width: '100%',
    gap: spacing.sm,
  },
  editInput: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    color: colors.text,
    fontSize: sizes.base,
    borderWidth: 1,
    borderColor: colors.border,
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
  ebtCard: {
    marginBottom: spacing.md,
  },
  ebtCardVisual: {
    backgroundColor: colors.ebtBadge,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    marginBottom: spacing.md,
  },
  ebtCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  ebtCardLabel: {
    color: colors.white,
    fontSize: sizes.sm,
    fontWeight: weights.bold,
    letterSpacing: 2,
  },
  ebtCardNumber: {
    color: colors.white,
    fontSize: sizes.xl,
    fontWeight: weights.bold,
    letterSpacing: 3,
    marginBottom: spacing.xl,
  },
  ebtCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  ebtBalanceLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: sizes.xs,
  },
  ebtBalanceAmount: {
    color: colors.white,
    fontSize: sizes.xxl,
    fontWeight: weights.bold,
  },
  ebtChip: {
    width: 40,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 4,
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  chipLines: {
    gap: 3,
  },
  chipLine: {
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderRadius: 1,
  },
  unlinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  unlinkText: {
    color: colors.accent,
    fontSize: sizes.sm,
    fontWeight: weights.medium,
  },
  linkSection: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardInput: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    color: colors.text,
    fontSize: sizes.base,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  linkActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  cancelLink: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  cancelLinkText: {
    color: colors.textSecondary,
    fontSize: sizes.base,
    fontWeight: weights.medium,
  },
  confirmLink: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.ebtGreen,
    alignItems: 'center',
  },
  confirmLinkText: {
    color: colors.white,
    fontSize: sizes.base,
    fontWeight: weights.bold,
  },
  addEbtButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: 'rgba(46, 204, 113, 0.3)',
    borderStyle: 'dashed',
  },
  addEbtContent: {
    flex: 1,
    marginLeft: spacing.md,
  },
  addEbtTitle: {
    color: colors.ebtGreen,
    fontSize: sizes.base,
    fontWeight: weights.bold,
  },
  addEbtSubtitle: {
    color: colors.textSecondary,
    fontSize: sizes.sm,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
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
    textAlign: 'center',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  menuContent: {
    flex: 1,
  },
  menuTitle: {
    color: colors.text,
    fontSize: sizes.base,
    fontWeight: weights.semibold,
  },
  menuSubtitle: {
    color: colors.textSecondary,
    fontSize: sizes.sm,
    marginTop: 2,
  },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleActive: {
    backgroundColor: colors.ebtGreen,
  },
  toggleDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.textMuted,
  },
  toggleDotActive: {
    backgroundColor: colors.white,
    alignSelf: 'flex-end',
  },
  chefDashboardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.base,
    gap: spacing.sm,
  },
  chefDashboardText: {
    color: colors.black,
    fontSize: sizes.base,
    fontWeight: weights.bold,
  },
  footer: {
    alignItems: 'center',
    padding: spacing.xl,
  },
  footerText: {
    color: colors.textMuted,
    fontSize: sizes.sm,
  },
  footerSubtext: {
    color: colors.textMuted,
    fontSize: sizes.xs,
    marginTop: 4,
  },
});
