
const SHIPROCKET_BASE_URL =
  "https://apiv2.shiprocket.in/v1/external";

type ShiprocketAuthResponse = {
  token: string;
};

let cachedToken: string | null = null;
let tokenExpiresAt = 0;
let authPromise: Promise<string> | null = null;

async function authenticate(): Promise<string> {
const email = process.env["SHIPROCKET_EMAIL"];
const password = process.env["SHIPROCKET_PASSWORD"];

  if (!email || !password) {
    throw new Error("Shiprocket credentials are missing.");
  }

  const response = await fetch(
    `${SHIPROCKET_BASE_URL}/auth/login`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    }
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    let detail = text.slice(0, 200);
    try {
      const parsed = JSON.parse(text) as { message?: unknown };
      if (parsed?.message) detail = String(parsed.message);
    } catch {
      // keep raw text
    }
    throw new Error(
      `Shiprocket authentication failed: ${response.status}${detail ? ` (${detail})` : ""}`
    );
  }

  const data =
    (await response.json()) as ShiprocketAuthResponse;

  if (!data.token) {
    throw new Error("Shiprocket did not return a token.");
  }

  cachedToken = data.token;

  // Refresh the token after 9 days.
  tokenExpiresAt = Date.now() + 9 * 24 * 60 * 60 * 1000;

  return cachedToken;
}

export async function getShiprocketToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  if (!authPromise) {
    authPromise = authenticate().finally(() => {
      authPromise = null;
    });
  }

  return authPromise;
}


export async function shiprocketRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const token = await getShiprocketToken();

  const response = await fetch(
    `${SHIPROCKET_BASE_URL}${endpoint}`,
    {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (response.status === 401 && retry) {
    cachedToken = null;
    tokenExpiresAt = 0;

    return shiprocketRequest<T>(endpoint, options, false);
  }

  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message =
      data && typeof data === "object" && "message" in data
        ? String((data as { message: unknown }).message)
        : text.slice(0, 300);
    throw new ShiprocketApiError(response.status, message);
  }

  return data as T;
}

export class ShiprocketApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`Shiprocket API error ${status}: ${detail}`);
  }
}

export type ShipmentOrder = {
  order_number: string;
  created_at: string;
  payment_method: string;
  subtotal: number;
  discount: number;
  shipping_fee: number;
  total: number;
  shipping_name: string;
  shipping_phone: string;
  shipping_email: string | null;
  shipping_address: string;
  shipping_city: string;
  shipping_state: string;
  shipping_postal_code: string;
  shipping_country: string;
  order_items: {
    product_name: string;
    variant_name: string | null;
    sku: string | null;
    quantity: number;
    unit_price: number;
  }[];
};

export type PackageDetails = {
  weightKg: number;
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
};

function shiprocketDate(iso: string) {
  // Shiprocket expects "YYYY-MM-DD HH:mm" in IST.
  const ist = new Date(new Date(iso).getTime() + 330 * 60 * 1000);
  return ist.toISOString().slice(0, 16).replace("T", " ");
}

/** Shiprocket requires a 10-digit Indian mobile number. */
export function normalizeIndianPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  const local = digits.length > 10 ? digits.slice(-10) : digits;
  return /^[6-9]\d{9}$/.test(local) ? local : null;
}

/**
 * Builds the Shiprocket "create adhoc order" payload.
 *
 * COD and prepaid are kept explicit: payment_method is "COD" only for COD
 * orders. Shiprocket's collectable amount is
 * sub_total + shipping_charges − total_discount, which is set up here to equal
 * the order's server-computed total exactly (checked before sending).
 */
export function buildShipmentPayload(
  order: ShipmentOrder,
  pickupLocation: string,
  pkg: PackageDetails,
) {
  const phone = normalizeIndianPhone(order.shipping_phone);
  if (!phone) throw new Error("The customer's phone number isn't a valid 10-digit mobile number.");

  const subTotal = order.order_items.reduce((s, i) => s + Number(i.unit_price) * i.quantity, 0);
  const shipping = Number(order.shipping_fee);
  const discount = Number(order.discount);
  const total = Number(order.total);
  if (Math.abs(subTotal + shipping - discount - total) > 0.009) {
    throw new Error(
      `Order amounts don't add up (items ${subTotal} + shipping ${shipping} − discount ${discount} ≠ total ${total}).`,
    );
  }

  const [firstName, ...rest] = order.shipping_name.trim().split(/\s+/);

  return {
    order_id: order.order_number,
    order_date: shiprocketDate(order.created_at),
    pickup_location: pickupLocation,
    billing_customer_name: firstName ?? order.shipping_name,
    billing_last_name: rest.join(" "),
    billing_address: order.shipping_address,
    billing_city: order.shipping_city,
    billing_pincode: order.shipping_postal_code,
    billing_state: order.shipping_state,
    billing_country: order.shipping_country || "India",
    billing_email: order.shipping_email ?? "",
    billing_phone: phone,
    shipping_is_billing: true,
    order_items: order.order_items.map((item) => ({
      name: item.variant_name ? `${item.product_name} - ${item.variant_name}` : item.product_name,
      sku: item.sku || item.product_name.slice(0, 40),
      units: item.quantity,
      selling_price: Number(item.unit_price),
      discount: 0,
      tax: 0,
    })),
    payment_method: order.payment_method === "cod" ? "COD" : "Prepaid",
    shipping_charges: shipping,
    total_discount: discount,
    sub_total: subTotal,
    length: pkg.lengthCm,
    breadth: pkg.breadthCm,
    height: pkg.heightCm,
    weight: pkg.weightKg,
  };
}

export type ShiprocketCreateOrderResponse = {
  order_id?: number | string;
  shipment_id?: number | string;
  status?: string;
  status_code?: number;
  awb_code?: string | null;
  courier_name?: string | null;
  message?: string;
};
