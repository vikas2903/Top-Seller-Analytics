import { json } from "@remix-run/node";
import process from "node:process";
import connectDataBase from "../lib/db.js";
import { runTopSellerSync } from "../lib/top-seller-sync.server.js";
import InstalledShop from "../lib/store.js";
import db from "../db.server.js";
import { apiVersion, unauthenticated } from "../shopify.server.js";

function readSecret(request) {
  const url = new URL(request.url);

  return (
    request.headers.get("x-cron-secret") ||
    request.headers.get("X-Cron-Secret") ||
    url.searchParams.get("secret")
  );
}

function buildAdminFromAccessToken({ shop, accessToken }) {
  return {
    graphql(query, options = {}) {
      const { variables } = options;

      return fetch(`https://${shop}/admin/api/${apiVersion}/graphql.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({ query, variables }),
      });
    },
  };
}

async function getCronAdminContext(shopDoc) {
  const offlineSession = await db.session.findFirst({
    where: {
      shop: shopDoc.shopId,
      isOnline: false,
    },
    select: {
      id: true,
      accessToken: true,
      expires: true,
    },
  });

  if (offlineSession?.accessToken) {
    return {
      admin: buildAdminFromAccessToken({
        shop: shopDoc.shopId,
        accessToken: offlineSession.accessToken,
      }),
      session: offlineSession,
      authSource: "prisma-offline-session",
    };
  }

  if (shopDoc.accessToken) {
    console.warn(
      `[cron] using stored MongoDB access token for ${shopDoc.shopId} because no Prisma offline session was found`,
    );

    return {
      admin: buildAdminFromAccessToken({
        shop: shopDoc.shopId,
        accessToken: shopDoc.accessToken,
      }),
      session: null,
      authSource: "mongo-access-token",
    };
  }

  try {
    const context = await unauthenticated.admin(shopDoc.shopId);
    return {
      ...context,
      authSource: "shopify-unauthenticated-admin",
    };
  } catch (error) {
    throw new Error(
      `No usable admin auth found for ${shopDoc.shopId}. ${error.message}`,
    );
  }
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
      const { admin, authSource } = await getCronAdminContext(shopDoc);
      const result = await runTopSellerSync({ admin, shop });

      results.push({
        shop,
        status: "success",
        authSource,
        alreadyProcessed: result.alreadyProcessed,
        orders: result.orderCount,
        productsUpdated: result.updatedProductsCount,
        skippedLineItems: result.skippedLineItems,
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

  const processed = results.filter((result) => result.status === "success").length;
  const failed = results.filter((result) => result.status === "error").length;
  const status = failed === 0 ? 200 : processed === 0 ? 500 : 207;

  return json({
    success: results.every((result) => result.status === "success"),
    totalStores: shops.length,
    processed,
    failed,
    results,
  }, { status });
}

export async function loader({ request }) {
  return handleCronRequest(request);
}

export async function action({ request }) {
  return handleCronRequest(request);
}
