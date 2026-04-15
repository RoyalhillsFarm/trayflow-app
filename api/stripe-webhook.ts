import Stripe from "stripe";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

export const config = {
  api: {
    bodyParser: false,
  },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2025-03-31.basil",
});

const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

async function getRawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function activatePlan(opts: {
  accountId: string;
  userId: string;
  plan: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}) {
  const { accountId, userId, plan } = opts;

  const { error: accountErr } = await supabase
    .from("accounts")
    .update({
      plan,
    })
    .eq("id", accountId);

  if (accountErr) throw accountErr;

  const { error: profileErr } = await supabase
    .from("profiles")
    .update({
      plan,
      role: "admin",
      account_id: accountId,
    })
    .eq("id", userId);

  if (profileErr) throw profileErr;
}

async function downgradePlan(opts: {
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}) {
  const { stripeCustomerId, stripeSubscriptionId } = opts;

  if (!stripeCustomerId && !stripeSubscriptionId) return;

  // Placeholder for later if you add stripe IDs to accounts/profiles.
  // For now, keep this function here so the webhook structure is future-ready.
  return;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  const signature = req.headers["stripe-signature"];
  if (!signature) {
    return res.status(400).send("Missing Stripe-Signature header");
  }

  try {
    const rawBody = await getRawBody(req);

    const event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET as string
    );

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        const accountId = session.metadata?.account_id;
        const userId = session.metadata?.user_id;
        const plan = session.metadata?.plan;

        if (!accountId || !userId || !plan) {
          throw new Error("Missing account_id, user_id, or plan in Checkout Session metadata.");
        }

        await activatePlan({
          accountId,
          userId,
          plan,
          stripeCustomerId: typeof session.customer === "string" ? session.customer : null,
          stripeSubscriptionId:
            typeof session.subscription === "string" ? session.subscription : null,
        });

        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;

        await downgradePlan({
          stripeCustomerId:
            typeof subscription.customer === "string" ? subscription.customer : null,
          stripeSubscriptionId: subscription.id,
        });

        break;
      }

      case "customer.subscription.updated": {
        // Keep for future handling of pauses, past_due, cancellations, etc.
        break;
      }

      default:
        break;
    }

    return res.status(200).json({ received: true });
  } catch (err: any) {
    return res.status(400).send(`Webhook error: ${err.message}`);
  }
}