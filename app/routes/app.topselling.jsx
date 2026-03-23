import { authenticate } from '../shopify.server.js';
import connectDataBase from '../lib/db.js';
import { useLoaderData } from 'react-router';
import { ProcessedDay  } from '../lib/processeddayschema.js';
import DailyProductSale from '../lib/dailyproductsaleschema.js';


import {
  IndexTable, 
  LegacyCard,
  useIndexResourceState,
  Text,
  Badge,
  Page,
  Layout
} from '@shopify/polaris';

export const loader = async ({ request }) => {
  await connectDataBase();

  const { admin, session } = await authenticate.admin(request);

  const shop = session.shop;

  const now = new Date();
  const yesterday = new Date(now.getTime() - 86400000);

  const start = yesterday.toISOString();
  const end = now.toISOString();

  // console.log(`⏰ Fetching orders from ${start} to ${end}`);

  const QUERY_STR = `created_at:>=${start} AND created_at:<=${end}`;
  console.log(`🔍 Constructed GraphQL query string: ${QUERY_STR}`);

  console.log(`🔍 GraphQL Query: ${QUERY_STR}`); 

  let allOrders = [];
  let hasNextPage = true;
  let cursor = null;

  const ORDERS_QUERY = `
    query getOrders($query: String!, $after: String) {
      orders(first: 250, query: $query, sortKey: CREATED_AT, after: $after) {
        edges {
          node {
            id
            name
            createdAt
            lineItems(first: 250) {
              edges {
                node {
                  quantity
                  title
                  variant {
                    product {
                      id
                      title
                      handle
                      images(first: 1) {
                        edges {
                          node {
                            url
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

  while (hasNextPage) {
    const response = await admin.graphql(ORDERS_QUERY, {
      variables: {
        query: QUERY_STR,
        after: cursor,
      }, 
    });

    const result = await response.json();

    const ordersData = result.data.orders;

    allOrders = allOrders.concat(ordersData.edges);

    hasNextPage = ordersData.pageInfo.hasNextPage;
    cursor = ordersData.pageInfo.endCursor;
    console.log(`📄 Fetched ${ordersData.edges.length} orders | Next page: ${hasNextPage}`);
  }
  console.log(`✅ Total Orders Fetched: ${allOrders.length}`);

  // ────────────────────────────────────────────────────────────────
  //           SAVE ORDERS TO MONGODB - PRODUCT DAY AGGREGATION
  // ────────────────────────────────────────────────────────────────

  // First get yesterday's date as string (YYYY-MM-DD)
  const yesterdayDateStr = yesterday.toISOString().split('T')[0];

  // We will count how many product documents we actually update/create
  let updatedProductsCount = 0;
  

    const alreadyProcessed = await ProcessedDay.findOne({
      shop: shop,
      date: yesterdayDateStr
    });

    if (alreadyProcessed) {
      console.log(`⚠️ Data for ${yesterdayDateStr} has already been processed. Skipping to prevent duplicates.`);
      // return Response.json({ message: 'Data already processed for this date.' });
    }


    if(!alreadyProcessed) {
  // Go through every order we fetched
    for (const orderEdge of allOrders) {

      // Get the line items of this order
      const lineItems = orderEdge.node.lineItems?.edges || [];

      // For each line item in the order
      for (const itemEdge of lineItems) {


        console.log("Processing line item:", lineItems);
        const item = itemEdge.node;
        const product = item.variant?.product;

        // Skip if no product (deleted, gift card, custom item, etc.)
        if (!product) continue;

        // Get clean product ID (we take the number part)
        // const productId = product.id.split('/').pop();

        const productId = product.id.split('/').pop(); // full gid is fine 

        // Quantity sold in THIS line item
        const quantitySold = item.quantity;

        try {
          // Update or create the document for this product + shop + date
          await DailyProductSale.findOneAndUpdate(
            {
              shop: shop,             // from session.shop
              date: yesterdayDateStr,
              productId: productId
            },
            {
              // Always add the quantity (this is why we use $inc)
              $inc: { soldQty: quantitySold },

              // Update these fields every time (latest known values)
              $set: {
                title: item.title || product.title || 'Unknown Product',
                handle: product.handle || null,
                imageUrl: product.images?.edges?.[0]?.node?.url || null,
                lastUpdatedAt: new Date()
              },

              // Only set these when document is created the first time
              $setOnInsert: {
                firstSeenAt: new Date()
              }
            },
            {
              upsert: true   // ← very important: create if not exists
            }
          );

          updatedProductsCount++;

          // Optional: log for learning/debugging (you can remove later)

          console.log("vikasprasad"); // Log the update action
          console.log(
            `→ Saved: ${product.title} (${productId}) +${quantitySold} qty`
          );

        } catch (saveError) {
          console.error(
            `Error saving product ${productId}: ${saveError.message}`
          );
        }
      }
    }

  // ────────────────────────────────────────────────────────────────
  // ONLY NOW mark as processed – once per full run
  // ────────────────────────────────────────────────────────────────
  await ProcessedDay.findOneAndUpdate(
    { shop: shop, date: yesterdayDateStr },
    {
      processedAt: new Date(),
      orderCount: allOrders.length,
      recordsUpdated: updatedProductsCount
    },
    { upsert: true } 
  );

  console.log(`[DONE] ${yesterdayDateStr} marked as processed`);

}

  // Show summary in console
  console.log(
    `💾 Finished saving: ${updatedProductsCount} product-day records updated/created`
  );

  // ────────────────────────────────────────────────────────────────
  //   SAVE TO METAFIELD - Only when NEW data has been processed
  // ────────────────────────────────────────────────────────────────

  if (!alreadyProcessed) {
    try {
      // 1. Aggregate top 10 products (last 7 days)
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

      console.log(`📊 Aggregating top products from ${sevenDaysAgoStr} to ${yesterdayDateStr}...`);

      const topProducts = await DailyProductSale.aggregate([
        {
          $match: {
            shop: shop,
            date: { $gte: sevenDaysAgoStr }
          }
        },
        {
          $group: {
            _id: "$productId",
            totalSold: { $sum: "$soldQty" },
            title: { $first: "$title" },
            handle: { $first: "$handle" },
            imageUrl: { $first: "$imageUrl" }
          }
        },
        { $sort: { totalSold: -1 } },
        { $limit: 10 }
      ]);

      console.log(`✅ Top 10 products found: ${topProducts.length} products`);

      if (topProducts.length === 0) {
        console.warn("⚠️ No products found for top 10 aggregation");
        return Response.json({ message: 'No products data available yet', allOrders });
      }

      // 2. Get shop GID
      const shopQuery = `
        query GetShopId {
          shop {
            id
          }
        }
      `;

      console.log(`🔍 Fetching shop ID...`);
      const shopResponse = await admin.graphql(shopQuery);
      
      if (!shopResponse?.ok) {
        throw new Error(`GraphQL request failed: ${shopResponse?.status}`);
      }

      const shopResult = await shopResponse.json();

      if (!shopResult?.data?.shop?.id) {
        console.error("❌ Failed to get shop ID. Response:", JSON.stringify(shopResult, null, 2));
        throw new Error("Shop ID not returned from GraphQL query");
      }

      const shopGid = shopResult.data.shop.id;
      console.log(`✅ Shop GID retrieved: ${shopGid}`);

      // 3. Prepare metafield data
      const metafieldValue = JSON.stringify({
        updatedAt: new Date().toISOString(),
        products: topProducts.map(p => ({
          productId: p._id,
          title: p.title,
          handle: p.handle,
          imageUrl: p.imageUrl,
          totalSold: p.totalSold
        }))
      });

      console.log(`📋 Metafield payload size: ${metafieldValue.length} bytes`);

      // 4. Save metafield
      const metafieldMutation = `
        mutation SetTopSellersMetafield($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields {
              id
              namespace
              key
              value
            }
            userErrors {
              field
              message
              code
            }
          }
        }
      `;

      console.log(`🚀 Sending metafield mutation...`);
      const metafieldResponse = await admin.graphql(metafieldMutation, {
        variables: {
          metafields: [{
            ownerId: shopGid,
            namespace: "top_seller",
            key: "top_7days",
            type: "json",
            value: metafieldValue
          }]
        }
      });

      if (!metafieldResponse?.ok) {
        throw new Error(`Metafield GraphQL request failed: ${metafieldResponse?.status}`);
      }

      const metafieldResult = await metafieldResponse.json();

      // Check for GraphQL errors
      if (metafieldResult?.errors?.length > 0) {
        console.error("❌ GraphQL Errors:", metafieldResult.errors);
        throw new Error(`GraphQL Error: ${metafieldResult.errors.map(e => e.message).join(', ')}`);
      }

      // Check for mutation-level errors
      if (metafieldResult?.data?.metafieldsSet?.userErrors?.length > 0) {
        console.error("❌ Metafield user errors:", metafieldResult.data.metafieldsSet.userErrors);
        throw new Error(`Metafield Error: ${metafieldResult.data.metafieldsSet.userErrors.map(e => `${e.field}: ${e.message}`).join('; ')}`);
      }

      // Success
      if (metafieldResult?.data?.metafieldsSet?.metafields?.length > 0) {
        const saved = metafieldResult.data.metafieldsSet.metafields[0];
        console.log(`✅ Metafield saved successfully!`);
        console.log(`   ID: ${saved.id}`);
        console.log(`   Namespace: ${saved.namespace}`);
        console.log(`   Key: ${saved.key}`);
      } else {
        console.warn("⚠️ Metafield mutation returned no metafields");
      }

    } catch (metafieldError) {
      console.error("❌ Metafield operation failed:", metafieldError.message);
      console.error("Stack:", metafieldError.stack);
      // Don't return error - let the response still go through with order data
    }
  } else {
    console.log(`⏭️ Skipping metafield update - data already processed for ${yesterdayDateStr}`);
  }

 
  return Response.json(allOrders);
};
 


const dataSource = [
  {
    key: '1',
    name: 'Mike',
    age: 32,
    address: '10 Downing Street',
  },
  {
    key: '2',
    name: 'John',
    age: 42,
    address: '10 Downing Street',
  },
];

const columns = [
  {
    title: 'Name',
    dataIndex: 'name',
    key: 'name',
  },
  {
    title: 'Age',
    dataIndex: 'age',
    key: 'age',
  },
  {
    title: 'Address',
    dataIndex: 'address',
    key: 'address',
  },
];
 
export default function TopSelling() {
  const data = useLoaderData();

  console.log('Data received in component:', data);

  const orders = [
    {
      id: '1020',
      order: '#1020',
      date: 'Jul 20 at 4:34pm',
      customer: 'Jaydon Stanton',
      total: '$969.44',
      paymentStatus: <Badge progress="complete">Paid</Badge>,
      fulfillmentStatus: <Badge progress="incomplete">Unfulfilled</Badge>,
    },
    {
      id: '1019',
      order: '#1019',
      date: 'Jul 20 at 3:46pm',
      customer: 'Ruben Westerfelt',
      total: '$701.19',
      paymentStatus: <Badge progress="partiallyComplete">Partially paid</Badge>,
      fulfillmentStatus: <Badge progress="incomplete">Unfulfilled</Badge>,
    },
    {
      id: '1018',
      order: '#1018',
      date: 'Jul 20 at 3.44pm',
      customer: 'Leo Carder',
      total: '$798.24',
      paymentStatus: <Badge progress="complete">Paid</Badge>,
      fulfillmentStatus: <Badge progress="incomplete">Unfulfilled</Badge>,
    },
  ];

  const resourceName = {
    singular: 'order',
    plural: 'orders',
  };

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(orders);



  const rowMarkup = orders.map(
    (
      { id, order, date, customer, total, paymentStatus, fulfillmentStatus },
      index,
    ) => (
      <IndexTable.Row
        id={id}
        key={id}
        selected={selectedResources.includes(id)}
        position={index}
      >
        <IndexTable.Cell> <Text variant="bodyMd" fontWeight="bold" as="span">
          {order}
        </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>{date}</IndexTable.Cell>
        <IndexTable.Cell>{customer}</IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span" alignment="end" numeric>
            {total}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>{paymentStatus}</IndexTable.Cell>
        <IndexTable.Cell>{fulfillmentStatus}</IndexTable.Cell>
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
              itemCount={orders.length}
              selectedItemsCount={
                allResourcesSelected ? 'All' : selectedResources.length
              }
              onSelectionChange={handleSelectionChange}
              headings={[
                { title: 'Order' },
                { title: 'Date' },
                { title: 'Customer' },
                { title: 'Total', alignment: 'end' },
                { title: 'Payment status' },
                { title: 'Fulfillment status' },
              ]}
            >
              {rowMarkup}
            </IndexTable>
          </LegacyCard>

          <LegacyCard title="Daily product Scale Data" sectioned>
            <pre>{JSON.stringify(data, null, 2)}</pre>
          </LegacyCard>
        </Layout.Section>
      </Layout>


    </Page>
  );
} 