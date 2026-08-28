import { useState } from "react";
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { AppHeader } from "../components/AppHeader";
import { BottomNav } from "../components/BottomNav";
import { LocationSelector } from "../components/LocationSelector";
import { PrimaryButton } from "../components/PrimaryButton";
import { ProductCard } from "../components/ProductCard";
import { CutoffBanner } from "../components/CutoffBanner";
import { caseLabel } from "../lib/format";
import type { CutoffState } from "../lib/storefront";
import { colors, fonts } from "../theme";
import type { BuyerLocation, CatalogProduct, CartQuantityMap, MainTab } from "../types";

type Props = {
  cart: CartQuantityMap;
  cartCount: number;
  error: string;
  loading: boolean;
  locations: BuyerLocation[];
  onAdd: (product: CatalogProduct) => void;
  onCart: () => void;
  onOpenProduct: (product: CatalogProduct) => void;
  onRetry: () => void;
  onSelectLocation: (id: string) => void;
  onTab: (tab: MainTab) => void;
  cutoff: CutoffState | null;
  products: CatalogProduct[];
  selectedLocationId: string;
  userInitials: string;
};

export function CatalogScreen({
  cart,
  cartCount,
  error,
  loading,
  locations,
  onAdd,
  onCart,
  onOpenProduct,
  onRetry,
  onSelectLocation,
  onTab,
  cutoff,
  products,
  selectedLocationId,
  userInitials,
}: Props) {
  const [query, setQuery] = useState("");
  const visible = products.filter((product) => (
    `${product.title} ${product.description}`.toLowerCase().includes(query.trim().toLowerCase())
  ));
  return (
    <SafeAreaView style={styles.safe}>
      <AppHeader cartCount={cartCount} initials={userInitials} onCart={onCart} onProfile={() => onTab("account")} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.approvedRow}>
          <Text style={styles.approved}>APPROVED ACCOUNT</Text>
          <Text style={styles.locationLabel}>ORDERING LOCATION</Text>
        </View>
        <Text style={styles.greeting}>Private pricing for your business.</Text>
        <Text style={styles.title}>Wholesale catalog</Text>
        <Text style={styles.description}>Sold by the case. Prices are loaded only for the selected approved storefront.</Text>
        <CutoffBanner cutoff={cutoff} />

        <View style={styles.locationArea}>
          <LocationSelector compact locations={locations} onSelect={onSelectLocation} selectedId={selectedLocationId} />
        </View>

        <View style={styles.searchRow}>
          <Text style={styles.searchLabel}>SEARCH BREAD</Text>
          <TextInput
            onChangeText={setQuery}
            placeholder="Classic, natural, whole wheat…"
            placeholderTextColor="#B7A69A"
            style={styles.search}
            value={query}
          />
        </View>

        {loading ? (
          <View style={styles.state}><ActivityIndicator color={colors.rust} size="large" /><Text style={styles.stateText}>Loading private catalog…</Text></View>
        ) : error ? (
          <View style={styles.state}><Text style={styles.error}>{error}</Text><PrimaryButton label="TRY AGAIN" onPress={onRetry} outline /></View>
        ) : visible.length === 0 ? (
          <View style={styles.state}><Text style={styles.stateTitle}>No bread matched.</Text><Text style={styles.stateText}>Try another search or contact Dallas Bakery.</Text></View>
        ) : (
          <View style={styles.grid}>
            {visible.map((product) => (
              <ProductCard
                key={product.id}
                onAdd={() => onAdd(product)}
                onOpen={() => onOpenProduct(product)}
                product={product}
                quantity={cart[product.variant.id] || 0}
              />
            ))}
          </View>
        )}

        <View style={styles.capacity}>
          <Text style={styles.capacityKicker}>UNLIMITED WEEKLY CAPACITY</Text>
          <Text style={styles.capacityText}>Need a recurring order? Dallas Bakery can support it.</Text>
        </View>
        {cartCount > 0 && <PrimaryButton label={`VIEW CART · ${caseLabel(cartCount).toUpperCase()}`} onPress={onCart} />}
      </ScrollView>
      <BottomNav active="catalog" cartCount={cartCount} onSelect={onTab} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 18, paddingTop: 20, paddingBottom: 35 },
  approvedRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  approved: { paddingVertical: 6, paddingHorizontal: 9, borderRadius: 11, overflow: "hidden", color: colors.sage, backgroundColor: colors.sagePale, fontFamily: fonts.sansMedium, fontSize: 7, letterSpacing: 0.7 },
  locationLabel: { color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 6.5, letterSpacing: 0.7 },
  greeting: { marginTop: 21, color: colors.muted, fontFamily: fonts.sans, fontSize: 10 },
  title: { marginTop: 6, color: colors.chocolate, fontFamily: fonts.serif, fontSize: 37 },
  description: { marginTop: 8, color: colors.muted, fontFamily: fonts.sans, fontSize: 10, lineHeight: 16 },
  locationArea: { marginTop: 18 },
  searchRow: { minHeight: 56, marginTop: 18, marginBottom: 16, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", backgroundColor: colors.chocolate },
  searchLabel: { marginRight: 12, color: colors.paper, fontFamily: fonts.sansMedium, fontSize: 7, letterSpacing: 0.9 },
  search: { flex: 1, minHeight: 54, color: colors.paper, fontFamily: fonts.sans, fontSize: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  state: { minHeight: 250, padding: 22, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  stateTitle: { color: colors.chocolate, fontFamily: fonts.serif, fontSize: 23 },
  stateText: { marginTop: 10, color: colors.muted, fontFamily: fonts.sans, fontSize: 11, textAlign: "center" },
  error: { marginBottom: 16, color: colors.danger, fontFamily: fonts.sans, fontSize: 11, lineHeight: 17, textAlign: "center" },
  capacity: { marginVertical: 14, padding: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  capacityKicker: { color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 7, letterSpacing: 1 },
  capacityText: { marginTop: 5, color: colors.muted, fontFamily: fonts.sans, fontSize: 9 },
});
