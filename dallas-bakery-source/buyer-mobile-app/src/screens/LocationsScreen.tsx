import { Linking, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

import { AppHeader } from "../components/AppHeader";
import { BottomNav } from "../components/BottomNav";
import { PrimaryButton } from "../components/PrimaryButton";
import { formatLocationAddress } from "../lib/format";
import { colors, fonts } from "../theme";
import type { BuyerLocation, MainTab } from "../types";

type Props = {
  cartCount: number;
  locations: BuyerLocation[];
  onCart: () => void;
  onSelectLocation: (id: string) => void;
  onTab: (tab: MainTab) => void;
  selectedLocationId: string;
  userInitials: string;
};

export function LocationsScreen({ cartCount, locations, onCart, onSelectLocation, onTab, selectedLocationId, userInitials }: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <AppHeader cartCount={cartCount} initials={userInitials} onCart={onCart} onProfile={() => onTab("account")} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.kicker}>ONE COMPANY · EVERY STORE</Text>
        <Text style={styles.title}>Delivery locations</Text>
        <Text style={styles.description}>Choose which approved storefront receives an order. Pricing and quantity rules load for that business location.</Text>

        <View style={styles.list}>
          {locations.map((location) => {
            const selected = location.id === selectedLocationId;
            return (
              <Pressable key={location.id} onPress={() => onSelectLocation(location.id)} style={[styles.card, selected && styles.cardSelected]}>
                <View style={[styles.marker, selected && styles.markerSelected]}><Text style={[styles.markerText, selected && styles.markerTextSelected]}>{selected ? "✓" : ""}</Text></View>
                <View style={styles.copy}>
                  <Text style={styles.name}>{location.name}</Text>
                  <Text style={styles.company}>{location.companyName}</Text>
                  <Text style={styles.address}>{formatLocationAddress(location.address)}</Text>
                </View>
                {selected && <Text style={styles.active}>ACTIVE</Text>}
              </Pressable>
            );
          })}
        </View>

        <View style={styles.addCard}>
          <Text style={styles.addKicker}>NEED ANOTHER STOREFRONT?</Text>
          <Text style={styles.addTitle}>Keep every location under one account.</Text>
          <Text style={styles.addText}>Send Dallas Bakery the exact commercial food-business address. We’ll review and attach it to the approved company.</Text>
          <PrimaryButton label="REQUEST ANOTHER LOCATION" onPress={() => void Linking.openURL("mailto:sales@dallasbakery.com?subject=Add%20a%20wholesale%20delivery%20location")} outline />
        </View>
      </ScrollView>
      <BottomNav active="locations" cartCount={cartCount} onSelect={onTab} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 18, paddingTop: 30, paddingBottom: 38 },
  kicker: { color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 8, letterSpacing: 1.2 },
  title: { marginTop: 10, color: colors.chocolate, fontFamily: fonts.serif, fontSize: 37 },
  description: { marginTop: 9, color: colors.muted, fontFamily: fonts.sans, fontSize: 10, lineHeight: 17 },
  list: { marginTop: 22, gap: 9 },
  card: { minHeight: 96, padding: 14, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  cardSelected: { borderColor: "#B3C8B2", backgroundColor: colors.sagePale },
  marker: { width: 25, height: 25, alignItems: "center", justifyContent: "center", borderRadius: 13, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white },
  markerSelected: { borderColor: colors.sage, backgroundColor: colors.sage },
  markerText: { color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 10 },
  markerTextSelected: { color: colors.paper },
  copy: { flex: 1 },
  name: { color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 12 },
  company: { marginTop: 3, color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 7, letterSpacing: 0.5 },
  address: { marginTop: 6, color: colors.muted, fontFamily: fonts.sans, fontSize: 9, lineHeight: 14 },
  active: { color: colors.sage, fontFamily: fonts.sansMedium, fontSize: 6.5, letterSpacing: 0.7 },
  addCard: { marginTop: 16, padding: 17, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  addKicker: { color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 7, letterSpacing: 1 },
  addTitle: { marginTop: 8, color: colors.chocolate, fontFamily: fonts.serif, fontSize: 23, lineHeight: 27 },
  addText: { marginVertical: 10, color: colors.muted, fontFamily: fonts.sans, fontSize: 10, lineHeight: 16 },
});
