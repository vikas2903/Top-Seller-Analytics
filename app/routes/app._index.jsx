import { boundary } from "@shopify/shopify-app-react-router/server";
import { json } from "@remix-run/node";
import {
  Banner,
  Page,
  Layout,
  Card,
  BlockStack,
  Button,
  InlineStack,
  Text,
} from "@shopify/polaris";
import { useEffect } from "react";
import { useFetcher, useLoaderData, useRevalidator } from "react-router";
import { authenticate } from "../shopify.server";
import connectDataBase from "../lib/db.js";
import InstalledShop from "../lib/store.js";
import Dashboard from "../dashboard.jsx";
import {
  getTopSellerMetafieldsSnapshot,
  runTopSellerSync,
} from "../lib/top-seller-sync.server.js";
import { getOrders } from "./app.dailylast30daysproductsync.jsx";

function formatSyncDateLabel(date) {
  if (!date) {
    return "no sync data";
  }

  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shopName = session.shop;
  const accessToken = session.accessToken;

  await connectDataBase();

  await InstalledShop.findOneAndUpdate(
    { shopId: shopName },
    {
      shopId: shopName,
      accessToken,
      active: true,
      installedAt: new Date(),
    },
    { upsert: true, new: true },
  );

  const snapshot = await getTopSellerMetafieldsSnapshot(admin);
  const summary = snapshot.syncSummary || {};
  const previousDayData = snapshot.previousday || {};
  const previousDayProducts = previousDayData.products || summary.previousDayProducts || [];
  const normalizedShop = shopName.replace(".myshopify.com", "");
  const emptyStateMessage = !summary.syncedAt
    ? "No sync has run yet."
    : (summary.orderCount || 0) === 0
      ? "Sync completed, but no orders were found in the last 24 hours."
      : previousDayProducts.length === 0
        ? "Sync completed, but all last-24-hours items were filtered out or unavailable."
        : "";

  const tableProducts = previousDayProducts.map((product) => ({
    id: product.productId,
    imageUrl: product.imageUrl || null,
    title: product.title || "Unknown Product",
    soldQty: product.soldQty || 0,
    date: previousDayData.date || summary.date || "",
    productId: product.productId,
    handle: product.handle || null,
    productAdminUrl: `https://admin.shopify.com/store/${normalizedShop}/products/${product.productId}`,
  }));

  const kpis = {
    topProductName: summary.topProductName || previousDayProducts[0]?.title || "No synced products",
    topProductDetail:
      summary.topProductSoldQty || previousDayProducts[0]?.soldQty
        ? `${summary.topProductSoldQty || previousDayProducts[0]?.soldQty} units sold`
        : "Run sync to generate product data",
    totalOrdersProcessed: summary.orderCount || 0,
    lastSyncTime: summary.syncedAt || snapshot.metafieldUpdatedAt.syncSummary || null,
    metaFieldWriteDate:
      snapshot.metafieldUpdatedAt.syncSummary ||
      snapshot.metafieldUpdatedAt.previousday ||
      null,
    productsUpdatedInTheme: summary.productsUpdated || previousDayProducts.length,
    productsUpdatedDetail: summary.date
      ? `Saved for ${formatSyncDateLabel(summary.date)}`
      : "No metafield data found",
    syncDateLabel: formatSyncDateLabel(summary.date),
  };

  return json({
    shopName,
    kpis,
    availableDates: summary.date ? [summary.date] : [],
    tableProducts,
    defaultFilterDate: summary.date || "",
    emptyStateMessage,
  });
};

export const action = async ({ request }) => {
  await connectDataBase();

  const formData = await request.formData();
  const intent = formData.get("intent");
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  if (intent === "run-daily-sync" || intent === "run-resync") {
    const result = await runTopSellerSync({ admin, shop });

    return json({
      ok: true,
      intent,
      message: `Sync completed for ${result.date}. Orders: ${result.orderCount}, products updated: ${result.updatedProductsCount}.`,
    });
  }

  if (intent === "run-last30-sync") {
    const allOrders = await getOrders({ admin });

    return json({
      ok: true,
      intent,
      message: `Last 30 days sync completed. Orders processed: ${allOrders.length}.`,
    });
  }

  return json(
    {
      ok: false,
      message: "Unknown sync action.",
    },
    { status: 400 },
  );
};

export default function Index() {
  const { kpis, availableDates, tableProducts, defaultFilterDate, emptyStateMessage } = useLoaderData();
  const dailySyncFetcher = useFetcher();
  const last30SyncFetcher = useFetcher();
  const revalidator = useRevalidator();

  useEffect(() => {
    if (dailySyncFetcher.state === "idle" && dailySyncFetcher.data?.ok) {
      revalidator.revalidate();
    }
  }, [dailySyncFetcher.data, dailySyncFetcher.state, revalidator]);

  useEffect(() => {
    if (last30SyncFetcher.state === "idle" && last30SyncFetcher.data?.ok) {
      revalidator.revalidate();
    }
  }, [last30SyncFetcher.data, last30SyncFetcher.state, revalidator]);

  return (
    <Page>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Next step for merchants
              </Text>
              <Text as="p" tone="subdued">
                Your daily sync now writes directly to Shopify metafields, so the storefront can
                update automatically from cron without saving product rows in MongoDB.
              </Text>
              <InlineStack gap="200" wrap>
                <Button variant="primary" url="/app/blocks-guide">
                  Open Blocks Guide
                </Button>
                <dailySyncFetcher.Form method="post">
                  <input type="hidden" name="intent" value="run-resync" />
                  <Button submit loading={dailySyncFetcher.state !== "idle"}>
                    Resync now
                  </Button>
                </dailySyncFetcher.Form>
                <last30SyncFetcher.Form method="post">
                  <input type="hidden" name="intent" value="run-last30-sync" />
                  <Button submit loading={last30SyncFetcher.state !== "idle"}>
                    Run last 30 days sync
                  </Button>
                </last30SyncFetcher.Form>
              </InlineStack>
              {dailySyncFetcher.data?.message ? (
                <Banner tone={dailySyncFetcher.data.ok ? "success" : "critical"}>
                  <p>{dailySyncFetcher.data.message}</p>
                </Banner>
              ) : null}
              {last30SyncFetcher.data?.message ? (
                <Banner tone={last30SyncFetcher.data.ok ? "success" : "critical"}>
                  <p>{last30SyncFetcher.data.message}</p>
                </Banner>
              ) : null}
            </BlockStack>
          </Card>
        </Layout.Section>
        <Layout.Section>
          <Dashboard
            kpis={kpis}
            availableDates={availableDates}
            tableProducts={tableProducts}
            defaultFilterDate={defaultFilterDate}
            emptyStateMessage={emptyStateMessage}
          />
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
