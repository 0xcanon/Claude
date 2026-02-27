import { create } from 'zustand';

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
  setUser: (userData) => set((state) => ({
    user: { ...state.user, ...userData },
  })),

  // ============ EBT STATE ============
  ebtBalance: 0,
  ebtCardLinked: false,
  ebtCardLast4: '',
  linkEbtCard: (last4, balance) => set({
    ebtCardLinked: true,
    ebtCardLast4: last4,
    ebtBalance: balance,
  }),
  unlinkEbtCard: () => set({
    ebtCardLinked: false,
    ebtCardLast4: '',
    ebtBalance: 0,
  }),

  // ============ CART STATE ============
  cart: [],
  cartKitchenId: null,

  addToCart: (item, kitchenId) => set((state) => {
    // If cart has items from different kitchen, ask to clear
    if (state.cartKitchenId && state.cartKitchenId !== kitchenId) {
      return state; // Don't add - UI should handle this case
    }
    const existingIndex = state.cart.findIndex((i) => i.id === item.id);
    if (existingIndex >= 0) {
      const newCart = [...state.cart];
      newCart[existingIndex] = {
        ...newCart[existingIndex],
        quantity: newCart[existingIndex].quantity + 1,
      };
      return { cart: newCart, cartKitchenId: kitchenId };
    }
    return {
      cart: [...state.cart, { ...item, quantity: 1 }],
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
    return {
      cart: state.cart.map((i) =>
        i.id === itemId ? { ...i, quantity } : i
      ),
    };
  }),

  clearCart: () => set({ cart: [], cartKitchenId: null }),

  getCartTotal: () => {
    const { cart } = get();
    return cart.reduce((total, item) => total + item.price * item.quantity, 0);
  },

  getCartItemCount: () => {
    const { cart } = get();
    return cart.reduce((count, item) => count + item.quantity, 0);
  },

  // ============ ORDERS STATE ============
  orders: [],
  activeOrder: null,

  placeOrder: (paymentMethod) => set((state) => {
    const order = {
      id: `ORD-${Date.now()}`,
      items: [...state.cart],
      kitchenId: state.cartKitchenId,
      total: state.cart.reduce((t, i) => t + i.price * i.quantity, 0),
      groceryCost: state.cart.reduce((t, i) => t + i.groceryCost * i.quantity, 0),
      paymentMethod,
      status: 'confirmed',
      statusHistory: [
        { status: 'confirmed', time: new Date().toISOString(), message: 'Order confirmed! Chef is reviewing your order.' },
      ],
      createdAt: new Date().toISOString(),
      estimatedDelivery: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
      address: state.user.address,
    };

    const newBalance = paymentMethod === 'ebt'
      ? state.ebtBalance - order.total
      : state.ebtBalance;

    return {
      orders: [order, ...state.orders],
      activeOrder: order,
      cart: [],
      cartKitchenId: null,
      ebtBalance: newBalance,
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
    const activeOrder = state.activeOrder?.id === orderId
      ? { ...state.activeOrder, status, statusHistory: orders.find(o => o.id === orderId).statusHistory }
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
