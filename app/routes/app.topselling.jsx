import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server.js";
import connectDataBase from "../lib/db.js";
import { ProcessedDay } from "../lib/processeddayschema.js";
import DailyProductSale from "../lib/dailyproductsaleschema.js";
import { runTopSellerSync } from "../lib/top-seller-sync.server.js";
import {
  IndexTable,
  LegacyCard,
  useIndexResourceState,
  Text,
  Badge,
  Page,
  Layout,
} from "@shopify/polaris";

function getYesterdayDateStr() {
  return new Date(Date.now() - 86400000).toISOString().split("T")[0];
}

async function loadSavedProducts(shop, date) {
  return DailyProductSale.find({ shop, date })
    .sort({ soldQty: -1, title: 1 })
    .lean();
}

export const loader = async ({ request }) => {
  await connectDataBase();

  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const date = getYesterdayDateStr();

  let processedDay = await ProcessedDay.findOne({ shop, date }).lean();

  const needsSync =
    !processedDay ||
    processedDay.recordsUpdated <= 0;

  let syncResult = null;

  if (needsSync) {
    syncResult = await runTopSellerSync({ admin, shop });
    processedDay = await ProcessedDay.findOne({ shop, date }).lean();
  }

  const savedProducts = await loadSavedProducts(shop, date);

  return Response.json({
    shop,
    date,
    source: syncResult ? "sync-and-db" : "db",
    processedDay,
    syncResult,
    savedProducts,
  });
};

export default function TopSelling() {
  const data = useLoaderData();
  const rows = data.savedProducts.map((product, index) => ({
    id: product._id?.toString?.() ?? `${product.productId}-${index}`,
    productId: product.productId,
    title: product.title || "Unknown Product",
    handle: product.handle || "-",
    soldQty: product.soldQty || 0,
    date: product.date,
  }));

  const resourceName = {
    singular: "product",
    plural: "products",
  };

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(rows);

  const rowMarkup = rows.map(
    ({ id, title, handle, soldQty, date, productId }, index) => (
      <IndexTable.Row
        id={id}
        key={id}
        selected={selectedResources.includes(id)}
        position={index}
      >
        <IndexTable.Cell>
          <Text variant="bodyMd" fontWeight="bold" as="span">
            {title}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>{handle}</IndexTable.Cell>
        <IndexTable.Cell>{productId}</IndexTable.Cell>
        <IndexTable.Cell>
          <Badge>{soldQty}</Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>{date}</IndexTable.Cell>
      </IndexTable.Row>
    ),
  );

  return (
    <Page fullWidth>
      <Layout>
        <Layout.Section>
          <LegacyCard>
            <IndexTable
              resourceName={resourceName}
              itemCount={rows.length}
              selectedItemsCount={
                allResourcesSelected ? "All" : selectedResources.length
              }
              onSelectionChange={handleSelectionChange}
              headings={[
                { title: "Product" },
                { title: "Handle" },
                { title: "Product ID" },
                { title: "Sold Qty" },
                { title: "Date" },
              ]}
            >
              {rowMarkup}
            </IndexTable>
          </LegacyCard>

          {/* <LegacyCard title="Sync Debug Data" sectioned>
            <pre>{JSON.stringify(data, null, 2)}</pre>
          </LegacyCard> */}
        </Layout.Section>
      </Layout>
    </Page>
  );
}
