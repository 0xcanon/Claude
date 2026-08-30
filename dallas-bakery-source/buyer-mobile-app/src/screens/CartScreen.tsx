import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

import { BrandLockup } from "../components/BrandLockup";
import { LocationSelector } from "../components/LocationSelector";
import { OrderPaperwork } from "../components/OrderPaperwork";
import { PrimaryButton } from "../components/PrimaryButton";
import { CutoffBanner } from "../components/CutoffBanner";
import { StandingOrderCard } from "../components/StandingOrderCard";
import { caseLabel, cartLoaves, cartQuantity, cartSubtotal, formatMoney, loafLabel, loavesPerCase, shippingEstimate } from "../lib/format";
import type { CutoffState, StandingOrderInfo } from "../lib/storefront";
import { colors, fonts } from "../theme";
import type {
  BuyerLocation,
  CartQuantityMap,
  CatalogProduct,
  DeliveryWindow,
  ShippingSettings,
} from "../types";

type Props = {
  cart: CartQuantityMap;
  checkoutError: string;
  checkingOut: boolean;
  cutoff: CutoffState | null;
  deliveryWindow: DeliveryWindow | null;
  locations: BuyerLocation[];
  onBack: () => void;
  onCheckout: () => void;
  onQuantity: (product: CatalogProduct, quantity: number) => void;
  onSelectLocation: (id: string) => void;
  onChangePoNumber: (value: string) => void;
  onChangeDeliveryDate: (value: string) => void;
  poNumber: string;
  requestedDeliveryDate: string;
  products: CatalogProduct[];
  selectedLocationId: string;
  shipping: ShippingSettings;
  standingBusy: boolean;
  standingNotice: string;
  standingOrder: StandingOrderInfo | null;
  standingWeekday: number;
  onPauseStanding: () => void;
  onSaveStanding: (weekday: number) => void;
  onSelectStandingWeekday: (weekday: number) => void;
};

