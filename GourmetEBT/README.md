# GourmetEBT - Ghost Kitchen Gourmet Delivery for EBT Customers

A mobile app that brings the gourmet restaurant experience to EBT (Electronic Benefits Transfer) cardholders through a ghost kitchen model.

## Concept

GourmetEBT operates as a ghost restaurant service where:

1. **Customers browse** gourmet meal options from multiple virtual kitchens
2. **Professional chefs** shop for fresh ingredients from local grocery stores (EBT-eligible)
3. **Chefs prepare** restaurant-quality gourmet meals from those grocery ingredients
4. **Meals are delivered** hot to the customer's door
5. **Payment via EBT** - since all ingredients are grocery-store food items, they qualify for EBT/SNAP benefits

## Key Features

### Customer App
- Browse multiple ghost kitchen cuisines (Soul Food, Latin, Asian, Italian, American, Plant-Based)
- Full gourmet menu with descriptions, ingredients, dietary info
- EBT card linking and balance checking
- Real-time order tracking (shopping → prepping → cooking → delivery)
- Order history and favorites

### Chef Dashboard
- Kitchen order management with grocery shopping lists
- Order status workflow (Shopping → Preparing → Cooking → Ready → Delivering)
- Revenue and order analytics
- Real-time order queue

### EBT Payment Integration
- Card linking with mock validation
- Balance checking
- Payment processing for EBT-eligible grocery items
- Designed for integration with EBT processors (Forage, Soda)

## Tech Stack

- **Frontend**: React Native + Expo (iOS, Android, Web)
- **Navigation**: React Navigation 7 (tabs + stack)
- **State Management**: Zustand
- **Backend**: Node.js + Express
- **Styling**: Custom dark theme with gold accent

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Expo CLI (`npm install -g expo-cli`)

### Installation

```bash
# Install frontend dependencies
cd GourmetEBT
npm install

# Install backend dependencies
cd server
npm install
```

### Running the App

```bash
# Start the Expo development server
npm start

# Start the backend API (separate terminal)
npm run server
```

### Running on Devices
- **iOS Simulator**: Press `i` in the Expo terminal
- **Android Emulator**: Press `a` in the Expo terminal
- **Physical Device**: Scan QR code with Expo Go app
- **Web Browser**: Press `w` in the Expo terminal

## Project Structure

```
GourmetEBT/
├── App.js                    # App entry point
├── app.json                  # Expo configuration
├── src/
│   ├── components/           # Reusable UI components
│   │   ├── EbtBanner.js      # EBT card status/link banner
│   │   ├── KitchenCard.js    # Ghost kitchen listing card
│   │   ├── MenuItemCard.js   # Menu item with add-to-cart
│   │   └── OrderStatusBar.js # Active order status indicator
│   ├── data/
│   │   ├── menuItems.js      # Menu data for all kitchens
│   │   └── stores.js         # Ghost kitchen data
│   ├── navigation/
│   │   └── AppNavigator.js   # Tab + stack navigation setup
│   ├── screens/
│   │   ├── HomeScreen.js          # Main browsing screen
│   │   ├── KitchenDetailScreen.js # Kitchen menu view
│   │   ├── ItemDetailScreen.js    # Meal detail + add to cart
│   │   ├── CartScreen.js          # Shopping cart
│   │   ├── CheckoutScreen.js      # EBT payment + checkout
│   │   ├── OrderConfirmationScreen.js  # Order success
│   │   ├── OrdersScreen.js        # Order history
│   │   ├── OrderTrackingScreen.js # Live order tracking
│   │   ├── ProfileScreen.js       # User profile + EBT card
│   │   └── ChefDashboardScreen.js # Chef kitchen management
│   ├── store/
│   │   └── useStore.js       # Zustand global state
│   ├── theme/
│   │   ├── colors.js         # Color palette
│   │   ├── spacing.js        # Spacing + border radius
│   │   └── typography.js     # Font sizes + weights
│   └── utils/
│       └── helpers.js        # Formatting + utility functions
└── server/
    └── index.js              # Express API server
```

## Business Model

- Chefs purchase grocery ingredients (EBT-eligible) and add a preparation/service fee
- The grocery cost is covered by EBT benefits
- Service fees and tips can be paid via other methods
- Free delivery to maximize accessibility

## EBT Compliance Notes

For production deployment, EBT/SNAP payment processing requires:
- USDA FNS authorization as an approved retailer
- Integration with certified EBT payment processors
- Compliance with SNAP-eligible food item regulations
- All items must qualify as food for home consumption

## License

Private - All rights reserved.
