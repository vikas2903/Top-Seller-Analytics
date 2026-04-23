// app/lib/top-seller-sync.server.js
import connectDataBase from "../lib/db.js";
import { ProcessedDay } from "../lib/processeddayschema.js";
import DailyProductSale from "../lib/dailyproductsaleschema.js";

function extractGraphqlErrorMessage(errors) {
  if (!errors) {
    return null;
  }

  if (Array.isArray(errors)) {
    return errors
      .map((error) => error?.message || JSON.stringify(error))
      .join(", ");
  }

  if (typeof errors === "string") {
    return errors;
  }

  if (typeof errors === "object") {
    if (typeof errors.message === "string") {
      return errors.message;
    }

    return JSON.stringify(errors);
  }

  return String(errors);
}

async function parseAdminGraphqlResponse(response, contextLabel) {
  let responseJson;

  try {
    responseJson = await response.json();
  } catch (error) {
    throw new Error(`${contextLabel}: invalid JSON response from Shopify`);
  }

  const errorMessage = extractGraphqlErrorMessage(responseJson?.errors);
  if (errorMessage) {
    throw new Error(`${contextLabel}: ${errorMessage}`);
  }

  return responseJson;
}

function shouldSkipProduct({ title, price }) {
  const normalizedTitle = String(title || "").toLowerCase();
  const normalizedPrice = Number(price) || 0;

  return (
    normalizedTitle.includes("gift") ||
    normalizedTitle.includes("mystry box") ||
    normalizedTitle.includes("mystery box") ||
    normalizedPrice <= 0
  );
}

async function getShopGid(admin) {
  const shopQuery = `
    query GetShopId {
      shop {
        id
      }
    }
  `;

  const shopResponse = await admin.graphql(shopQuery);
  const shopResult = await parseAdminGraphqlResponse(
    shopResponse,
    "Shop query failed",
  );

  return shopResult.data.shop.id;
}

