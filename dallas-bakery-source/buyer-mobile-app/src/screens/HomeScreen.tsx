import { RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

import { AppHeader } from "../components/AppHeader";
import { BottomNav } from "../components/BottomNav";
import { LocationSelector } from "../components/LocationSelector";
import { PrimaryButton } from "../components/PrimaryButton";
import { formatLocationAddress, formatMoney } from "../lib/format";
import { colors, fonts } from "../theme";
import type { BuyerAccount, BuyerLocation, CatalogProduct, MainTab, ShippingSettings } from "../types";

type Props = {
  account: BuyerAccount;
  cartCount: number;
  loading: boolean;
  locations: BuyerLocation[];
  onCart: () => void;
  onRefresh: () => void;
  onSelectLocation: (id: string) => void;
  onTab: (tab: MainTab) => void;
  products: CatalogProduct[];
  selectedLocationId: string;
  shipping: ShippingSettings;
};

export function HomeScreen({
  account,
  cartCount,
  loading,
  locations,
  onCart,
  onRefresh,
  onSelectLocation,
  onTab,
  products,
  selectedLocationId,
  shipping,
}: Props) {
  const selected = locations.find((location) => location.id === selectedLocationId) || locations[0];
  // Cheapest case in the buyer's own catalog, so the headline price is real
  // rather than a number baked into the app.
  const casePrices = products.map((product) => Number(product.variant.price.amount)).filter(Number.isFinite);
  const fromPrice = casePrices.length ? Math.min(...casePrices) : null;
  // Cases are not all one price, so the cheapest one is labelled as a "from".
  const mixedPricing = new Set(casePrices).size > 1;
  const currency = products[0]?.variant.price.currencyCode || "USD";
  const initials = `${account.firstName[0] || ""}${account.lastName[0] || ""}`.toUpperCase();
  return (
    <SafeAreaView style={styles.safe}>
      <AppHeader cartCount={cartCount} initials={initials} onCart={onCart} onProfile={() => onTab("account")} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl onRefresh={onRefresh} refreshing={loading} tintColor={colors.rust} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.approvedRow}>
          <Text style={styles.approved}>✓ APPROVED ACCOUNT</Text>
          <Text style={styles.locationName}>{selected?.name || "SELECT A LOCATION"}</Text>
        </View>
        <Text style={styles.greeting}>Good {timeGreeting()}, {account.firstName || account.displayName}.</Text>
        <Text style={styles.title}>Ready for the{`\n`}next bread order?</Text>
        <Text style={styles.description}>Your private pricing, business locations, and order history stay together.</Text>

        <Text style={styles.sectionLabel}>DELIVER TO</Text>
        <LocationSelector compact locations={locations} onSelect={onSelectLocation} selectedId={selectedLocationId} />

        <View style={styles.orderCard}>
          <View style={styles.orderCardTop}>
            <View>
              <Text style={styles.orderKicker}>PRIVATE WHOLESALE CATALOG</Text>
              <Text style={styles.orderTitle}>Fresh bread for busy kitchens.</Text>
            </View>
            {fromPrice !== null && (
              <View style={styles.priceBlock}>
                {mixedPricing && <Text style={styles.priceFrom}>FROM</Text>}
                <Text style={styles.price}>{formatMoney(fromPrice, currency)}</Text>
                <Text style={styles.priceUnit}>PER CASE</Text>
              </View>
            )}
          </View>
          <Text style={styles.orderText}>Sold by the case, loaded securely for {selected?.name || "your approved location"}.</Text>
          <PrimaryButton disabled={!selected} label="BROWSE BREAD" onPress={() => onTab("catalog")} />
        </View>

        <View style={styles.stats}>
          <View style={styles.stat}><Text style={styles.statValue}>{account.orders.length}</Text><Text style={styles.statLabel}>RECENT ORDERS</Text></View>
          <View style={styles.stat}><Text style={styles.statValue}>{shipping.formattedRate}</Text><Text style={styles.statLabel}>PER {shipping.unitsPerBox}-LOAF BOX</Text></View>
          <View style={styles.stat}><Text style={styles.statValue}>{locations.length}</Text><Text style={styles.statLabel}>APPROVED LOCATIONS</Text></View>
        </View>

        <View style={styles.locationCard}>
          <Text style={styles.locationKicker}>CURRENT STOREFRONT</Text>
          <Text style={styles.locationTitle}>{selected?.name || "Location setup underway"}</Text>
          <Text style={styles.locationAddress}>{selected ? formatLocationAddress(selected.address) : "Contact Dallas Bakery if a location is missing."}</Text>
        </View>
      </ScrollView>
      <BottomNav active="home" cartCount={cartCount} onSelect={onTab} />
    </SafeAreaView>
  );
}

function timeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 18, paddingTop: 24, paddingBottom: 34 },
  approvedRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  approved: { paddingVertical: 6, paddingHorizontal: 9, borderRadius: 12, overflow: "hidden", color: colors.sage, backgroundColor: colors.sagePale, fontFamily: fonts.sansMedium, fontSize: 7, letterSpacing: 0.7 },
  locationName: { flex: 1, color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 7, letterSpacing: 0.6, textAlign: "right" },
  greeting: { marginTop: 25, color: colors.muted, fontFamily: fonts.sans, fontSize: 11 },
  title: { marginTop: 7, color: colors.chocolate, fontFamily: fonts.serif, fontSize: 38, lineHeight: 41 },
  description: { marginTop: 10, maxWidth: 330, color: colors.muted, fontFamily: fonts.sans, fontSize: 11, lineHeight: 18 },
  sectionLabel: { marginTop: 25, marginBottom: 10, color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 7, letterSpacing: 1 },
  orderCard: { marginTop: 20, padding: 17, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  orderCardTop: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  orderKicker: { color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 7, letterSpacing: 1 },
  orderTitle: { marginTop: 7, maxWidth: 220, color: colors.chocolate, fontFamily: fonts.serif, fontSize: 23, lineHeight: 27 },
  priceBlock: { alignItems: "flex-end" },
  priceFrom: { color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 6, letterSpacing: 0.7 },
  price: { color: colors.rust, fontFamily: fonts.serif, fontWeight: "700", fontSize: 24 },
  priceUnit: { marginTop: 2, color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 6, letterSpacing: 0.7 },
  orderText: { marginTop: 9, marginBottom: 15, color: colors.muted, fontFamily: fonts.sans, fontSize: 10, lineHeight: 16 },
  stats: { marginTop: 14, flexDirection: "row", gap: 7 },
  stat: { flex: 1, minHeight: 80, padding: 10, justifyContent: "space-between", borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  statValue: { color: colors.chocolate, fontFamily: fonts.serif, fontWeight: "700", fontSize: 17 },
  statLabel: { color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 6, letterSpacing: 0.5 },
  locationCard: { marginTop: 14, padding: 15, backgroundColor: colors.chocolate },
  locationKicker: { color: colors.gold, fontFamily: fonts.sansMedium, fontSize: 7, letterSpacing: 1 },
  locationTitle: { marginTop: 8, color: colors.paper, fontFamily: fonts.serif, fontSize: 20 },
  locationAddress: { marginTop: 6, color: "#CBBEB5", fontFamily: fonts.sans, fontSize: 9, lineHeight: 14 },
});
