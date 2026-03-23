export const loader = async ({ request }) => {
  await connectDataBase();

  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const now = new Date();
  const yesterday = new Date(now.getTime() - 86400000);
  const yesterdayDateStr = yesterday.toISOString().split('T')[0]; // e.g. "2025-03-20"

  // ────────────────────────────────────────────────────────────────
  // IMPORTANT: Check EARLY if day already processed
  // ────────────────────────────────────────────────────────────────
  const alreadyProcessed = await ProcessedDay.findOne({
    shop: shop,
    date: yesterdayDateStr
  });

  if (alreadyProcessed) {
    console.log(`[SKIP] ${yesterdayDateStr} already processed at ${alreadyProcessed.processedAt.toISOString()}`);
    return json({
      status: "already_processed",
      date: yesterdayDateStr,
      processedAt: alreadyProcessed.processedAt.toISOString(),
      message: "Data for this day already exists — no duplicate processing"
    });
  }

  // If we reach here → day needs processing
  console.log(`[START] Processing ${yesterdayDateStr} for shop ${shop}`);

  const start = yesterday.toISOString();
  const end = now.toISOString();

  const QUERY_STR = `created_at:>=${start} AND created_at:<=${end}`;

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
      variables: { query: QUERY_STR, after: cursor },
    });

    const result = await response.json();
    const ordersData = result.data?.orders;

    if (!ordersData) {
      console.error("GraphQL response missing orders");
      return json({ error: "GraphQL fetch failed" }, { status: 500 });
    }

    allOrders = allOrders.concat(ordersData.edges);

    hasNextPage = ordersData.pageInfo.hasNextPage;
    cursor = ordersData.pageInfo.endCursor;

    console.log(`📄 Fetched ${ordersData.edges.length} orders | Total: ${allOrders.length}`);
  }

  console.log(`✅ Total Orders Fetched: ${allOrders.length}`);

  // ────────────────────────────────────────────────────────────────
  // SAVE TO DB
  // ────────────────────────────────────────────────────────────────
  let updatedProductsCount = 0;

  for (const orderEdge of allOrders) {
    const lineItems = orderEdge.node.lineItems?.edges || [];

    for (const itemEdge of lineItems) {
      const item = itemEdge.node;
      const product = item.variant?.product;

      if (!product) continue;

      const productId = product.id; // full gid is fine

      const quantitySold = item.quantity;

      try {
        await DailyProductSale.findOneAndUpdate(
          {
            shop: shop,
            date: yesterdayDateStr,
            productId: productId
          },
          {
            $inc: { soldQty: quantitySold },
            $set: {
              title: item.title || product.title || 'Unknown Product',
              handle: product.handle || null,
              imageUrl: product.images?.edges?.[0]?.node?.url || null,
              lastUpdatedAt: new Date()
            },
            $setOnInsert: {
              firstSeenAt: new Date()
            }
          },
          { upsert: true }
        );

        updatedProductsCount++;

        console.log(`→ Saved: ${product.title || '?'} (${productId}) +${quantitySold}`);
      } catch (saveError) {
        console.error(`Error saving ${productId}: ${saveError.message}`);
      }
    }
  }

  console.log(`💾 Finished saving: ${updatedProductsCount} records`);

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

  // Return small summary instead of huge allOrders array
  return json({
    status: "success",
    date: yesterdayDateStr,
    ordersFetched: allOrders.length,
    productsSaved: updatedProductsCount,
    message: "Yesterday orders processed and saved"
  });
};