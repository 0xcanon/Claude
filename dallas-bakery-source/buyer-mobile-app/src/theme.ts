import { Platform } from "react-native";

export const colors = {
  chocolate: "#2B1A13",
  chocolateSoft: "#3A241A",
  cream: "#F5EDDF",
  paper: "#FFF9EF",
  rust: "#C84A2A",
  rustDark: "#A93920",
  gold: "#E8B14C",
  goldPale: "#F6E7B6",
  sage: "#58705A",
  sagePale: "#DCE8DA",
  rosePale: "#F0D8D0",
  ink: "#2D211C",
  muted: "#756A63",
  line: "#D8CCBC",
  lineDark: "#5B4539",
  white: "#FFFFFF",
  danger: "#A33A2C"
};

export const fonts = {
  serif: Platform.select({ ios: "Georgia", android: "serif", default: "serif" }),
  sansMedium: Platform.select({ ios: "Avenir Next", android: "sans-serif-medium", default: "System" }),
  sans: Platform.select({ ios: "Avenir Next", android: "sans-serif", default: "System" })
};

export const shadow = Platform.select({
  ios: {
    shadowColor: colors.chocolate,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.09,
    shadowRadius: 20
  },
  android: { elevation: 3 },
  default: {}
});
