import {
  OPERATOR_CONTACT_EMAIL,
  OPERATOR_LEGAL_NAME,
  OPERATOR_PRODUCT_NAME,
  operatorAbnDigits,
  operatorDisplayLine,
} from "./operator.js";

/** Card/bank statement text (Stripe max 22 characters). */
export function stripeStatementDescriptor() {
  const normalized = OPERATOR_PRODUCT_NAME.replace(/[^a-zA-Z0-9 ]/g, "").trim().toUpperCase();
  return normalized.slice(0, 22) || "QUIZZORA";
}

export function stripeProductDescription() {
  return `${OPERATOR_PRODUCT_NAME} school subscription (${operatorDisplayLine()})`;
}

export function stripePortalHeadline() {
  return `${OPERATOR_PRODUCT_NAME} — ${operatorDisplayLine()}`;
}

/** Values to set manually in Stripe Dashboard (standard accounts cannot self-update via API). */
export function stripeDashboardChecklist({ appBaseUrl } = {}) {
  const url = (appBaseUrl || process.env.APP_BASE_URL || "https://quizzora.org").replace(/\/$/, "");
  return [
    {
      area: "Settings → Business → Business details",
      fields: [
        { label: "Public business name", value: OPERATOR_PRODUCT_NAME },
        { label: "Support email", value: OPERATOR_CONTACT_EMAIL },
        { label: "Website", value: url },
      ],
    },
    {
      area: "Settings → Business → Legal entity",
      fields: [
        { label: "Legal business name", value: OPERATOR_LEGAL_NAME },
        ...(operatorAbnDigits()
          ? [{ label: "ABN / tax ID", value: operatorAbnDigits() }]
          : []),
      ],
    },
    {
      area: "Settings → Payments → Statement descriptor",
      fields: [{ label: "Descriptor", value: stripeStatementDescriptor() }],
    },
    {
      area: "Settings → Billing → Invoice settings",
      fields: [{ label: "Default footer", value: operatorDisplayLine() }],
    },
  ];
}

function uniqueProductIdsFromPrices(prices) {
  const ids = new Set();
  for (const price of prices) {
    const product = price?.product;
    const productId = typeof product === "string" ? product : product?.id;
    if (productId) {
      ids.add(productId);
    }
  }
  return [...ids];
}

export async function syncStripeProducts(stripe) {
  const priceIds = [
    process.env.STRIPE_PRICE_MONTHLY,
    process.env.STRIPE_PRICE_YEARLY,
    process.env.STRIPE_PRICE_FAMILY_MONTHLY,
    process.env.STRIPE_PRICE_FAMILY_YEARLY,
  ].filter(Boolean);
  if (!priceIds.length) {
    return [];
  }

  const prices = await Promise.all(
    priceIds.map((priceId) => stripe.prices.retrieve(priceId, { expand: ["product"] })),
  );
  const productIds = uniqueProductIdsFromPrices(prices);
  const updates = [];

  for (const productId of productIds) {
    const product = await stripe.products.update(productId, {
      name: OPERATOR_PRODUCT_NAME,
      statement_descriptor: stripeStatementDescriptor(),
      description: stripeProductDescription(),
    });
    updates.push(product);
  }

  return updates;
}

export async function syncStripeBillingPortal(stripe, { appBaseUrl } = {}) {
  const url = (appBaseUrl || process.env.APP_BASE_URL || "https://quizzora.org").replace(/\/$/, "");
  const businessProfile = {
    headline: stripePortalHeadline(),
    privacy_policy_url: `${url}/legal/privacy`,
    terms_of_service_url: `${url}/legal/terms`,
  };
  const features = {
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: { enabled: true },
    subscription_update: { enabled: false },
  };

  const existing = await stripe.billingPortal.configurations.list({ limit: 10 });
  const current =
    existing.data.find((config) => config.is_default) ||
    existing.data.find((config) => config.active) ||
    existing.data[0];

  if (current) {
    return stripe.billingPortal.configurations.update(current.id, {
      business_profile: businessProfile,
      features,
      default_return_url: `${url}/admin/billing`,
    });
  }

  return stripe.billingPortal.configurations.create({
    business_profile: businessProfile,
    features,
    default_return_url: `${url}/admin/billing`,
  });
}

/** Apply every Stripe change this integration can make via API. */
export async function syncStripeBusinessProfile(stripe, options = {}) {
  const products = await syncStripeProducts(stripe);
  const portal = await syncStripeBillingPortal(stripe, options);
  return { products, portal, dashboardChecklist: stripeDashboardChecklist(options) };
}
