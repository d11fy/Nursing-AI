export type AccessKind = "trial" | "paid" | "grace" | "expired";

export type EntitlementValue = boolean | number | string | null;

export interface SubscriptionAccess {
  kind: AccessKind;
  active: boolean;
  planId: string | null;
  planName: string;
  startsAt: string | null;
  endsAt: string | null;
  daysRemaining: number;
  entitlements: Record<string, EntitlementValue>;
  pendingPayment: boolean;
}

export interface UsageReservation {
  userId: string;
  featureKey: string;
  scopeType: "daily" | "trial" | "subscription";
  scopeKey: string;
  used: number;
  limit: number;
}

export interface UsageItem {
  key: string;
  used: number;
  limit: number;
  scope: string;
}
