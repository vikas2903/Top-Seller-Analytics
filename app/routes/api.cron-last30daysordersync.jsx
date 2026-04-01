import { json } from "@remix-run/node";
import process from "node:process";
import { authenticate } from "../shopify.server.js";
import connectDataBase from "../lib/db.js";
import { getOrders } from "./app.dailylast30daysproductsync.jsx";

function readSecret(request) {
  const url = new URL(request.url);

  return (
    request.headers.get("x-cron-secret") ||
    request.headers.get("X-Cron-Secret") ||
    url.searchParams.get("secret")
  );
}

export const loader = async ({ request }) => {
  const secret = readSecret(request);

  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDataBase();

  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  // call your existing logic here
  const allOrders = await getOrders({ admin });

  return json({ ok: true, shop, totalOrders: allOrders.length });
};
