import Stripe from "stripe";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

export const config = {
  api: {
    bodyParser: false,
  },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2026-03-25.dahlia",
});

const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

const MASTER_ACCOUNT_ID = "d564692f-cfc4-4b32-8d10-5ce4d6eee0c1";

const SPROUT_VARIETY_NAMES = [
  "Arugula",
  "Basil",
  "Broccoli",
  "Cabbage (Red)",
  "Mild Mix",
  "Mustard",
  "Pea Shoots",
  "Radish (Purple Plum)",
  "Spicy Mix",
  "Sunflower",
] as const;

async function getRawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function accountAlreadyHasVarieties(accountId: string) {
  const { count, error } = await supabase
    .from("varieties")
    .select("id", { head: true, count: "exact" })
    .eq("account_id", accountId);

  if (error) throw error;
  return (count ?? 0) > 0;
}

function mapVarietyRow(row: any, accountId: string) {
  return {
    variety: row.variety,
    scientific_name: row.scientific_name,
    seed_weight_g_1020: row.seed_weight_g_1020,
    soak_hours: row.soak_hours,
    blackout_days: row.blackout_days,
    harvest_days: row.harvest_days,
    expected_yield_oz_1020: row.expected_yield_oz_1020,
    difficulty: row.difficulty,
    pro_tips: row.pro_tips,
    flavor_profile: row.flavor_profile,
    best_uses: row.best_uses,
    visual_notes: row.visual_notes,
    chef_notes: row.chef_notes,
    market_notes: row.market_notes,
    spray_per_day_blackout: row.spray_per_day_blackout,
    spray_during_blackout: row.spray_during_blackout,
    water_after_lights_on: row.water_after_lights_on,
    water_per_day: row.water_per_day,
    has_lights_on_task: row.has_lights_on_task,
    default_pack_size_oz: row.default_pack_size_oz,
    account_id: accountId,
    disabled_at: null,
  };
}

async function fetchMasterLibrary(limit?: number, names?: readonly string[]) {
  let query = supabase
    .from("varieties")
    .select(`
      variety,
      scientific_name,
      seed_weight_g_1020,
      soak_hours,
      blackout_days,
      harvest_days,
      expected_yield_oz_1020,
      difficulty,
      pro_tips,
      flavor_profile,
      best_uses,
      visual_notes,
      chef_notes,
      market_notes,
      spray_per_day_blackout,
      spray_during_blackout,
      water_after_lights_on,
      water_per_day,
      has_lights_on_task,
      default_pack_size_oz,
      disabled_at
    `)
    .eq("account_id", MASTER_ACCOUNT_ID)
    .is("disabled_at", null)
    .order("variety", { ascending: true });

  if (names && names.length > 0) {
    query = query.in("variety", [...names]);
  }

  if (typeof limit === "number") {
    query = query.limit(limit);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

async function seedSproutLibrary(accountId: string) {
  if (await accountAlreadyHasVarieties(accountId)) return;

  const rows = await fetchMasterLibrary(undefined, SPROUT_VARIETY_NAMES);

  if (rows.length !== SPROUT_VARIETY_NAMES.length) {
    throw new Error("Sprout starter library is incomplete in master account.");
  }

  const inserts = rows.map((row: any) => mapVarietyRow(row, accountId));

  const { error } = await supabase.from("varieties").insert(inserts);
  if (error) throw error;
}

async function seedFarmerLibrary(accountId: string) {
  if (await accountAlreadyHasVarieties(accountId)) return;

  const rows = await fetchMasterLibrary(35);

  if (rows.length < 35) {
    throw new Error("Master account does not contain enough active varieties for Farmer.");
  }

  const inserts = rows.map((row: any) => mapVarietyRow(row, accountId));

  const { error } = await supabase.from("varieties").insert(inserts);
  if (error) throw error;
}

async function seedCommercialLibrary(accountId: string) {
  if (await accountAlreadyHasVarieties(accountId)) return;

  const rows = await fetchMasterLibrary();

  if (!rows.length) {
    throw new Error("Master variety library is empty.");
  }

  const inserts = rows.map((row: any) => mapVarietyRow(row, accountId));

  const { error } = await supabase.from("varieties").insert(inserts);
  if (error) throw error;
}

async function upsertPaidAccountAndProfile(opts: {
  userId: string;
  email: string;
  farmName: string;
  plan: string;
}) {
  const { userId, email, farmName, plan } = opts;

  const { data: existingProfile, error: profileLookupErr } = await supabase
    .from("profiles")
    .select("id, email, account_id, role, plan")
    .eq("id", userId)
    .maybeSingle();

  if (profileLookupErr) throw profileLookupErr;

  let accountId = existingProfile?.account_id ?? null;

  if (!accountId) {
    accountId = crypto.randomUUID();

    const { error: accountInsertErr } = await supabase.from("accounts").insert({
      id: accountId,
      name: farmName,
      plan,
    });

    if (accountInsertErr) throw accountInsertErr;
  } else {
    const { error: accountUpdateErr } = await supabase
      .from("accounts")
      .update({
        name: farmName,
        plan,
      })
      .eq("id", accountId);

    if (accountUpdateErr) throw accountUpdateErr;
  }

  const { error: profileUpdateErr } = await supabase
    .from("profiles")
    .update({
      email,
      account_id: accountId,
      role: "admin",
      plan,
    })
    .eq("id", userId);

  if (profileUpdateErr) throw profileUpdateErr;

  if (plan === "sprout") {
    await seedSproutLibrary(accountId);
  } else if (plan === "farmer") {
    await seedFarmerLibrary(accountId);
  } else if (plan === "commercial") {
    await seedCommercialLibrary(accountId);
  }

  return accountId;
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

        const userId = session.metadata?.user_id;
        const email = session.metadata?.email;
        const farmName = session.metadata?.farm_name;
        const plan = session.metadata?.plan;

        if (!userId || !email || !farmName || !plan) {
          throw new Error("Missing required metadata for paid account provisioning.");
        }

        await upsertPaidAccountAndProfile({
          userId,
          email,
          farmName,
          plan,
        });

        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      default:
        break;
    }

    return res.status(200).json({ received: true });
  } catch (err: any) {
    console.error("stripe-webhook error:", err);
    return res.status(400).send(`Webhook error: ${err.message}`);
  }
}