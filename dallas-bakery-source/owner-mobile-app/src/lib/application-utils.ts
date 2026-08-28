import type {
  ApplicationCounts,
  ApplicationFilter,
  WholesaleApplication,
} from "../types";

const businessTypeLabels: Record<string, string> = {
  restaurant: "Restaurant / caterer",
  grocery: "Grocery / food market",
  hospitality: "Hotel / hospitality",
  institution: "School / institution",
  "food-distributor": "Food distributor",
};

export function businessTypeLabel(value: string) {
  return businessTypeLabels[value] || value;
}

export function statusLabel(status: string) {
  if (status === "approved") return "Approved";
  if (status === "declined") return "Declined";
  return "Pending";
}

export function addressOf(application: WholesaleApplication) {
  return [
    application.street,
    application.street2,
    `${application.city}, ${application.state} ${application.zip}`,
  ].filter(Boolean).join(", ");
}

export function formatApplicationDate(value: string) {
  const normalized = value.includes("T") ? value : value.replace(" ", "T") + "Z";
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
  }).format(parsed);
}

export function countApplications(applications: WholesaleApplication[]): ApplicationCounts {
  return applications.reduce<ApplicationCounts>((counts, application) => {
    counts.total += 1;
    counts[application.status] += 1;
    if (application.multipleLocations) counts.multiLocation += 1;
    return counts;
  }, { pending: 0, approved: 0, declined: 0, multiLocation: 0, total: 0 });
}

export function filterApplications(
  applications: WholesaleApplication[],
  filter: ApplicationFilter,
  query: string,
) {
  const needle = query.trim().toLowerCase();
  return applications.filter((application) => {
    if (filter !== "all" && application.status !== filter) return false;
    if (!needle) return true;
    return [
      application.businessName,
      application.contactName,
      application.email,
      application.phone,
      application.city,
      application.state,
    ].join(" ").toLowerCase().includes(needle);
  });
}

export function normalizeSignal(value: string) {
  return value.replaceAll("-", " ").replaceAll("_", " ");
}
