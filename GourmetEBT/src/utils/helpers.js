export const formatPrice = (price) => {
  const safePrice = typeof price === 'number' && !isNaN(price) && isFinite(price) ? price : 0;
  return `$${Math.max(0, safePrice).toFixed(2)}`;
};

export const hexToRgba = (hex, alpha = 1) => {
  if (typeof hex !== 'string' || hex.length < 7 || hex[0] !== '#') {
    return `rgba(0, 0, 0, ${alpha})`;
  }
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) {
    return `rgba(0, 0, 0, ${alpha})`;
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const formatTime = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

export const formatDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

export const getOrderStatusColor = (status) => {
  const statusColors = {
    confirmed: '#3498db',
    shopping: '#f39c12',
    preparing: '#e67e22',
    cooking: '#e74c3c',
    ready: '#2ecc71',
    delivering: '#9b59b6',
    delivered: '#27ae60',
    cancelled: '#95a5a6',
  };
  return statusColors[status] || '#95a5a6';
};

export const getOrderStatusText = (status) => {
  const statusText = {
    confirmed: 'Order Confirmed',
    shopping: 'Shopping for Ingredients',
    preparing: 'Preparing Ingredients',
    cooking: 'Chef is Cooking',
    ready: 'Ready for Delivery',
    delivering: 'Out for Delivery',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
  };
  return statusText[status] || status;
};

export const getOrderStatusIcon = (status) => {
  const statusIcons = {
    confirmed: 'check-circle',
    shopping: 'shopping-cart',
    preparing: 'kitchen',
    cooking: 'local-fire-department',
    ready: 'check-circle',
    delivering: 'delivery-dining',
    delivered: 'done-all',
    cancelled: 'cancel',
  };
  return statusIcons[status] || 'help';
};

export const getTimeAgo = (dateString) => {
  if (!dateString) return '';
  const now = new Date();
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  const diffMinutes = Math.floor((now - date) / (1000 * 60));

  if (diffMinutes < 0) return 'Just now';
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return formatDate(dateString);
};

// Mock EBT card validation
export const validateEbtCard = (cardNumber) => {
  if (typeof cardNumber !== 'string') return false;
  // EBT cards are typically 16-19 digits
  const cleaned = cardNumber.replace(/\D/g, '');
  return cleaned.length >= 16 && cleaned.length <= 19;
};

export const maskCardNumber = (cardNumber) => {
  if (typeof cardNumber !== 'string') return '****';
  const cleaned = cardNumber.replace(/\D/g, '');
  if (cleaned.length < 4) return '****';
  return `****${cleaned.slice(-4)}`;
};

// Round money to avoid floating point issues
export const roundMoney = (amount) => {
  if (typeof amount !== 'number' || !isFinite(amount)) return 0;
  return Math.round(amount * 100) / 100;
};
