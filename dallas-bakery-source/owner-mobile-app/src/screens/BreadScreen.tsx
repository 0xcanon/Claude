import { useState } from "react";
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from "react-native";

import { colors, fonts } from "../theme";
import type { OwnerProduct } from "../types";

type Props = {
  products: OwnerProduct[];
  loading: boolean;
  error: string;
  busy: string;
  notice: string;
  onRefresh: () => Promise<void>;
  onSetStock: (sku: string, inStock: boolean) => Promise<void>;
  onSetCapacity: (sku: string, cases: number) => Promise<void>;
};

/**
 * Stock control, for when you are standing at the oven rather than a desk.
 *
 * Deliberately narrow: a bread can be taken off sale and the day's capacity
 * capped, and nothing else. Ingredients, allergens and box dimensions are
 * edited in the portal, where there is room to read what you are changing —
 * getting an allergen wrong on a phone is not a risk worth the convenience.
 */
export function BreadScreen({
  products, loading, error, busy, notice, onRefresh, onSetStock, onSetCapacity,
}: Props) {
  const [editing, setEditing] = useState("");
  const [capacity, setCapacity] = useState("");

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void onRefresh()} tintColor={colors.rust} />}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.kicker}>WHAT IS ON SALE</Text>
      <Text accessibilityRole="header" style={styles.title}>Bread</Text>
      <Text style={styles.intro}>
        Turn a bread off and it disappears from the catalog straight away, so nobody orders what you
        cannot bake. Everything else about a product is edited in the web portal.
      </Text>

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading && products.length === 0 ? <ActivityIndicator color={colors.rust} style={styles.loading} /> : null}

      {products.map((product) => {
        const open = editing === product.sku;
        return (
          <View key={product.sku} style={[styles.card, !product.inStock && styles.cardOff]}>
            <View style={styles.head}>
              <View style={styles.headCopy}>
                <Text style={styles.name}>{product.title}</Text>
                <Text style={styles.sku}>{product.sku}</Text>
              </View>
              <Switch
                accessibilityLabel={`${product.title} on sale`}
                disabled={busy === product.sku}
                onValueChange={(next) => void onSetStock(product.sku, next)}
                thumbColor={colors.white}
                trackColor={{ false: colors.line, true: colors.sage }}
                value={product.inStock}
              />
            </View>

            <Text style={[styles.state, !product.stock.available && styles.stateOff]}>
              {product.stock.label}
              {product.stock.detail ? ` — ${product.stock.detail}` : ""}
            </Text>

            <Text style={styles.meta}>
              {product.loavesPerCase} loaves a case
              {product.dailyCapacityCases > 0
                ? ` · ${product.committedToday} of ${product.dailyCapacityCases} cases taken today`
                : " · no daily cap"}
            </Text>

            <Pressable
              accessibilityRole="button"
              onPress={() => {
                const next = open ? "" : product.sku;
                setEditing(next);
                setCapacity(next ? String(product.dailyCapacityCases || "") : "");
              }}
              style={styles.capLink}
            >
              <Text style={styles.capLinkText}>{open ? "NEVER MIND" : "SET TODAY'S LIMIT"}</Text>
            </Pressable>

            {open && (
              <View style={styles.capForm}>
                <Text style={styles.label}>
                  How many cases can you bake in a day? Leave 0 for no limit.
                </Text>
                <TextInput
                  inputMode="numeric"
                  onChangeText={setCapacity}
                  placeholder="0"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                  value={capacity}
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={busy === product.sku}
                  onPress={() => {
                    const cases = Number(capacity || 0);
                    if (!Number.isInteger(cases) || cases < 0) return;
                    void onSetCapacity(product.sku, cases).then(() => setEditing(""));
                  }}
                  style={[styles.save, busy === product.sku && styles.off]}
                >
                  <Text style={styles.saveText}>{busy === product.sku ? "SAVING…" : "SAVE THE LIMIT"}</Text>
                </Pressable>
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 24, paddingBottom: 40 },
  kicker: { color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 9.6, letterSpacing: 1.4 },
  title: { marginTop: 9, color: colors.chocolate, fontFamily: fonts.serif, fontSize: 32 },
  intro: { marginTop: 10, color: colors.muted, fontFamily: fonts.sans, fontSize: 11.5, lineHeight: 18 },
  notice: { marginTop: 14, padding: 11, color: "#33482F", backgroundColor: colors.sagePale, fontFamily: fonts.sans, fontSize: 11 },
  error: { marginTop: 14, padding: 11, color: "#7C2A1C", backgroundColor: colors.rosePale, fontFamily: fonts.sans, fontSize: 11 },
  loading: { marginTop: 28 },

  card: { marginTop: 14, padding: 15, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  cardOff: { backgroundColor: colors.cream },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  headCopy: { flex: 1 },
  name: { color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 13 },
  sku: { marginTop: 3, color: colors.muted, fontFamily: fonts.sans, fontSize: 9.6 },
  state: { marginTop: 10, color: colors.sage, fontFamily: fonts.sansMedium, fontSize: 10.5 },
  stateOff: { color: colors.danger },
  meta: { marginTop: 5, color: colors.muted, fontFamily: fonts.sans, fontSize: 10.5 },
  capLink: { marginTop: 11 },
  capLinkText: { color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 8.8, letterSpacing: 0.9 },
  capForm: { marginTop: 11, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line },
  label: { color: colors.muted, fontFamily: fonts.sans, fontSize: 10.5, lineHeight: 15 },
  input: { marginTop: 7, minHeight: 44, paddingHorizontal: 11, borderWidth: 1, borderColor: colors.line, color: colors.ink, fontFamily: fonts.sans, fontSize: 12, backgroundColor: colors.white },
  save: { marginTop: 11, minHeight: 44, alignItems: "center", justifyContent: "center", backgroundColor: colors.chocolate },
  saveText: { color: colors.white, fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 1 },
  off: { opacity: 0.45 },
});
