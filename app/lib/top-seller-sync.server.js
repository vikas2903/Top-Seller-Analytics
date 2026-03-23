// app/lib/top-seller-sync.server.js
import connectDataBase from "../lib/db.js";
import { ProcessedDay } from "../lib/processeddayschema.js";
import DailyProductSale from "../lib/dailyproductsaleschema.js";

export async function runTopSellerSync({ admin, shop }) {
  await connectDataBase();

  const now = new Date();
  const yesterday = new Date(now.getTime() - 86400000);

  const start = yesterday.toISOString();
  const end = now.toISOString();
  const yesterdayDateStr = yesterday.toISOString().split("T")[0];

  const QUERY_STR = `created_at:>=${start} AND created_at:<=${end}`;

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
    const ordersData = result.data.orders;

    allOrders = allOrders.concat(ordersData.edges);
    hasNextPage = ordersData.pageInfo.hasNextPage;
    cursor = ordersData.pageInfo.endCursor;
  }

  let updatedProductsCount = 0;

  const alreadyProcessed = await ProcessedDay.findOne({
    shop,
    date: yesterdayDateStr,
  });

  if (!alreadyProcessed) {
    for (const orderEdge of allOrders) {
      const lineItems = orderEdge.node.lineItems?.edges || [];

      for (const itemEdge of lineItems) {
        const item = itemEdge.node;
        const product = item.variant?.product;
        if (!product) continue;

        const productId = product.id.split("/").pop();
        const quantitySold = item.quantity;

        await DailyProductSale.findOneAndUpdate(
          {
            shop,
            date: yesterdayDateStr,
            productId,
          },
          {
            $inc: { soldQty: quantitySold },
            $set: {
              title: item.title || product.title || "Unknown Product",
              handle: product.handle || null,
              imageUrl: product.images?.edges?.[0]?.node?.url || null,
              lastUpdatedAt: new Date(),
            },
            $setOnInsert: {
              firstSeenAt: new Date(),
            },
          },
          { upsert: true }
        );

        updatedProductsCount++;
      }
    }

    await ProcessedDay.findOneAndUpdate(
      { shop, date: yesterdayDateStr },
      {
        processedAt: new Date(),
        orderCount: allOrders.length,
        recordsUpdated: updatedProductsCount,
      },
      { upsert: true }
    );

    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];

    const topProducts = await DailyProductSale.aggregate([
      {
        $match: {
          shop,
          date: { $gte: sevenDaysAgoStr },
        },
      },
      {
        $group: {
          _id: "$productId",
          totalSold: { $sum: "$soldQty" },
          title: { $first: "$title" },
          handle: { $first: "$handle" },
          imageUrl: { $first: "$imageUrl" },
        },
      },
      { $sort: { totalSold: -1 } },
      { $limit: 10 },
    ]);

    if (topProducts.length > 0) {
      const shopQuery = `
        query GetShopId {
          shop {
            id
          }
        }
      `;

      const shopResponse = await admin.graphql(shopQuery);
      const shopResult = await shopResponse.json();
      const shopGid = shopResult.data.shop.id;

      const metafieldValue = JSON.stringify({
        updatedAt: new Date().toISOString(),
        products: topProducts.map((p) => ({
          productId: p._id,
          title: p.title,
          handle: p.handle,
          imageUrl: p.imageUrl,
          totalSold: p.totalSold,
        })),
      });

      const metafieldMutation = `
        mutation SetTopSellersMetafield($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields {
              id
            }
            userErrors {
              field
              message
              code
            }
          }
        }
      `;

      const metafieldResponse = await admin.graphql(metafieldMutation, {
        variables: {
          metafields: [
            {
              ownerId: shopGid,
              namespace: "top_seller",
              key: "top_7days",
              type: "json",
              value: metafieldValue,
            },
          ],
        },
      });

      const metafieldResult = await metafieldResponse.json();

      if (metafieldResult?.data?.metafieldsSet?.userErrors?.length) {
        throw new Error(
          metafieldResult.data.metafieldsSet.userErrors
            .map((e) => e.message)
            .join(", ")
        );
      }
    }
  }

  return {
    ok: true,
    shop,
    alreadyProcessed: Boolean(alreadyProcessed),
    orderCount: allOrders.length,
    updatedProductsCount,
    date: yesterdayDateStr,
  };
}
