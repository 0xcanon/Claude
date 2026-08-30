import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "../theme";
import type { MainTab } from "../types";

type Props = { active: MainTab; cartCount: number; onSelect: (tab: MainTab) => void };

const items: Array<{ tab: MainTab; icon: string; label: string }> = [
  { tab: "home", icon: "⌂", label: "HOME" },
  { tab: "catalog", icon: "▦", label: "CATALOG" },
  { tab: "orders", icon: "≡", label: "ORDERS" },
  { tab: "locations", icon: "⌖", label: "LOCATIONS" },
  { tab: "account", icon: "○", label: "ACCOUNT" },
];

export function BottomNav({ active, cartCount, onSelect }: Props) {
  return (
    <View style={styles.nav}>
      {items.map((item) => {
        const selected = active === item.tab;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={item.tab}
            onPress={() => onSelect(item.tab)}
            style={styles.item}
          >
            <View>
              <Text style={[styles.icon, selected && styles.active]}>{item.icon}</Text>
              {item.tab === "catalog" && cartCount > 0 && (
                <View style={styles.badge}><Text style={styles.badgeText}>{Math.min(99, cartCount)}</Text></View>
              )}
            </View>
            <Text style={[styles.label, selected && styles.active]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  nav: { minHeight: 68, paddingTop: 8, paddingBottom: 7, flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.paper },
  item: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3 },
  icon: { color: "#988A81", fontFamily: fonts.sansMedium, fontSize: 17 },
  label: { color: "#988A81", fontFamily: fonts.sansMedium, fontSize: 9.2, letterSpacing: 0.6 },
  active: { color: colors.rust },
  badge: { position: "absolute", top: -5, right: -10, minWidth: 17, height: 17, paddingHorizontal: 4, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: colors.rust },
  badgeText: { color: colors.paper, fontFamily: fonts.sansMedium, fontSize: 9.4 },
});
