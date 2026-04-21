import Stripe from "stripe";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2026-03-25.dahlia",
});

const PRICE_MAP: Record<string, string | undefined> = {
  sprout: process.env.STRIPE_PRICE_SPROUT,
  farmer: process.env.STRIPE_PRICE_FARMER,
  commercial: process.env.STRIPE_PRICE_COMMERCIAL,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { plan, userId, email, farmName } = req.body ?? {};

    if (!plan || !userId || !email || !farmName) {
      return res.status(400).json({
        error: "Missing required fields.",
        details: { plan, userId, email, farmName },
      });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: "Missing STRIPE_SECRET_KEY in Vercel." });
    }

    if (!process.env.APP_URL) {
      return res.status(500).json({ error: "Missing APP_URL in Vercel." });
    }

    const price = PRICE_MAP[plan];
    if (!price) {
      return res.status(400).json({
        error: `Missing Stripe price for plan "${plan}".`,
      });
    }

    if (!price.startsWith("price_")) {
      return res.status(400).json({
        error: `Stripe price for "${plan}" is invalid. Expected value starting with price_. Got: ${price}`,
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      success_url: `${process.env.APP_URL}/`,
      cancel_url: `${process.env.APP_URL}/choose-plan`,
      customer_email: email,
      metadata: {
        plan,
        user_id: userId,
        email,
        farm_name: farmName,
        price_id: price,
      },
    });

    return res.status(200).json({ url: session.url });
  } catch (err: any) {
    console.error("create-checkout-session error:", err);
    return res.status(500).json({
      error: err?.message || "Server error creating checkout session.",
    });
  }
}