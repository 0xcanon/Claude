import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "../theme";

export type OwnerTab = "today" | "orders" | "problems" | "accounts" | "bread";

type Props = {
  active: OwnerTab;
  onSelect: (tab: OwnerTab) => void;
  /** Small red counts, so the owner can see what is waiting without looking. */
  badges?: Partial<Record<OwnerTab, number>>;
};

const TABS: { key: OwnerTab; label: string; glyph: string }[] = [
  { key: "today", label: "Today", glyph: "◉" },
  { key: "orders", label: "Orders", glyph: "▤" },
  { key: "problems", label: "Problems", glyph: "!" },
  { key: "accounts", label: "Accounts", glyph: "✦" },
  { key: "bread", label: "Bread", glyph: "❋" },
];

export function OwnerTabBar({ active, onSelect, badges = {} }: Props) {
  return (
    <View style={styles.bar}>
      {TABS.map((tab) => {
        const on = tab.key === active;
        const badge = badges[tab.key] || 0;
        return (
          <Pressable
            accessibilityLabel={tab.label}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            key={tab.key}
            onPress={() => onSelect(tab.key)}
            style={styles.tab}
          >
            <View>
              <Text style={[styles.glyph, on && styles.glyphOn]}>{tab.glyph}</Text>
              {badge > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badge > 9 ? "9+" : badge}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.label, on && styles.labelOn]}>{tab.label.toUpperCase()}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    paddingTop: 9,
    paddingBottom: 26,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.paper,
  },
  tab: { flex: 1, minHeight: 46, alignItems: "center", justifyContent: "center", gap: 4 },
  glyph: { color: colors.muted, fontSize: 17, textAlign: "center" },
  glyphOn: { color: colors.rust },
  label: { color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 8, letterSpacing: 0.9 },
  labelOn: { color: colors.chocolate },
  badge: {
    position: "absolute",
    top: -5,
    right: -13,
    minWidth: 17,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 9,
    backgroundColor: colors.rust,
  },
  badgeText: {
    color: colors.white,
    fontFamily: fonts.sansMedium,
    fontSize: 9,
    textAlign: "center",
  },
});
