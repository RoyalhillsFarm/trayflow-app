import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../utils/supabaseClient";

type OrderStatus = "draft" | "confirmed" | "packed" | "delivered";

type OrderRow = {
  id: string;
  customer_id: string;
  variety_id: string;
  quantity: number;
  delivery_date: string;
  status: OrderStatus;
  created_at?: string;
};

type CustomerRow = { id: string; name: string };
type VarietyRow = { id: string; variety: string };

export default function OrdersPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [varieties, setVarieties] = useState<VarietyRow[]>([]);

  async function load() {
    try {
      setLoading(true);
      setError(null);

      const [cRes, vRes, oRes] = await Promise.all([
        supabase.from("customers").select("id, name").order("name", { ascending: true }),
        supabase.from("varieties").select("id, variety").order("variety", { ascending: true }),
        supabase
          .from("orders")
          .select("id, customer_id, variety_id, quantity, delivery_date, status, created_at")
          .order("delivery_date", { ascending: false }),
      ]);

      if (cRes.error) throw new Error(cRes.error.message);
      if (vRes.error) throw new Error(vRes.error.message);
      if (oRes.error) throw new Error(oRes.error.message);

      setCustomers((cRes.data ?? []) as CustomerRow[]);
      setVarieties((vRes.data ?? []) as VarietyRow[]);
      setOrders((oRes.data ?? []) as OrderRow[]);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function customerName(id: string) {
    return customers.find((c) => c.id === id)?.name ?? "Customer";
  }

  function varietyName(id: string) {
    return varieties.find((v) => v.id === id)?.variety ?? "Variety";
  }

  if (loading) {
    return (
      <div style={{ padding: 16 }}>
        <h2>Orders</h2>
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, maxWidth: 1000 }}>
      <h2 style={{ marginTop: 0 }}>Orders</h2>

      {error && (
        <div
          style={{
            padding: 12,
            marginBottom: 12,
            border: "1px solid #f2b8b5",
            background: "#fff5f5",
            borderRadius: 8,
          }}
        >
          <strong>Oops:</strong> {error}
        </div>
      )}

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e5e7eb" }}>
                Delivery
              </th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e5e7eb" }}>
                Customer
              </th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e5e7eb" }}>
                Variety
              </th>
              <th style={{ textAlign: "right", padding: 10, borderBottom: "1px solid #e5e7eb" }}>
                Trays
              </th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e5e7eb" }}>
                Status
              </th>
              <th style={{ textAlign: "right", padding: 10, borderBottom: "1px solid #e5e7eb" }}>
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9" }}>{o.delivery_date}</td>
                <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9" }}>{customerName(o.customer_id)}</td>
                <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9" }}>{varietyName(o.variety_id)}</td>
                <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9", textAlign: "right" }}>{o.quantity}</td>
                <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9" }}>{o.status}</td>
                <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9", textAlign: "right" }}>
                  {/* ✅ IMPORTANT: View links to UUID-only route */}
                  <Link to={`/orders/${o.id}`} style={{ fontWeight: 800 }}>
                    View / Edit / Delete
                  </Link>
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 14, opacity: 0.7 }}>
                  No orders yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12 }}>
        <button
          onClick={load}
          style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #ddd" }}
        >
          Refresh
        </button>
      </div>
    </div>
  );
}
