import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { formatLocationAddress } from "../lib/format";
import { colors, fonts } from "../theme";
import type { BuyerLocation } from "../types";

type Props = {
  locations: BuyerLocation[];
  selectedId: string;
  onSelect: (id: string) => void;
  compact?: boolean;
};

export function LocationSelector({ locations, selectedId, onSelect, compact = false }: Props) {
  if (!locations.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No approved delivery location yet</Text>
        <Text style={styles.emptyText}>Dallas Bakery is preparing your business locations. Contact sales@dallasbakery.com for help.</Text>
      </View>
    );
  }
  return (
    <ScrollView horizontal contentContainerStyle={styles.row} showsHorizontalScrollIndicator={false}>
      {locations.map((location) => {
        const active = location.id === selectedId;
        return (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            key={location.id}
            onPress={() => onSelect(location.id)}
            style={[styles.card, compact && styles.cardCompact, active && styles.cardActive]}
          >
            <View style={[styles.dot, active && styles.dotActive]}>{active && <Text style={styles.check}>✓</Text>}</View>
            <View style={styles.copy}>
              <Text numberOfLines={1} style={styles.name}>{location.name}</Text>
              {!compact && <Text numberOfLines={2} style={styles.address}>{formatLocationAddress(location.address)}</Text>}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 9, paddingRight: 18 },
  card: { width: 286, minHeight: 74, padding: 13, flexDirection: "row", alignItems: "center", gap: 11, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  cardCompact: { width: 200, minHeight: 52, paddingVertical: 9 },
  cardActive: { borderColor: "#B6CCB6", backgroundColor: colors.sagePale },
  dot: { width: 22, height: 22, alignItems: "center", justifyContent: "center", borderRadius: 11, borderWidth: 1, borderColor: colors.line },
  dotActive: { borderColor: colors.sage, backgroundColor: colors.sage },
  check: { color: colors.paper, fontFamily: fonts.sansMedium, fontSize: 10 },
  copy: { flex: 1 },
  name: { color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 11 },
  address: { marginTop: 4, color: colors.muted, fontFamily: fonts.sans, fontSize: 9, lineHeight: 13 },
  empty: { padding: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  emptyTitle: { color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 11 },
  emptyText: { marginTop: 6, color: colors.muted, fontFamily: fonts.sans, fontSize: 10, lineHeight: 16 },
});
