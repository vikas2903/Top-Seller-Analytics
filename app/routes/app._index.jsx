import { boundary } from "@shopify/shopify-app-react-router/server";
import { json } from "@remix-run/node";
import { Page, Layout, Card, BlockStack, Button, InlineStack, Text } from "@shopify/polaris";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import connectDataBase from "../lib/db.js";
import InstalledShop from "../lib/store.js";
import { ProcessedDay } from "../lib/processeddayschema.js";
import DailyProductSale from "../lib/dailyproductsaleschema.js";
import Dashboard from "../dashboard.jsx";

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

function getRecentDateStrings(days = 7) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(Date.now() - index * 86400000);
    return date.toISOString().split("T")[0];
  });
}

function isValidDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shopName = session.shop;
  const accessToken = session.accessToken;
  const url = new URL(request.url);
  const requestedDate = url.searchParams.get("date");

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

  const latestProcessedDay = await ProcessedDay.findOne({ shop: shopName })
    .sort({ processedAt: -1 })
    .lean();

  const recentDates = getRecentDateStrings();
  const selectedDate =
    isValidDateString(requestedDate) && requestedDate
      ? requestedDate
      : latestProcessedDay?.date || recentDates[0] || "";

  const selectedDateProducts = selectedDate
    ? await DailyProductSale.find({
        shop: shopName,
        date: selectedDate,
      })
        .sort({ soldQty: -1, lastUpdatedAt: -1, title: 1 })
        .lean()
    : [];

  const topProduct = latestProcessedDay
    ? await DailyProductSale.findOne({
        shop: shopName,
        date: latestProcessedDay.date,
      })
        .sort({ soldQty: -1, lastUpdatedAt: -1 })
        .lean()
    : null;

  const normalizedShop = shopName.replace(".myshopify.com", "");
  const availableDates = recentDates;
  const tableProducts = selectedDateProducts.map((product) => ({
    id: product._id?.toString?.() ?? product.productId,
    imageUrl: product.imageUrl || null,
    title: product.title || "Unknown Product",
    soldQty: product.soldQty || 0,
    date: product.date,
    productId: product.productId,
    handle: product.handle || null,
    productAdminUrl: `https://admin.shopify.com/store/${normalizedShop}/products/${product.productId}`,
  }));

  const kpis = {
    topProductName: topProduct?.title || "No synced products",
    topProductDetail: topProduct
      ? `${topProduct.soldQty} units sold`
      : "Run cron job to sync products",
    totalOrdersProcessed: latestProcessedDay?.orderCount || 0,
    lastSyncTime: latestProcessedDay?.processedAt || null,
    metaFieldWriteDate: latestProcessedDay?.processedAt || null,
    productsUpdatedInTheme: latestProcessedDay?.recordsUpdated || 0,
    productsUpdatedDetail: latestProcessedDay
      ? `Saved for ${formatSyncDateLabel(latestProcessedDay.date)}`
      : "No MongoDB records found",
    syncDateLabel: formatSyncDateLabel(latestProcessedDay?.date),
  };

  return json({
    shopName,
    kpis,
    availableDates,
    tableProducts,
    defaultFilterDate: selectedDate,
  });
};

export default function Index() {
  const { kpis, availableDates, tableProducts, defaultFilterDate } = useLoaderData();

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
                Open the Blocks Guide to choose the right best-seller block, pick a theme, and go
                directly to the Shopify customizer for home or collection pages.
              </Text>
              <InlineStack gap="200">
                <Button variant="primary" url="/app/blocks-guide">
                  Open Blocks Guide
                </Button>
                <Button url="/app/dailylast30daysproductsync">Run sync</Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
        <Layout.Section>
          <Dashboard
            kpis={kpis}
            availableDates={availableDates}
            tableProducts={tableProducts}
            defaultFilterDate={defaultFilterDate}
          />
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
