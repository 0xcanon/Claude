export const formatPrice = (price) => {
  const safePrice = typeof price === 'number' && !isNaN(price) ? price : 0;
  return `$${safePrice.toFixed(2)}`;
};

export const hexToRgba = (hex, alpha = 1) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const formatTime = (dateString) => {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

export const formatDate = (dateString) => {
  const date = new Date(dateString);
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
  const now = new Date();
  const date = new Date(dateString);
  const diffMinutes = Math.floor((now - date) / (1000 * 60));

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return formatDate(dateString);
};

// Mock EBT card validation
export const validateEbtCard = (cardNumber) => {
  // EBT cards are typically 16-19 digits
  const cleaned = cardNumber.replace(/\D/g, '');
  return cleaned.length >= 16 && cleaned.length <= 19;
};

export const maskCardNumber = (cardNumber) => {
  const cleaned = cardNumber.replace(/\D/g, '');
  return `****${cleaned.slice(-4)}`;
};