export function CartScreen({
  cart,
  checkoutError,
  checkingOut,
  cutoff,
  deliveryWindow,
  locations,
  onBack,
  onCheckout,
  onQuantity,
  onSelectLocation,
  onChangePoNumber,
  onChangeDeliveryDate,
  poNumber,
  requestedDeliveryDate,
  products,
  selectedLocationId,
  shipping,
  standingBusy,
  standingNotice,
  standingOrder,
  standingWeekday,
  onPauseStanding,
  onSaveStanding,
  onSelectStandingWeekday,
}: Props) {
  const cartProducts = products.filter((product) => (cart[product.variant.id] || 0) > 0);
  const quantity = cartQuantity(cart);
  const subtotal = cartSubtotal(products, cart);
  // One case ships as one box, so shipping is billed on the case count.
  const loaves = cartLoaves(products, cart);
  const estimate = shippingEstimate(quantity, shipping);
  const currency = cartProducts[0]?.variant.price.currencyCode || "USD";
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Back to catalog" onPress={onBack}><Text style={styles.back}>‹</Text></Pressable>
        <BrandLockup compact light />
        <Text style={styles.secure}>SECURE CHECKOUT</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.kicker}>REVIEW ORDER</Text>
        <Text style={styles.title}>Where should we{`\n`}deliver?</Text>
        <Text style={styles.description}>Choose an approved storefront for this order.</Text>
        <CutoffBanner cutoff={cutoff} />
        <LocationSelector locations={locations} onSelect={onSelectLocation} selectedId={selectedLocationId} />

        <Text style={styles.sectionLabel}>ORDER SUMMARY</Text>
        <View style={styles.summary}>
          {cartProducts.length ? cartProducts.map((product) => {
            const lineQuantity = cart[product.variant.id] || 0;
            const increment = product.variant.quantityRule.increment || 1;
            return (
              <View key={product.id} style={styles.lineItem}>
                <View style={styles.lineCopy}>
                  <Text style={styles.lineTitle}>{product.title}</Text>
                  <Text style={styles.lineDetail}>
                    {caseLabel(lineQuantity)} × {formatMoney(product.variant.price.amount, product.variant.price.currencyCode)}
                  </Text>
                  <Text style={styles.lineLoaves}>{loafLabel(lineQuantity * loavesPerCase(product))}</Text>
                </View>
                <View style={styles.lineActions}>
                  <Pressable accessibilityLabel={`One fewer case of ${product.title}`} onPress={() => onQuantity(product, Math.max(0, lineQuantity - increment))}><Text style={styles.adjust}>−</Text></Pressable>
                  <Text style={styles.lineTotal}>{formatMoney(Number(product.variant.price.amount) * lineQuantity, product.variant.price.currencyCode)}</Text>
                  <Pressable accessibilityLabel={`One more case of ${product.title}`} onPress={() => onQuantity(product, lineQuantity + increment)}><Text style={styles.adjust}>+</Text></Pressable>
                </View>
              </View>
            );
          }) : <Text style={styles.empty}>Your cart is empty.</Text>}

          <View style={styles.totals}>
            <View style={styles.totalRow}><Text style={styles.totalLabel}>Subtotal · {caseLabel(quantity)}</Text><Text style={styles.totalValue}>{formatMoney(subtotal, currency)}</Text></View>
            <View style={styles.totalRow}><Text style={styles.totalLabel}>Shipping · {estimate.boxes} {estimate.boxes === 1 ? "box" : "boxes"} at {shipping.formattedRate}</Text><Text style={styles.totalValue}>{formatMoney(estimate.cents / 100, currency)}</Text></View>
            <View style={[styles.totalRow, styles.grandRow]}><Text style={styles.grandLabel}>Estimated total</Text><Text style={styles.grandValue}>{formatMoney(subtotal + estimate.cents / 100, currency)}</Text></View>
          </View>
        </View>

        <View style={styles.shippingNote}>
          <Text style={styles.shippingKicker}>LIVE BOX SHIPPING</Text>
          <Text style={styles.shippingText}>{shipping.formattedRate} per case — {caseLabel(quantity)} ships as {estimate.boxes} {estimate.boxes === 1 ? "box" : "boxes"} ({loafLabel(loaves)}). Bakery items are not taxed in Texas — the total above is the total charged.</Text>
        </View>
        <OrderPaperwork
          deliveryWindow={deliveryWindow}
          onChangeDeliveryDate={onChangeDeliveryDate}
          onChangePoNumber={onChangePoNumber}
          poNumber={poNumber}
          requestedDeliveryDate={requestedDeliveryDate}
        />

        {!!checkoutError && <Text style={styles.error}>{checkoutError}</Text>}
        <PrimaryButton disabled={!quantity || !selectedLocationId} label="CONTINUE SECURELY" loading={checkingOut} onPress={onCheckout} />
        <StandingOrderCard
          busy={standingBusy}
          cartCases={quantity}
          notice={standingNotice}
          onPause={onPauseStanding}
          onSave={onSaveStanding}
          onSelectWeekday={onSelectStandingWeekday}
          standingOrder={standingOrder}
          weekday={standingWeekday}
        />
        <Text style={styles.private}>Payment, confirmation, and final order history stay inside your approved business account.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  header: { minHeight: 64, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.chocolate },
  back: { width: 38, color: colors.gold, fontSize: 35 },
  secure: { width: 76, color: "#BEAEA3", fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 0.6, textAlign: "right" },
  content: { padding: 18, paddingTop: 28, paddingBottom: 40 },
  kicker: { color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 9.8, letterSpacing: 1.3 },
  title: { marginTop: 10, color: colors.chocolate, fontFamily: fonts.serif, fontSize: 36, lineHeight: 39 },
  description: { marginTop: 9, marginBottom: 18, color: colors.muted, fontFamily: fonts.sans, fontSize: 10 },
  sectionLabel: { marginTop: 26, marginBottom: 9, color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 9.4, letterSpacing: 1 },
  summary: { padding: 15, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  lineItem: { minHeight: 70, paddingVertical: 10, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.line },
  lineCopy: { flex: 1 },
  lineTitle: { color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 11 },
  lineDetail: { marginTop: 5, color: colors.muted, fontFamily: fonts.sans, fontSize: 9 },
  lineLoaves: { marginTop: 3, color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 9.6, letterSpacing: 0.4 },
  lineActions: { flexDirection: "row", alignItems: "center", gap: 9 },
  adjust: { width: 25, color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 19, textAlign: "center" },
  lineTotal: { minWidth: 62, color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 11, textAlign: "center" },
  empty: { paddingVertical: 20, color: colors.muted, fontFamily: fonts.sans, fontSize: 11, textAlign: "center" },
  totals: { paddingTop: 12 },
  totalRow: { paddingVertical: 5, flexDirection: "row", justifyContent: "space-between" },
  totalLabel: { color: colors.muted, fontFamily: fonts.sans, fontSize: 10 },
  totalValue: { color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 10 },
  grandRow: { marginTop: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line },
  grandLabel: { color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 11 },
  grandValue: { color: colors.rust, fontFamily: fonts.serif, fontWeight: "700", fontSize: 20 },
  shippingNote: { marginVertical: 14, padding: 13, backgroundColor: colors.chocolate },
  shippingKicker: { color: colors.gold, fontFamily: fonts.sansMedium, fontSize: 9.4, letterSpacing: 0.9 },
  shippingText: { marginTop: 6, color: "#CDBEB4", fontFamily: fonts.sans, fontSize: 9, lineHeight: 14 },
  error: { marginBottom: 12, padding: 12, color: colors.danger, backgroundColor: colors.rosePale, fontFamily: fonts.sans, fontSize: 10, lineHeight: 16 },
  private: { marginTop: 12, color: colors.muted, fontFamily: fonts.sans, fontSize: 10, lineHeight: 13, textAlign: "center" },
});
