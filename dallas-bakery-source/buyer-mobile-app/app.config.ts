// The app's own URL scheme. Stripe returns here after any payment step that
// leaves the app (3-D Secure, wallets), so it must match the scheme registered
// with the PaymentSheet in src/lib/payments.
const APP_SCHEME = "dallasbakerywholesale";

// Signed builds must never ship without a live API and Stripe key: the app
// would install cleanly and then dead-end at checkout. Fail the build loudly
// instead. Set these as EAS environment variables for the preview and
// production profiles before building.
function looksUnset(value: string | undefined) {
  const trimmed = String(value || "").trim();
  return !trimmed || trimmed.includes("your-") || trimmed.includes("example.com");
}

if (process.env.EAS_BUILD === "true") {
  const requiredForSignedBuilds = [
    "EXPO_PUBLIC_API_URL",
    "EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  ];
  const missing = requiredForSignedBuilds.filter((name) => looksUnset(process.env[name]));
  if (missing.length) {
    throw new Error(
      `Signed Dallas Bakery buyer builds need real values for: ${missing.join(", ")}. ` +
      "Add them as EAS environment variables for this build profile, then rebuild. " +
      "See buyer-mobile-app/README.md.",
    );
  }
  const apiUrl = String(process.env.EXPO_PUBLIC_API_URL || "").trim();
  if (!/^https:\/\//.test(apiUrl)) {
    throw new Error(
      "EXPO_PUBLIC_API_URL must be an https:// URL — a shipped build talking to " +
      "an http endpoint would leak buyer sessions in transit.",
    );
  }
  const publishable = String(process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || "");
  if (publishable && !publishable.startsWith("pk_")) {
    throw new Error(
      "EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY must be a Stripe publishable key (pk_live_… or pk_test_…). " +
      "Never put a secret key (sk_…) in the app — it ships to every device.",
    );
  }
}

export default {
  expo: {
    name: "Dallas Bakery Wholesale",
    slug: "dallas-bakery-buyer",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    scheme: APP_SCHEME,
    userInterfaceStyle: "light",
    newArchEnabled: true,
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#2B1A13"
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: "com.dallasbakery.wholesale",
      config: { usesNonExemptEncryption: false }
    },
    android: {
      package: "com.dallasbakery.wholesale",
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#2B1A13"
      },
      edgeToEdgeEnabled: true
    },
    // The EAS project id. expo-notifications needs it to mint a push token in
    // a signed build; set EXPO_PUBLIC_EAS_PROJECT_ID (or run `eas init`, which
    // writes it here) before building. Without it the app still runs — push
    // registration simply returns nothing and the buyer gets email only.
    extra: {
      eas: { projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID || undefined }
    },
    plugins: [
      [
        "expo-splash-screen",
        {
          image: "./assets/splash-icon.png",
          resizeMode: "contain",
          backgroundColor: "#2B1A13"
        }
      ],
      [
        "expo-notifications",
        {
          // Order confirmations, shipping, and invoice reminders. The icon is
          // the Android status-bar glyph; iOS uses the app icon.
          icon: "./assets/adaptive-icon.png",
          color: "#2B1A13"
        }
      ],
      [
        "expo-secure-store",
        {
          configureAndroidBackup: true,
          faceIDPermission: "Allow Dallas Bakery to protect your wholesale account."
        }
      ],
      [
        "@stripe/stripe-react-native",
        {
          // Apple Pay and Google Pay are not enabled: wholesale buyers pay by
          // card on terms, and enabling a wallet would need merchant setup
          // that does not exist yet.
          enableGooglePay: false
        }
      ]
    ]
  }
};
