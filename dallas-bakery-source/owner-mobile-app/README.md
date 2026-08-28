# Dallas Bakery Owner App

A native owner portal for Dallas Bakery Wholesale. One Expo/React Native project builds for both iPhone and Android.

## Included

- Site-branded owner sign-in for `sales@dallasbakery.com`
- Encrypted session storage through the iOS Keychain and Android Keystore
- Pending, approved, declined, and all-application filters
- Search by business, contact, city, email, or phone
- Address and food-business screening signals
- Multiple-location support
- Private owner notes
- Approve, decline, and return-to-pending actions
- Neutral private-store sync status after approval
- One-tap store-setup retry when a connection problem occurs
- Live shipping editor shared with the website and checkout rate service
- Direct email, phone, website, and map links
- Pull-to-refresh and automatic expired-session handling
- Fifteen-second network timeouts and locally enforced eight-hour session expiry
- First-login password-change screen

## Run it

1. Install Node.js 22 or newer.
2. In this folder, run `npm install`.
3. Copy `.env.example` to `.env`.
4. Run `npm start`.
5. Open the project on an iPhone/Android development build or simulator.

Production and preview EAS profiles point to `https://dallasbakery.net`. Connect that domain to the wholesale backend and make its customer/API routes public before building a release. Override `EXPO_PUBLIC_API_URL` only for a controlled staging build.

## Build installable apps

1. Create or sign in to an Expo account: `npx eas-cli login`.
2. Link the project: `npx eas-cli init`.
3. For an internal test build, run `npx eas-cli build --platform all --profile preview`.
4. For store builds, run `npx eas-cli build --platform all --profile production`.
5. Submit with `npx eas-cli submit --platform all --profile production` after completing each store listing.

Publishing requires your own Apple Developer and Google Play Console accounts. Keep signing keys and store credentials out of the source folder.

Before submission, use `https://dallasbakery.net/privacy` as the privacy-policy URL, add the support email `sales@dallasbakery.com`, capture final device screenshots, complete App Store privacy and Google Play data-safety declarations, and test a release build against the production domain.

## Security notes

- Passwords are never saved on the device.
- The mobile session token is encrypted by `expo-secure-store`.
- The backend limits failed login attempts and expires sessions after eight hours.
- Approval writes require a valid owner token and use HTTPS.
- Commerce-administration credentials stay on the website server and are never included in the app.
- Signing out deletes the saved session from the phone.

## App identifiers

- iOS bundle identifier: `com.dallasbakery.owner`
- Android package: `com.dallasbakery.owner`
- URL scheme: `dallasbakeryowner`

Change these before the first store submission only if you want a different permanent identifier.
