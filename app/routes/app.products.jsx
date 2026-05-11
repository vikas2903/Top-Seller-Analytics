import { useLoaderData } from "react-router";
import {
  Badge,
  Box,
  Card,
  IndexTable,
  Layout,
  Page,
  Text,
  useIndexResourceState,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server.js";
import { getTopSellerMetafieldsSnapshot } from "../lib/top-seller-sync.server.js";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const snapshot = await getTopSellerMetafieldsSnapshot(admin);
  const selectedDate = snapshot.previousday?.date || snapshot.syncSummary?.date || "";
  const savedProducts = snapshot.previousday?.products || [];

  return Response.json({
    shop,
    availableDates: selectedDate ? [selectedDate] : [],
    selectedDate,
    savedProducts,
  });
};

export default function ProductsRoute() {
  const data = useLoaderData();

  const rows = data.savedProducts.map((product, index) => ({
    id: product.productId ?? `${index}`,
    productId: product.productId,
    title: product.title || "Unknown Product",
    handle: product.handle || "-",
    soldQty: product.soldQty || 0,
    date: data.selectedDate,
    imageUrl: product.imageUrl || "",
  }));

  const resourceName = {
    singular: "product",
    plural: "products",
  };

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(rows);

  const rowMarkup = rows.map(
    ({ id, title, handle, soldQty, date, productId, imageUrl }, index) => (
      <IndexTable.Row
        id={id}
        key={id}
        selected={selectedResources.includes(id)}
        position={index}
      >
        <IndexTable.Cell>
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={title}
              style={{
                width: "40px",
                height: "40px",
                objectFit: "cover",
                borderRadius: "8px",
                border: "1px solid #dfe3e8",
              }}
            />
          ) : (
            <Text as="span" tone="subdued">
              N/A
            </Text>
          )}
        </IndexTable.Cell>
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
    <Page
      fullWidth
      title="Products"
      subtitle="View top-selling products stored in Shopify metafields"
    >
      <Layout>
        <Layout.Section>
          <Card>
            <Box padding="400">
              <Text as="h2" variant="headingMd">
                Synced products for {data.selectedDate || "latest sync"}
              </Text>
            </Box>

            <IndexTable
              resourceName={resourceName}
              itemCount={rows.length}
              selectedItemsCount={
                allResourcesSelected ? "All" : selectedResources.length
              }
              onSelectionChange={handleSelectionChange}
              headings={[
                { title: "Image" },
                { title: "Product" },
                { title: "Handle" },
                { title: "Product ID" },
                { title: "Sold Qty" },
                { title: "Date" },
              ]}
              emptyState={
                <Box padding="400">
                  <Text as="p" alignment="center" tone="subdued">
                    No synced product data found in metafields yet.
                  </Text>
                </Box>
              }
            >
              {rowMarkup}
            </IndexTable>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
