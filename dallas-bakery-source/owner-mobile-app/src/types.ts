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
