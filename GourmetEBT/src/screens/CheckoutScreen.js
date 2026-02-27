import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, sizes, weights } from '../theme';
import { useStore } from '../store/useStore';
import { formatPrice, validateEbtCard, maskCardNumber } from '../utils/helpers';

export default function CheckoutScreen({ route, navigation }) {
  const { total } = route.params;
  const {
    user,
    ebtCardLinked,
    ebtBalance,
    ebtCardLast4,
    linkEbtCard,
    cart,
    placeOrder,
  } = useStore();

  const [paymentMethod, setPaymentMethod] = useState(ebtCardLinked ? 'ebt' : null);
  const [ebtCardNumber, setEbtCardNumber] = useState('');
  const [ebtPin, setEbtPin] = useState('');
  const [showLinkCard, setShowLinkCard] = useState(!ebtCardLinked);
  const [address, setAddress] = useState(user.address);
  const [instructions, setInstructions] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [tipAmount, setTipAmount] = useState(0);

  const tipOptions = [0, 2, 5, 8];
  const finalTotal = total + tipAmount;

  const handleLinkCard = () => {
    if (!validateEbtCard(ebtCardNumber)) {
      Alert.alert('Invalid Card', 'Please enter a valid EBT card number (16-19 digits).');
      return;
    }
    if (ebtPin.length < 4) {
      Alert.alert('Invalid PIN', 'Please enter your 4-digit EBT PIN.');
      return;
    }
    // Mock linking - in production this would hit an EBT processor API
    const last4 = ebtCardNumber.slice(-4);
    const mockBalance = 487.50; // Mock balance
    linkEbtCard(last4, mockBalance);
    setShowLinkCard(false);
    setPaymentMethod('ebt');
    Alert.alert('Card Linked!', `Your EBT card ending in ${last4} has been linked. Balance: ${formatPrice(mockBalance)}`);
  };

  const handlePlaceOrder = () => {
    if (!paymentMethod) {
      Alert.alert('Payment Required', 'Please select a payment method.');
      return;
    }
    if (paymentMethod === 'ebt' && ebtBalance < finalTotal) {
      Alert.alert('Insufficient Balance', 'Your EBT balance is not enough for this order.');
      return;
    }

    setIsProcessing(true);

    // Simulate processing
    setTimeout(() => {
      placeOrder(paymentMethod);
      setIsProcessing(false);
      navigation.reset({
        index: 0,
        routes: [{ name: 'OrderConfirmation' }],
      });
    }, 2000);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Checkout</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Delivery Address */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="location-on" size={22} color={colors.primary} />
            <Text style={styles.sectionTitle}>Delivery Address</Text>
          </View>
          <TextInput
            style={styles.addressInput}
            value={address}
            onChangeText={setAddress}
            placeholder="Enter delivery address"
            placeholderTextColor={colors.textMuted}
            multiline
          />
        </View>

        {/* Delivery Instructions */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="notes" size={22} color={colors.primary} />
            <Text style={styles.sectionTitle}>Delivery Instructions</Text>
          </View>
          <TextInput
            style={styles.instructionsInput}
            value={instructions}
            onChangeText={setInstructions}
            placeholder="Apt #, gate code, leave at door..."
            placeholderTextColor={colors.textMuted}
            multiline
          />
        </View>

        {/* Payment Method */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="payment" size={22} color={colors.primary} />
            <Text style={styles.sectionTitle}>Payment Method</Text>
          </View>

          {/* EBT Card Option */}
          {ebtCardLinked && !showLinkCard ? (
            <TouchableOpacity
              style={[
                styles.paymentOption,
                paymentMethod === 'ebt' && styles.paymentOptionActive,
              ]}
              onPress={() => setPaymentMethod('ebt')}
            >
              <View style={styles.paymentLeft}>
                <View style={styles.ebtIcon}>
                  <MaterialIcons name="credit-card" size={20} color={colors.black} />
                </View>
                <View>
                  <Text style={styles.paymentName}>EBT Card ****{ebtCardLast4}</Text>
                  <Text style={styles.paymentBalance}>
                    Balance: {formatPrice(ebtBalance)}
                  </Text>
                </View>
              </View>
              <View style={[styles.radio, paymentMethod === 'ebt' && styles.radioActive]}>
                {paymentMethod === 'ebt' && <View style={styles.radioInner} />}
              </View>
            </TouchableOpacity>
          ) : (
            <View style={styles.linkCardSection}>
              <Text style={styles.linkCardTitle}>Link Your EBT Card</Text>
              <Text style={styles.linkCardSubtitle}>
                Pay for your gourmet meal with EBT benefits
              </Text>
              <TextInput
                style={styles.cardInput}
                value={ebtCardNumber}
                onChangeText={setEbtCardNumber}
                placeholder="EBT Card Number"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                maxLength={19}
              />
              <TextInput
                style={styles.cardInput}
                value={ebtPin}
                onChangeText={setEbtPin}
                placeholder="4-Digit PIN"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                maxLength={4}
                secureTextEntry
              />
              <TouchableOpacity style={styles.linkButton} onPress={handleLinkCard}>
                <MaterialIcons name="link" size={18} color={colors.black} />
                <Text style={styles.linkButtonText}>Link EBT Card</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Cash Option */}
          <TouchableOpacity
            style={[
              styles.paymentOption,
              paymentMethod === 'cash' && styles.paymentOptionActive,
            ]}
            onPress={() => setPaymentMethod('cash')}
          >
            <View style={styles.paymentLeft}>
              <View style={[styles.ebtIcon, { backgroundColor: colors.warning }]}>
                <MaterialIcons name="payments" size={20} color={colors.black} />
              </View>
              <View>
                <Text style={styles.paymentName}>Cash on Delivery</Text>
                <Text style={styles.paymentBalance}>Pay when food arrives</Text>
              </View>
            </View>
            <View style={[styles.radio, paymentMethod === 'cash' && styles.radioActive]}>
              {paymentMethod === 'cash' && <View style={styles.radioInner} />}
            </View>
          </TouchableOpacity>
        </View>

        {/* Chef Tip */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="favorite" size={22} color={colors.accent} />
            <Text style={styles.sectionTitle}>Tip Your Chef</Text>
          </View>
          <Text style={styles.tipSubtitle}>
            Show appreciation for your chef's gourmet preparation
          </Text>
          <View style={styles.tipOptions}>
            {tipOptions.map((tip) => (
              <TouchableOpacity
                key={tip}
                style={[styles.tipButton, tipAmount === tip && styles.tipButtonActive]}
                onPress={() => setTipAmount(tip)}
              >
                <Text style={[styles.tipText, tipAmount === tip && styles.tipTextActive]}>
                  {tip === 0 ? 'No Tip' : formatPrice(tip)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Order Summary */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="receipt" size={22} color={colors.primary} />
            <Text style={styles.sectionTitle}>Order Summary</Text>
          </View>
          <View style={styles.summaryCard}>
            {cart.map((item) => (
              <View key={item.id} style={styles.summaryItem}>
                <Text style={styles.summaryItemName}>
                  {item.quantity}x {item.name}
                </Text>
                <Text style={styles.summaryItemPrice}>
                  {formatPrice(item.price * item.quantity)}
                </Text>
              </View>
            ))}
            <View style={styles.divider} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal</Text>
              <Text style={styles.summaryValue}>{formatPrice(total - 2.99)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Service Fee</Text>
              <Text style={styles.summaryValue}>{formatPrice(2.99)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Delivery</Text>
              <Text style={styles.freeText}>FREE</Text>
            </View>
            {tipAmount > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Chef Tip</Text>
                <Text style={styles.summaryValue}>{formatPrice(tipAmount)}</Text>
              </View>
            )}
            <View style={styles.divider} />
            <View style={styles.summaryRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{formatPrice(finalTotal)}</Text>
            </View>
            {paymentMethod === 'ebt' && (
              <View style={styles.ebtPayment}>
                <MaterialIcons name="check-circle" size={16} color={colors.ebtGreen} />
                <Text style={styles.ebtPaymentText}>
                  Paying with EBT Card ****{ebtCardLast4}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Place Order Button */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.placeOrderButton, isProcessing && styles.disabledButton]}
          onPress={handlePlaceOrder}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <ActivityIndicator color={colors.black} />
          ) : (
            <>
              <MaterialIcons name="restaurant-menu" size={22} color={colors.black} />
              <Text style={styles.placeOrderText}>Place Order - {formatPrice(finalTotal)}</Text>
            </>
          )}
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
  section: {
    padding: spacing.base,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: sizes.lg,
    fontWeight: weights.bold,
    marginLeft: spacing.sm,
  },
  addressInput: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    color: colors.text,
    fontSize: sizes.base,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 56,
  },
  instructionsInput: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    color: colors.text,
    fontSize: sizes.base,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 56,
  },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  paymentOptionActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(212, 175, 55, 0.05)',
  },
  paymentLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ebtIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.ebtGreen,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  paymentName: {
    color: colors.text,
    fontSize: sizes.base,
    fontWeight: weights.semibold,
  },
  paymentBalance: {
    color: colors.textSecondary,
    fontSize: sizes.sm,
    marginTop: 2,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.textMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioActive: {
    borderColor: colors.primary,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  linkCardSection: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(46, 204, 113, 0.3)',
    borderStyle: 'dashed',
  },
  linkCardTitle: {
    color: colors.ebtGreen,
    fontSize: sizes.base,
    fontWeight: weights.bold,
    marginBottom: spacing.xs,
  },
  linkCardSubtitle: {
    color: colors.textSecondary,
    fontSize: sizes.sm,
    marginBottom: spacing.md,
  },
  cardInput: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    color: colors.text,
    fontSize: sizes.base,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ebtGreen,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  linkButtonText: {
    color: colors.black,
    fontSize: sizes.base,
    fontWeight: weights.bold,
  },
  tipSubtitle: {
    color: colors.textSecondary,
    fontSize: sizes.sm,
    marginBottom: spacing.md,
  },
  tipOptions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  tipButton: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  tipButtonActive: {
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
    borderColor: colors.primary,
  },
  tipText: {
    color: colors.textSecondary,
    fontSize: sizes.sm,
    fontWeight: weights.semibold,
  },
  tipTextActive: {
    color: colors.primary,
  },
  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  summaryItemName: {
    color: colors.text,
    fontSize: sizes.md,
    flex: 1,
  },
  summaryItemPrice: {
    color: colors.text,
    fontSize: sizes.md,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
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
  freeText: {
    color: colors.ebtGreen,
    fontSize: sizes.md,
    fontWeight: weights.bold,
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
  ebtPayment: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(46, 204, 113, 0.08)',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  ebtPaymentText: {
    color: colors.ebtGreen,
    fontSize: sizes.sm,
    fontWeight: weights.medium,
    marginLeft: spacing.sm,
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
  placeOrderButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.base,
    gap: spacing.sm,
  },
  placeOrderText: {
    color: colors.black,
    fontSize: sizes.lg,
    fontWeight: weights.bold,
  },
  disabledButton: {
    opacity: 0.7,
  },
});
