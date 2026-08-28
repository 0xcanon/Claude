import { useState } from "react";
import { Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

import { BrandLockup } from "../components/BrandLockup";
import { PrimaryButton } from "../components/PrimaryButton";
import { caseLabel, formatMoney, loafLabel, loafPrice, loavesPerCase, normalizeQuantity } from "../lib/format";
import { colors, fonts } from "../theme";
import type { BuyerLocation, CatalogProduct } from "../types";

type Props = {
  initialQuantity: number;
  location: BuyerLocation | null;
  onBack: () => void;
  onSetQuantity: (quantity: number) => void;
  product: CatalogProduct;
};

const fallbackImage = require("../../assets/barbari-product.jpg");

export function ProductDetailScreen({ initialQuantity, location, onBack, onSetQuantity, product }: Props) {
  const rule = product.variant.quantityRule;
  // `quantity` is a number of CASES throughout this screen.
  const [quantity, setQuantity] = useState(initialQuantity || rule.minimum);
  const increment = rule.increment || 1;
  function change(next: number) {
    const normalized = normalizeQuantity(next, rule.minimum, increment);
    setQuantity(rule.maximum ? Math.min(normalized, rule.maximum) : normalized);
  }
  const currency = product.variant.price.currencyCode;
  const perCase = loavesPerCase(product);
  const subtotal = Number(product.variant.price.amount) * quantity;
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Back to catalog" onPress={onBack}><Text style={styles.back}>‹</Text></Pressable>
        <BrandLockup compact />
        <View style={styles.headerSpace} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Image source={product.imageUrl ? { uri: product.imageUrl } : fallbackImage} style={styles.image} />
        <Text style={styles.tag}>KOSHER · HALAL</Text>
        <Text style={styles.title}>{product.title}</Text>
        <Text style={styles.description}>{product.description || "Traditional Persian Barbari flatbread with a 14-day shelf life."}</Text>
        <View style={styles.priceRow}>
          <Text style={styles.price}>{formatMoney(product.variant.price.amount, currency)}</Text>
          <Text style={styles.unit}> per case</Text>
        </View>
        <Text style={styles.caseBreakdown}>
          One case is {loafLabel(perCase)} — {formatMoney(loafPrice(product), currency)} a loaf.
        </Text>

        <View style={styles.divider} />
        <View style={styles.controls}>
          <View style={styles.controlBlock}>
            <Text style={styles.label}>CASES</Text>
            <View style={styles.stepper}>
              <Pressable accessibilityLabel="One fewer case" onPress={() => change(Math.max(0, quantity - increment))}><Text style={styles.step}>−</Text></Pressable>
              <Text style={styles.quantity}>{quantity}</Text>
              <Pressable accessibilityLabel="One more case" onPress={() => change(quantity + increment)}><Text style={styles.step}>+</Text></Pressable>
            </View>
          </View>
          <View style={styles.controlBlock}>
            <Text style={styles.label}>ORDER TYPE</Text>
            <View style={styles.orderType}><Text style={styles.orderTypeText}>Wholesale order</Text></View>
          </View>
        </View>
        <Text style={styles.ruleText}>
          {quantity > 0 ? `${caseLabel(quantity)} · ${loafLabel(quantity * perCase)}. ` : ""}
          Minimum {caseLabel(rule.minimum)}{rule.maximum ? `, maximum ${caseLabel(rule.maximum)}` : ""}.
        </Text>

        <View style={styles.delivery}>
          <Text style={styles.label}>DELIVER TO</Text>
          <Text style={styles.deliveryTitle}>{location?.name || "Select an approved location"}</Text>
          <Text style={styles.deliveryText}>{location?.companyName || "Location setup is still underway."}</Text>
        </View>

        <View style={styles.subtotalRow}><Text style={styles.subtotalLabel}>ORDER SUBTOTAL</Text><Text style={styles.subtotal}>{formatMoney(subtotal, currency)}</Text></View>
        <PrimaryButton label={`${initialQuantity ? "UPDATE" : "ADD"} ${caseLabel(quantity).toUpperCase()}`} onPress={() => { onSetQuantity(quantity); onBack(); }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  header: { minHeight: 64, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.paper },
  back: { width: 44, color: colors.rust, fontSize: 35 },
  headerSpace: { width: 44 },
  content: { padding: 18, paddingBottom: 40 },
  image: { width: "100%", aspectRatio: 1.35, backgroundColor: "#D7C2A1" },
  tag: { alignSelf: "flex-start", marginTop: -11, marginLeft: 10, paddingVertical: 5, paddingHorizontal: 9, borderRadius: 12, overflow: "hidden", color: colors.sage, backgroundColor: colors.sagePale, fontFamily: fonts.sansMedium, fontSize: 7, letterSpacing: 0.6 },
  title: { marginTop: 14, color: colors.chocolate, fontFamily: fonts.serif, fontSize: 34 },
  description: { marginTop: 7, color: colors.muted, fontFamily: fonts.sans, fontSize: 10, lineHeight: 17 },
  priceRow: { marginTop: 14, flexDirection: "row", alignItems: "baseline" },
  price: { color: colors.rust, fontFamily: fonts.serif, fontWeight: "700", fontSize: 27 },
  unit: { color: colors.muted, fontFamily: fonts.sans, fontSize: 9 },
  caseBreakdown: { marginTop: 6, color: colors.muted, fontFamily: fonts.sans, fontSize: 10, lineHeight: 16 },
  divider: { height: 1, marginVertical: 18, backgroundColor: colors.line },
  controls: { flexDirection: "row", gap: 10 },
  controlBlock: { flex: 1 },
  label: { marginBottom: 7, color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 7, letterSpacing: 0.8 },
  stepper: { minHeight: 55, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  step: { minWidth: 26, color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 22, textAlign: "center" },
  quantity: { color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 16 },
  orderType: { minHeight: 55, paddingHorizontal: 12, justifyContent: "center", borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  orderTypeText: { color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 10 },
  ruleText: { marginTop: 8, color: colors.muted, fontFamily: fonts.sans, fontSize: 8, lineHeight: 13 },
  delivery: { marginTop: 16, padding: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  deliveryTitle: { color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 12 },
  deliveryText: { marginTop: 5, color: colors.muted, fontFamily: fonts.sans, fontSize: 9 },
  subtotalRow: { marginVertical: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  subtotalLabel: { color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 8, letterSpacing: 0.8 },
  subtotal: { color: colors.chocolate, fontFamily: fonts.serif, fontWeight: "700", fontSize: 22 },
});
