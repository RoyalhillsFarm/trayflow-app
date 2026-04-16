import Stripe from "stripe";
import { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

// ✅ Initialize Stripe (UPDATED VERSION)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2026-03-25.dahlia",
});

// ✅ Supabase admin client (bypasses RLS)
const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

// ✅ Helper: map Stripe price → plan
function getPlanFromPrice(priceId: string): string {
  if (priceId === process.env.STRIPE_PRICE_SPROUT) return "sprout";
  if (priceId === process.env.STRIPE_PRICE_FARMER) return "farmer";
  if (priceId === process.env.STRIPE_PRICE_COMMERCIAL) return "commercial";
  return "free";
}

// ✅ Main handler
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  const sig = req.headers["stripe-signature"] as string;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET as string
    );
  } catch (err: any) {
    console.error("❌ Webhook signature verification failed.", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    // 🎯 Checkout completed → upgrade plan
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      const customerEmail = session.customer_email;
      const priceId =
        session?.line_items?.data?.[0]?.price?.id ||
        (session.metadata?.price_id as string);

      if (!customerEmail || !priceId) {
        console.error("Missing email or price ID");
        return res.status(400).send("Missing data");
      }

      const plan = getPlanFromPrice(priceId);

      console.log("🔥 Upgrading:", customerEmail, "→", plan);

      // 🔍 Find user profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("email", customerEmail)
        .single();

      if (!profile) {
        console.error("Profile not found for email:", customerEmail);
        return res.status(404).send("Profile not found");
      }

      // ✅ Update profile
      await supabase
        .from("profiles")
        .update({ plan })
        .eq("id", profile.id);

      // ✅ Update account
      await supabase
        .from("accounts")
        .update({ plan })
        .eq("id", profile.account_id);
    }

    // 🔄 Subscription updated
    if (event.type === "customer.subscription.updated") {
      console.log("Subscription updated");
    }

    // ❌ Subscription canceled
    if (event.type === "customer.subscription.deleted") {
      console.log("Subscription canceled");
    }

    return res.status(200).json({ received: true });
  } catch (error: any) {
    console.error("Webhook handler error:", error);
    return res.status(500).send("Server error");
  }
}