import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { formatMoney, loafPrice, loavesPerCase } from "../lib/format";
import { colors, fonts, shadow } from "../theme";
import type { CatalogProduct } from "../types";

type Props = {
  product: CatalogProduct;
  quantity: number;
  onAdd: () => void;
  onOpen: () => void;
};

const fallbackImage = require("../../assets/barbari-product.jpg");

export function ProductCard({ product, quantity, onAdd, onOpen }: Props) {
  const currency = product.variant.price.currencyCode;
  const perCase = loavesPerCase(product);
  const stock = product.stock;
  const soldOut = stock ? !stock.available : !product.variant.availableForSale;
  const spec = product.spec;
  // The shelf-life line reads off the product's own label when it has one.
  const shelfLife = (spec?.shelfLife || "14-day shelf life").toUpperCase();
  return (
    <Pressable accessibilityRole="button" onPress={onOpen} style={styles.card}>
      <Image
        accessibilityLabel={product.imageAlt}
        resizeMode="cover"
        source={product.imageUrl ? { uri: product.imageUrl } : fallbackImage}
        style={styles.image}
      />
      {soldOut && (
        <View style={styles.soldOutBanner}>
          <Text style={styles.soldOutText}>{(stock?.label || "Sold out").toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.tags}>
        <Text numberOfLines={1} style={styles.tag}>
          {spec?.certifications ? spec.certifications.toUpperCase() : "KOSHER · HALAL"}
        </Text>
      </View>
      <View style={styles.content}>
        <Text numberOfLines={1} style={styles.title}>{product.title}</Text>
        <Text numberOfLines={1} style={styles.description}>{product.description || "Persian flatbread"}</Text>
        <View style={styles.priceRow}>
          <Text style={styles.price}>{formatMoney(product.variant.price.amount, currency)}</Text>
          <Text style={styles.unit}> per case</Text>
          <Pressable
            accessibilityLabel={soldOut ? `${product.title} is sold out` : `Add ${product.title}`}
            disabled={soldOut}
            hitSlop={8}
            onPress={(event) => { event.stopPropagation(); onAdd(); }}
            style={soldOut ? [styles.add, styles.addDisabled] : styles.add}
          >
            <Text style={styles.addText}>{soldOut ? "—" : quantity > 0 ? quantity : "+"}</Text>
          </Pressable>
        </View>
        <Text style={styles.caseNote}>{perCase} LOAVES · {formatMoney(loafPrice(product), currency)} EACH</Text>
        {!!spec?.allergens && (
          <Text numberOfLines={1} style={styles.allergens}>CONTAINS: {spec.allergens.toUpperCase()}</Text>
        )}
        <Text numberOfLines={1} style={styles.shelf}>
          {stock && stock.available && stock.label !== "In stock" ? stock.label.toUpperCase() : shelfLife}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width: "48.5%", borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper, ...shadow },
  image: { width: "100%", aspectRatio: 1.28, backgroundColor: "#D8C4A3" },
  soldOutBanner: { position: "absolute", top: 0, left: 0, right: 0, paddingVertical: 5, backgroundColor: "rgba(43,26,19,0.88)" },
  soldOutText: { color: colors.paper, fontFamily: fonts.sansMedium, fontSize: 6.5, letterSpacing: 0.8, textAlign: "center" },
  tags: { height: 0, alignItems: "flex-start", paddingHorizontal: 8 },
  tag: { top: -11, paddingVertical: 4, paddingHorizontal: 7, borderRadius: 10, overflow: "hidden", color: colors.sage, backgroundColor: colors.sagePale, fontFamily: fonts.sansMedium, fontSize: 6, letterSpacing: 0.4 },
  content: { padding: 11, paddingTop: 16 },
  title: { color: colors.chocolate, fontFamily: fonts.serif, fontWeight: "700", fontSize: 15 },
  description: { marginTop: 3, color: colors.muted, fontFamily: fonts.sans, fontSize: 8 },
  priceRow: { marginTop: 10, minHeight: 31, flexDirection: "row", alignItems: "center" },
  price: { color: colors.rust, fontFamily: fonts.serif, fontWeight: "700", fontSize: 19 },
  unit: { color: colors.muted, fontFamily: fonts.sans, fontSize: 7 },
  add: { marginLeft: "auto", width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: colors.rust },
  addDisabled: { backgroundColor: colors.muted },
  addText: { color: colors.paper, fontFamily: fonts.sansMedium, fontSize: 13 },
  caseNote: { marginTop: 7, color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 6.5, letterSpacing: 0.5 },
  allergens: { marginTop: 4, color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 6, letterSpacing: 0.5 },
  shelf: { marginTop: 4, color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 6, letterSpacing: 0.65 },
});
