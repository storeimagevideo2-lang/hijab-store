import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getBackendConfig } from "./env";

export const CUSTOMER_COOKIE_NAME = "noor_customer_session";

export type CustomerSession = {
  userId: string;
  phone: string;
  email?: string;
  exp: number;
};

export function createCustomerSessionToken(payload: { userId: string; phone: string; email?: string }): string {
  const { adminSecret } = getBackendConfig();
  const exp = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
  const data: CustomerSession = {
    userId: payload.userId,
    phone: payload.phone,
    email: payload.email,
    exp,
  };
  const encodedPayload = Buffer.from(JSON.stringify(data)).toString("base64url");
  const signature = createHmac("sha256", `${adminSecret}:customer-auth-v1`).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

export function verifyCustomerToken(token: string | undefined): CustomerSession | null {
  if (!token || !token.includes(".")) return null;
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  const { adminSecret } = getBackendConfig();
  if (!adminSecret) return null;

  const expectedSig = createHmac("sha256", `${adminSecret}:customer-auth-v1`).update(encodedPayload).digest("base64url");

  try {
    const a = Buffer.from(signature);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    const session = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as CustomerSession;
    if (!session.userId || !session.phone) return null;
    if (typeof session.exp === "number" && Date.now() > session.exp) return null;

    return session;
  } catch {
    return null;
  }
}

export async function getCustomerSession(): Promise<CustomerSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(CUSTOMER_COOKIE_NAME)?.value;
  return verifyCustomerToken(token);
}

export async function setCustomerSessionCookie(payload: { userId: string; phone: string; email?: string }): Promise<void> {
  const token = createCustomerSessionToken(payload);
  const cookieStore = await cookies();
  cookieStore.set(CUSTOMER_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
}

export async function clearCustomerSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(CUSTOMER_COOKIE_NAME);
}
