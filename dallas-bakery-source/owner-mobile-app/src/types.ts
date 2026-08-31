export type ApplicationStatus = "pending" | "approved" | "declined";
export type ApplicationFilter = ApplicationStatus | "all";

export type WholesaleApplication = {
  id: string;
  businessName: string;
  businessType: string;
  contactName: string;
  email: string;
  phone: string;
  website: string;
  street: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  multipleLocations: boolean;
  locationCount: number;
  additionalMarkets: string;
  screeningStatus: string;
  addressScreening: string;
  categoryScreening: string;
  standardizedAddress: string;
  matchedBusiness: string;
  status: ApplicationStatus;
  ownerNotes: string;
  decidedBy: string;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OwnerUser = {
  displayName: string;
  email: string;
};

export type MobileSession = {
  token: string;
  expiresAt: number;
  requiresPasswordChange: boolean;
  user: OwnerUser;
};

export type ShippingSettings = {
  rateCents: number;
  unitsPerBox: number;
  formattedRate: string;
  updatedAt: string | null;
};

export type ApplicationCounts = {
  pending: number;
  approved: number;
  declined: number;
  multiLocation: number;
  total: number;
};

/* ------------------------------------------- running the day from the app -- */

export type OrderStatus =
  | "paid" | "held" | "labeled" | "shipped" | "delivered" | "cancelled" | "refunded";

export type OrderItem = {
  sku: string;
  name: string;
  quantity: number;
  unitAmountCents: number;
};

export type OwnerOrder = {
  id: string;
  orderNumber: number;
  customerName: string;
  email: string;
  phone: string;
  street: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  items: OrderItem[];
  caseCount: number;
  loafCount: number;
  boxCount: number;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  refundedCents: number;
  status: OrderStatus;
  holdReason: string;
  cancelRequestedAt: string | null;
  cancelReason: string;
  paymentTerms: "card" | "account";
  invoicePaidAt: string | null;
  invoiceDueAt: string | null;
  poNumber: string;
  requestedDeliveryDate: string | null;
  trackingNumber: string;
  trackingUrl: string;
  hasLabel: boolean;
  labelError: string;
  createdAt: string;
  shippedAt: string | null;
};

export type OrderEvent = {
  id: string;
  kind: string;
  summary: string;
  detail: string;
  who: string;
  amountCents: number;
  buyerVisible: boolean;
  at: string;
};

export type BakeLine = { sku: string; name: string; cases: number; loaves: number };

export type DaySummary = {
  toBake: number;
  boxes: number;
  cases: number;
  readyToShip: number;
  onHold: number;
  owedCents: number;
  overdueInvoices: number;
};

export type OwnerSummary = {
  today: string;
  summary: DaySummary;
  bakeSheet: BakeLine[];
  applicationsWaiting: number;
  problemsOpen: number;
  ups: { connected: boolean; environment: string };
};

export type SupportCase = {
  id: string;
  businessName: string;
  contactEmail: string;
  orderId: string;
  orderNumber: number;
  reason: string;
  reasonLabel: string;
  likelyRefund: boolean;
  message: string;
  status: "open" | "answered" | "resolved";
  reply: string;
  ownerNotes: string;
  urgency: "now" | "today" | "soon";
  waitingFor: string;
  openedAt: string;
  resolvedAt: string | null;
};

export type StockState = { available: boolean; label: string; detail?: string };

export type OwnerProduct = {
  sku: string;
  title: string;
  imageUrl: string;
  active: boolean;
  inStock: boolean;
  loavesPerCase: number;
  loafPriceCents: number;
  dailyCapacityCases: number;
  committedToday: number;
  stock: StockState;
};

export type LabelOutcome = {
  id: string;
  orderNumber: number;
  customerName: string;
  ok: boolean;
  trackingNumber?: string;
  error?: string;
};
