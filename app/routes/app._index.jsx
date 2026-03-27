import { boundary } from "@shopify/shopify-app-react-router/server";
import { json } from "@remix-run/node";
import { Page, Layout } from "@shopify/polaris";
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

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
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

  const latestProcessedDay = await ProcessedDay.findOne({ shop: shopName })
    .sort({ processedAt: -1 })
    .lean();

  const topProduct = latestProcessedDay
    ? await DailyProductSale.findOne({
        shop: shopName,
        date: latestProcessedDay.date,
      })
        .sort({ soldQty: -1, lastUpdatedAt: -1 })
        .lean()
    : null;

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
  });
};

export default function Index() {
  const { kpis } = useLoaderData();

  return (
    <Page>
      <Layout>
        <Layout.Section>
          <Dashboard kpis={kpis} />
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
