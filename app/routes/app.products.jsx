import { useEffect, useState } from "react";
import { useLoaderData, useNavigation, useSubmit } from "react-router";
import {
  Badge,
  Box,
  Card,
  IndexTable,
  Layout,
  Page,
  Select,
  Text,
  useIndexResourceState,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server.js";
import connectDataBase from "../lib/db.js";
import DailyProductSale from "../lib/dailyproductsaleschema.js";
import { ProcessedDay } from "../lib/processeddayschema.js";

function isValidDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export const loader = async ({ request }) => {
  await connectDataBase();

  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const requestedDate = url.searchParams.get("date");

  const latestProcessedDay = await ProcessedDay.findOne({ shop })
    .sort({ processedAt: -1 })
    .lean();

  const dbDates = await DailyProductSale.distinct("date", { shop });
  const processedDates = await ProcessedDay.distinct("date", { shop });
  const availableDates = [...new Set([...dbDates, ...processedDates])].sort(
    (firstDate, secondDate) => secondDate.localeCompare(firstDate),
  );

  const selectedDate =
    isValidDateString(requestedDate) && requestedDate
      ? requestedDate
      : latestProcessedDay?.date || availableDates[0] || "";

      console.log("selectedDate", selectedDate);

  const savedProducts = selectedDate
    ? await DailyProductSale.find({ shop, date: selectedDate })
        .sort({ soldQty: -1, lastUpdatedAt: -1, title: 1 })
        .lean()
    : [];

  return Response.json({
    shop,
    availableDates,
    selectedDate,
    savedProducts,
  });
}; 

export default function ProductsRoute() {

  const data = useLoaderData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const [selectedDate, setSelectedDate] = useState(data.selectedDate || "");

console.log("ProductsRoute data", selectedDate);


  useEffect(() => {
    setSelectedDate(data.selectedDate || "");
  }, [data.selectedDate]); 


  useEffect(() => {
    if (!selectedDate || selectedDate === data.selectedDate) {
      return;
    }


    submit({ date: selectedDate }, { method: "get" });
  }, [data.selectedDate, selectedDate, submit]);


  const rows = data.savedProducts.map((product, index) => ({
    id: product._id?.toString?.() ?? `${product.productId}-${index}`,
    productId: product.productId,
    title: product.title || "Unknown Product",
    handle: product.handle || "-",
    soldQty: product.soldQty || 0,
    date: product.date,
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

  const emptyStateMessage =
    navigation.state !== "idle"
      ? `Loading products for ${selectedDate}...`
      : `No order data found for ${selectedDate}.`;

  return (
    <Page
      fullWidth
      title="Products"
      subtitle="View saved top-selling products day by day"
    >
      <Layout>
        <Layout.Section>
          <Card>
            <Box
              padding="400"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "16px",
                flexWrap: "wrap",
              }}
            >
              <Text as="h2" variant="headingMd">
                Order Day Filter
              </Text>

              <div style={{ minWidth: "220px" }}>
                <Select
                  label="Select date"
                  labelInline
                  options={data.availableDates.map((date) => ({
                    label: date,
                    value: date,
                  }))}
                  value={selectedDate}
                  onChange={()=>{
                    setSelectedDate(value);          
                  }}
                />
              </div>
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
                    {emptyStateMessage}
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