async function updateTopSellerMetafields({
  admin,
  shopGid,
  previousDayProducts,
  topProducts,
  yesterdayDateStr,
}) {
  const metafields = [
    {
      ownerId: shopGid,
      namespace: "top_seller",
      key: "top_7days",
      type: "json",
      value: JSON.stringify({
        updatedAt: new Date().toISOString(),
        dateRangeEnd: yesterdayDateStr,
        products: topProducts.map((product) => ({
          productId: product._id,
          title: product.title,
          handle: product.handle,
          imageUrl: product.imageUrl,
          totalSold: product.totalSold,
          price: product.price,
        })),
      }),
    },
    {
      ownerId: shopGid,
      namespace: "top_seller",
      key: "previousday",
      type: "json",
      value: JSON.stringify({
        updatedAt: new Date().toISOString(),
        date: yesterdayDateStr,
        products: previousDayProducts.map((product) => ({
          productId: product.productId,
          title: product.title,
          handle: product.handle,
          imageUrl: product.imageUrl,
          soldQty: product.soldQty,
          price: product.price,
        })),
      }),
    },
  ];

  const metafieldMutation = `
    mutation SetTopSellersMetafield($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
          key
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
    variables: { metafields },
  });

  const metafieldResult = await parseAdminGraphqlResponse(
    metafieldResponse,
    "Metafield update failed",
  );

  if (metafieldResult?.data?.metafieldsSet?.userErrors?.length) {
    throw new Error(
      metafieldResult.data.metafieldsSet.userErrors
        .map((error) => error.message)
        .join(", ")
    );
  }
}

export async function runTopSellerSync({ admin, shop }) {
  await connectDataBase();

  const now = new Date();
  const yesterday = new Date(now.getTime() - 86400000);
  const yesterdayDateStr = yesterday.toISOString().split("T")[0];
  const start = new Date(`${yesterdayDateStr}T00:00:00.000Z`);
  const end = new Date(`${yesterdayDateStr}T23:59:59.999Z`);
  const QUERY_STR = `created_at:>=${start.toISOString()} AND created_at:<=${end.toISOString()}`;

  console.log("QUERY_STR", QUERY_STR);

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
                    price
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

    const result = await parseAdminGraphqlResponse(
      response,
      `Orders query failed for ${shop}`,
    );

    if (!result?.data?.orders) {
      throw new Error("Shopify orders query returned no data");
    }

    const ordersData = result.data.orders;

    allOrders = allOrders.concat(ordersData.edges);
    hasNextPage = ordersData.pageInfo.hasNextPage;
    cursor = ordersData.pageInfo.endCursor;
  }

  let updatedProductsCount = 0;
  let skippedLineItems = 0;

  const alreadyProcessed = await ProcessedDay.findOne({
    shop,
    date: yesterdayDateStr,
  });

  const shouldSkip =
    alreadyProcessed &&
    alreadyProcessed.recordsUpdated > 0 &&
    alreadyProcessed.orderCount === allOrders.length;

  if (!shouldSkip) {
    const aggregatedProducts = new Map();

    for (const orderEdge of allOrders) {
      const lineItems = orderEdge.node.lineItems?.edges || [];

      for (const itemEdge of lineItems) {
        const item = itemEdge.node;
        const product = item.variant?.product;
        const variantPrice = item.variant?.price;
        const productTitle = item.title || product?.title || "Unknown Product";

        if (!product?.id) {
          skippedLineItems++;
          continue;
        }

        if (shouldSkipProduct({ title: productTitle, price: variantPrice })) {
          skippedLineItems++;
          continue;
        }

        const productId = product.id.split("/").pop();
        const quantitySold = Number(item.quantity) || 0;
        const existingProduct = aggregatedProducts.get(productId);

        if (existingProduct) {
          existingProduct.soldQty += quantitySold;
          if (!existingProduct.imageUrl) {
            existingProduct.imageUrl = product.images?.edges?.[0]?.node?.url || null;
          }
          continue;
        }

        aggregatedProducts.set(productId, {
          shop,
          date: yesterdayDateStr,
          productId,
          title: productTitle,
          handle: product.handle || null,
          imageUrl: product.images?.edges?.[0]?.node?.url || null,
          soldQty: quantitySold,
          price: Number(variantPrice) || 0,
          firstSeenAt: new Date(),
          lastUpdatedAt: new Date(),
        });
      }
    }

    await DailyProductSale.deleteMany({
      shop,
      date: yesterdayDateStr,
    });

    if (aggregatedProducts.size > 0) {
      await DailyProductSale.insertMany([...aggregatedProducts.values()]);
    }

    updatedProductsCount = aggregatedProducts.size;

    await ProcessedDay.findOneAndUpdate(
      { shop, date: yesterdayDateStr },
      {
        processedAt: new Date(),
        orderCount: allOrders.length,
        recordsUpdated: updatedProductsCount,
        skippedLineItems,
      },
      { upsert: true }
    );

  }

  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];

  const [topProducts, previousDayProducts, shopGid] = await Promise.all([
    DailyProductSale.aggregate([
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
          price: { $first: "$price" },
        },
      },
      { $sort: { totalSold: -1 } },
      { $limit: 10 },
    ]),
    DailyProductSale.find({ shop, date: yesterdayDateStr })
      .sort({ soldQty: -1, lastUpdatedAt: -1, title: 1 })
      .limit(10)
      .lean(),
    getShopGid(admin),
  ]);

  await updateTopSellerMetafields({
    admin,
    shopGid,
    previousDayProducts,
    topProducts,
    yesterdayDateStr,
  });

  return {
    ok: true,
    shop,
    alreadyProcessed: Boolean(shouldSkip),
    orderCount: allOrders.length,
    updatedProductsCount,
    skippedLineItems,
    date: yesterdayDateStr,
  };
}
