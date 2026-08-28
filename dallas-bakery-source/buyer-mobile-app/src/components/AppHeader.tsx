import { Platform, Pressable, SafeAreaView, StatusBar as NativeStatusBar, StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "../theme";
import { BrandLockup } from "./BrandLockup";

type Props = {
  cartCount?: number;
  initials?: string;
  light?: boolean;
  onCart?: () => void;
  onProfile?: () => void;
};

export function AppHeader({ cartCount = 0, initials = "", light = false, onCart, onProfile }: Props) {
  return (
    <SafeAreaView style={[styles.safe, light && styles.safeLight]}>
      <View style={[styles.header, light && styles.headerLight]}>
        <BrandLockup compact light={!light} />
        <View style={styles.actions}>
          {onCart && (
            <Pressable accessibilityLabel={`Cart with ${cartCount} items`} onPress={onCart} style={[styles.cart, light && styles.lightBorder]}>
              <Text style={[styles.cartIcon, light && styles.lightText]}>▱</Text>
              {cartCount > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{Math.min(99, cartCount)}</Text></View>}
            </Pressable>
          )}
          {onProfile && (
            <Pressable accessibilityLabel="Account" onPress={onProfile} style={[styles.profile, light && styles.profileLight]}>
              <Text style={[styles.profileText, light && styles.profileTextLight]}>{initials || "DB"}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.chocolate },
  safeLight: { backgroundColor: colors.paper },
  header: {
    minHeight: 62,
    paddingTop: Platform.OS === "android" ? NativeStatusBar.currentHeight : 0,
    paddingHorizontal: 17,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.chocolate,
  },
  headerLight: { borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.paper },
  actions: { flexDirection: "row", alignItems: "center", gap: 9 },
  cart: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.lineDark },
  cartIcon: { color: colors.paper, fontSize: 20, transform: [{ rotate: "180deg" }] },
  lightBorder: { borderColor: colors.line },
  lightText: { color: colors.chocolate },
  badge: { position: "absolute", top: -5, right: -5, minWidth: 18, height: 18, paddingHorizontal: 4, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: colors.rust },
  badgeText: { color: colors.paper, fontFamily: fonts.sansMedium, fontSize: 7 },
  profile: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20, backgroundColor: colors.paper },
  profileLight: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white },
  profileText: { color: colors.rust, fontFamily: fonts.serif, fontSize: 15 },
  profileTextLight: { color: colors.rust },
});
