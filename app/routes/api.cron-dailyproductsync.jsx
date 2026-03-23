import { json } from "@remix-run/node";
import connectDataBase from "../lib/db.js";
import { runTopSellerSync } from "../lib/top-seller-sync.server.js";
import InstalledShop from "../lib/store.js";
import { unauthenticated } from "../shopify.server.js";

function readSecret(request) {
  const url = new URL(request.url);

  return (
    request.headers.get("x-cron-secret") ||
    request.headers.get("X-Cron-Secret") ||
    url.searchParams.get("secret")
  );
}

async function handleCronRequest(request) {
  const secret = readSecret(request);
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDataBase();

  const url = new URL(request.url);
  const shopParam = url.searchParams.get("shop");
  const shopFilter = shopParam ? { shopId: shopParam, active: true } : { active: true };
  const shops = await InstalledShop.find(shopFilter);

  console.log(`[cron] top-seller sync started for ${shops.length} shop(s)`);

  const results = [];

  for (const shopDoc of shops) {
    const shop = shopDoc.shopId;

    try {
      const { admin } = await unauthenticated.admin(shop);
      const result = await runTopSellerSync({ admin, shop });

      results.push({
        shop,
        status: "success",
        alreadyProcessed: result.alreadyProcessed,
        orders: result.orderCount,
        productsUpdated: result.updatedProductsCount,
        date: result.date,
      });
    } catch (error) {
      console.error(`[cron] failed for ${shop}:`, error);
      results.push({
        shop,
        status: "error",
        error: error.message,
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  return json({
    success: results.every((result) => result.status === "success"),
    totalStores: shops.length,
    processed: results.filter((result) => result.status === "success").length,
    failed: results.filter((result) => result.status === "error").length,
    results,
  });
}

export async function loader({ request }) {
  return handleCronRequest(request);
}

export async function action({ request }) {
  return handleCronRequest(request);
}
