import { create } from 'zustand';
import { roundMoney } from '../utils/helpers';

// Generate unique order ID
const generateOrderId = () => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `ORD-${timestamp}-${random}`.toUpperCase();
};

// Max quantity per item
const MAX_ITEM_QUANTITY = 99;

// Allowed user fields for setUser
const ALLOWED_USER_FIELDS = ['name', 'email', 'phone', 'address'];

export const useStore = create((set, get) => ({
  // ============ USER STATE ============
  user: {
    id: 'user-1',
    name: 'Guest',
    email: '',
    phone: '',
    address: '123 Main St, Anytown, USA',
    ebtCard: null,
    isLoggedIn: false,
  },
  setUser: (userData) => set((state) => {
    // Only allow known fields to prevent injection
    const sanitized = {};
    for (const key of ALLOWED_USER_FIELDS) {
      if (key in userData && typeof userData[key] === 'string') {
        sanitized[key] = userData[key].trim().slice(0, 500);
      }
    }
    return { user: { ...state.user, ...sanitized } };
  }),

  // ============ EBT STATE ============
  ebtBalance: 0,
  ebtCardLinked: false,
  ebtCardLast4: '',
  linkEbtCard: (last4, balance) => {
    // Validate inputs
    const safeLast4 = typeof last4 === 'string' ? last4.replace(/\D/g, '').slice(-4) : '';
    const safeBalance = typeof balance === 'number' && isFinite(balance) && balance >= 0 ? balance : 0;
    set({
      ebtCardLinked: safeLast4.length === 4,
      ebtCardLast4: safeLast4,
      ebtBalance: roundMoney(safeBalance),
    });
  },
  unlinkEbtCard: () => set({
    ebtCardLinked: false,
    ebtCardLast4: '',
    ebtBalance: 0,
  }),

  // ============ CART STATE ============
  cart: [],
  cartKitchenId: null,

  addToCart: (item, kitchenId, qty = 1) => set((state) => {
    // Validate qty
    if (typeof qty !== 'number' || qty < 1) qty = 1;

    // If cart has items from different kitchen, don't add - UI should handle this case
    if (state.cartKitchenId && state.cartKitchenId !== kitchenId) {
      return {}; // Return empty object for no-op (not state, which causes re-renders)
    }
    const existingIndex = state.cart.findIndex((i) => i.id === item.id);
    if (existingIndex >= 0) {
      const newCart = [...state.cart];
      const newQty = Math.min(newCart[existingIndex].quantity + qty, MAX_ITEM_QUANTITY);
      newCart[existingIndex] = {
        ...newCart[existingIndex],
        quantity: newQty,
      };
      return { cart: newCart, cartKitchenId: kitchenId };
    }
    return {
      cart: [...state.cart, { ...item, quantity: Math.min(qty, MAX_ITEM_QUANTITY) }],
      cartKitchenId: kitchenId,
    };
  }),

  removeFromCart: (itemId) => set((state) => {
    const newCart = state.cart.filter((i) => i.id !== itemId);
    return {
      cart: newCart,
      cartKitchenId: newCart.length > 0 ? state.cartKitchenId : null,
    };
  }),

  updateQuantity: (itemId, quantity) => set((state) => {
    if (quantity <= 0) {
      const newCart = state.cart.filter((i) => i.id !== itemId);
      return {
        cart: newCart,
        cartKitchenId: newCart.length > 0 ? state.cartKitchenId : null,
      };
    }
    const clampedQty = Math.min(quantity, MAX_ITEM_QUANTITY);
    return {
      cart: state.cart.map((i) =>
        i.id === itemId ? { ...i, quantity: clampedQty } : i
      ),
    };
  }),

  clearCart: () => set({ cart: [], cartKitchenId: null }),

  getCartTotal: () => {
    const { cart } = get();
    return roundMoney(cart.reduce((total, item) => total + roundMoney(item.price * item.quantity), 0));
  },

  getCartItemCount: () => {
    const { cart } = get();
    return cart.reduce((count, item) => count + item.quantity, 0);
  },

  // ============ ORDERS STATE ============
  orders: [],
  activeOrder: null,

  placeOrder: (paymentMethod, serviceFee = 0, tipAmount = 0) => set((state) => {
    // Guard: don't place empty orders
    if (state.cart.length === 0) return {};

    const subtotal = roundMoney(state.cart.reduce((t, i) => t + roundMoney(i.price * i.quantity), 0));
    const groceryCost = roundMoney(state.cart.reduce((t, i) => t + roundMoney((i.groceryCost || 0) * i.quantity), 0));
    const total = roundMoney(subtotal + serviceFee + tipAmount);

    // Guard: EBT balance check in store (defense in depth)
    if (paymentMethod === 'ebt' && state.ebtBalance < groceryCost) {
      return {};
    }

    const order = {
      id: generateOrderId(),
      items: [...state.cart],
      kitchenId: state.cartKitchenId,
      subtotal,
      total,
      groceryCost,
      serviceFee: roundMoney(serviceFee),
      tipAmount: roundMoney(tipAmount),
      paymentMethod,
      status: 'confirmed',
      statusHistory: [
        { status: 'confirmed', time: new Date().toISOString(), message: 'Order confirmed! Chef is reviewing your order.' },
      ],
      createdAt: new Date().toISOString(),
      estimatedDelivery: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
      address: state.user.address,
    };

    // EBT deducts grocery cost only (SNAP eligible portion), not service fee or tip
    const newBalance = paymentMethod === 'ebt'
      ? roundMoney(state.ebtBalance - groceryCost)
      : state.ebtBalance;

    return {
      orders: [order, ...state.orders],
      activeOrder: order,
      cart: [],
      cartKitchenId: null,
      ebtBalance: Math.max(0, newBalance),
    };
  }),

  updateOrderStatus: (orderId, status, message) => set((state) => {
    const orders = state.orders.map((order) => {
      if (order.id === orderId) {
        return {
          ...order,
          status,
          statusHistory: [
            ...order.statusHistory,
            { status, time: new Date().toISOString(), message },
          ],
        };
      }
      return order;
    });

    const updatedOrder = orders.find(o => o.id === orderId);
    const activeOrder = state.activeOrder?.id === orderId && updatedOrder
      ? { ...updatedOrder }
      : state.activeOrder;

    return { orders, activeOrder };
  }),

  clearActiveOrder: () => set({ activeOrder: null }),

  // ============ FAVORITES ============
  favorites: [],
  toggleFavorite: (kitchenId) => set((state) => ({
    favorites: state.favorites.includes(kitchenId)
      ? state.favorites.filter((id) => id !== kitchenId)
      : [...state.favorites, kitchenId],
  })),

  // ============ CHEF/KITCHEN STATE ============
  chefMode: false,
  toggleChefMode: () => set((state) => ({ chefMode: !state.chefMode })),
  kitchenOrders: [
    {
      id: 'KO-1001',
      customerName: 'Sarah M.',
      items: [
        { name: 'Smoked Honey Glazed Chicken', quantity: 1, price: 14.99 },
        { name: 'Peach Cobbler Skillet', quantity: 1, price: 7.99 },
      ],
      total: 22.98,
      status: 'preparing',
      groceryList: ['Chicken thighs x2', 'Honey', 'Garlic bulb', 'Potatoes 2lb', 'Collard greens bunch', 'Butter', 'Peaches can', 'Flour', 'Sugar', 'Cinnamon'],
      createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      paymentMethod: 'ebt',
    },
    {
      id: 'KO-1002',
      customerName: 'James T.',
      items: [
        { name: 'Cajun Shrimp & Grits', quantity: 2, price: 16.99 },
      ],
      total: 33.98,
      status: 'shopping',
      groceryList: ['Jumbo shrimp 1lb', 'Stone-ground grits', 'Cheddar cheese', 'Andouille sausage', 'Bell peppers x3', 'Cajun seasoning'],
      createdAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
      paymentMethod: 'ebt',
    },
    {
      id: 'KO-1003',
      customerName: 'DeShawn R.',
      items: [
        { name: 'BBQ Brisket Mac & Cheese', quantity: 1, price: 15.99 },
        { name: 'Fried Catfish Plate', quantity: 1, price: 13.99 },
      ],
      total: 29.98,
      status: 'ready',
      groceryList: ['Beef brisket 1.5lb', 'Elbow pasta', 'Cheddar block', 'Gruyere', 'Gouda', 'Cream cheese', 'Red onion', 'Catfish fillets', 'Cornmeal', 'Cabbage'],
      createdAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
      paymentMethod: 'ebt',
    },
  ],
  updateKitchenOrderStatus: (orderId, status) => set((state) => ({
    kitchenOrders: state.kitchenOrders.map((order) =>
      order.id === orderId ? { ...order, status } : order
    ),
  })),
}));
