import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { formatDeliveryDate } from "../lib/format";
import { colors, fonts } from "../theme";
import type { DeliveryWindow } from "../types";

type Props = {
  poNumber: string;
  requestedDeliveryDate: string;
  deliveryWindow: DeliveryWindow | null;
  onChangePoNumber: (value: string) => void;
  onChangeDeliveryDate: (value: string) => void;
};

/**
 * The buyer's own paperwork on an order: a purchase-order reference, and the
 * day they'd like it to land.
 *
 * Both optional, and both presented that way — most orders carry neither, and
 * a required-looking field between a cart and a checkout button costs orders.
 * The date list comes from the server, computed from today's cutoff, so this
 * can never offer a day the bread physically cannot reach them by.
 */
export function OrderPaperwork({
  poNumber,
  requestedDeliveryDate,
  deliveryWindow,
  onChangePoNumber,
  onChangeDeliveryDate,
}: Props) {
  const [pickingDate, setPickingDate] = useState(false);
  const options = deliveryWindow?.options || [];

  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>YOUR PAPERWORK · OPTIONAL</Text>

      <Text style={styles.label}>PO NUMBER</Text>
      <TextInput
        accessibilityLabel="Purchase order number"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={40}
        onChangeText={onChangePoNumber}
        placeholder="Your reference, if you use one"
        placeholderTextColor={colors.muted}
        style={styles.input}
        value={poNumber}
      />
      <Text style={styles.hint}>It goes on the invoice and the packing slip.</Text>

      {options.length > 0 && (
        <>
          <Text style={[styles.label, styles.labelSpaced]}>DELIVERY DAY</Text>
          <Pressable
            accessibilityLabel="Choose a delivery day"
            accessibilityRole="button"
            onPress={() => setPickingDate((current) => !current)}
            style={styles.picker}
          >
            <Text style={styles.pickerValue}>
              {requestedDeliveryDate ? formatDeliveryDate(requestedDeliveryDate) : "As soon as it arrives"}
            </Text>
            <Text style={styles.pickerChevron}>{pickingDate ? "▴" : "▾"}</Text>
          </Pressable>

          {pickingDate && (
            <ScrollView nestedScrollEnabled style={styles.options}>
              <Pressable
                onPress={() => { onChangeDeliveryDate(""); setPickingDate(false); }}
                style={styles.option}
              >
                <Text style={!requestedDeliveryDate ? styles.optionActive : styles.optionText}>
                  As soon as it arrives
                </Text>
              </Pressable>
              {options.map((option) => (
                <Pressable
                  key={option}
                  onPress={() => { onChangeDeliveryDate(option); setPickingDate(false); }}
                  style={styles.option}
                >
                  <Text style={option === requestedDeliveryDate ? styles.optionActive : styles.optionText}>
                    {formatDeliveryDate(option)}
                    {option === deliveryWindow?.earliest ? "  · earliest" : ""}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          <Text style={styles.hint}>
            {requestedDeliveryDate
              ? `We'll aim for ${formatDeliveryDate(requestedDeliveryDate)}. UPS Ground dates are a request, not a guarantee.`
              : deliveryWindow
                ? `Shipping ${formatDeliveryDate(deliveryWindow.shipDate)}, most orders landing ${formatDeliveryDate(deliveryWindow.earliest)}–${formatDeliveryDate(deliveryWindow.latest)}.`
                : ""}
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 16, padding: 15, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  kicker: { color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 7, letterSpacing: 1 },
  label: { marginTop: 13, color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 7, letterSpacing: 0.9 },
  labelSpaced: { marginTop: 18 },
  input: {
    marginTop: 7,
    minHeight: 40,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.cream,
    color: colors.chocolate,
    fontFamily: fonts.sans,
    fontSize: 11,
  },
  hint: { marginTop: 6, color: colors.muted, fontFamily: fonts.sans, fontSize: 8.5, lineHeight: 13 },
  picker: {
    marginTop: 7,
    minHeight: 40,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.cream,
  },
  pickerValue: { color: colors.chocolate, fontFamily: fonts.sans, fontSize: 11 },
  pickerChevron: { color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 11 },
  options: { marginTop: 6, maxHeight: 176, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.cream },
  option: { minHeight: 38, paddingHorizontal: 11, justifyContent: "center", borderBottomWidth: 1, borderBottomColor: colors.line },
  optionText: { color: colors.chocolate, fontFamily: fonts.sans, fontSize: 11 },
  optionActive: { color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 11 },
});
