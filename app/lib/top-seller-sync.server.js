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
  } catch {
    throw new Error(`${contextLabel}: invalid JSON response from Shopify`);
  }

  const errorMessage = extractGraphqlErrorMessage(responseJson?.errors);
  if (errorMessage) {
    throw new Error(`${contextLabel}: ${errorMessage}`);
  }

  return responseJson;
}

function formatDateString(date) {
  return date.toISOString().split("T")[0];
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

async function fetchOrdersForRange({ admin, queryString, contextLabel }) {
  let allOrders = [];
  let hasNextPage = true;
  let cursor = null;

  const ordersQuery = `
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
    const response = await admin.graphql(ordersQuery, {
      variables: { query: queryString, after: cursor },
    });

    const result = await parseAdminGraphqlResponse(response, contextLabel);
    const ordersData = result?.data?.orders;

    if (!ordersData) {
      throw new Error(`${contextLabel}: Shopify orders query returned no data`);
    }

    allOrders = allOrders.concat(ordersData.edges);
    hasNextPage = ordersData.pageInfo.hasNextPage;
    cursor = ordersData.pageInfo.endCursor;
  }

  return allOrders;
}

function aggregateProducts(orderEdges) {
  const aggregatedProducts = new Map();
  let skippedLineItems = 0;

  for (const orderEdge of orderEdges) {
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
        productId,
        title: productTitle,
        handle: product.handle || null,
        imageUrl: product.images?.edges?.[0]?.node?.url || null,
        soldQty: quantitySold,
        price: Number(variantPrice) || 0,
      });
    }
  }

  const products = [...aggregatedProducts.values()].sort((firstProduct, secondProduct) => {
    if (secondProduct.soldQty !== firstProduct.soldQty) {
      return secondProduct.soldQty - firstProduct.soldQty;
    }

    return String(firstProduct.title || "").localeCompare(String(secondProduct.title || ""));
  });

  return {
    products,
    skippedLineItems,
  };
}

function buildSevenDayProducts(orderEdges) {
  const { products } = aggregateProducts(orderEdges);

  return products.slice(0, 10).map((product) => ({
    productId: product.productId,
    title: product.title,
    handle: product.handle,
    imageUrl: product.imageUrl,
    totalSold: product.soldQty,
    price: product.price,
  }));
}

async function updateTopSellerMetafields({
  admin,
  shopGid,
  previousDayProducts,
  topProducts,
  summary,
}) {
  const metafields = [
    {
      ownerId: shopGid,
      namespace: "top_seller",
      key: "top_7days",
      type: "json",
      value: JSON.stringify({
        updatedAt: summary.syncedAt,
        dateRangeStart: summary.sevenDayRangeStart,
        dateRangeEnd: summary.date,
        products: topProducts,
      }),
    },
    {
      ownerId: shopGid,
      namespace: "top_seller",
      key: "previousday",
      type: "json",
      value: JSON.stringify({
        updatedAt: summary.syncedAt,
        date: summary.date,
        products: previousDayProducts,
      }),
    },
    {
      ownerId: shopGid,
      namespace: "top_seller",
      key: "sync_summary",
      type: "json",
      value: JSON.stringify(summary),
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
        .join(", "),
    );
  }
}

function safeJsonParse(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export async function getTopSellerMetafieldsSnapshot(admin) {
  const query = `
    query GetTopSellerSnapshot {
      shop {
        id
        previousday: metafield(namespace: "top_seller", key: "previousday") {
          id
          value
          updatedAt
        }
        top7days: metafield(namespace: "top_seller", key: "top_7days") {
          id
          value
          updatedAt
        }
        syncSummary: metafield(namespace: "top_seller", key: "sync_summary") {
          id
          value
          updatedAt
        }
      }
    }
  `;

  const response = await admin.graphql(query);
  const result = await parseAdminGraphqlResponse(
    response,
    "Top seller metafield read failed",
  );

  const shop = result?.data?.shop;

  return {
    shopGid: shop?.id || null,
    previousday: safeJsonParse(shop?.previousday?.value),
    top7days: safeJsonParse(shop?.top7days?.value),
    syncSummary: safeJsonParse(shop?.syncSummary?.value),
    metafieldUpdatedAt: {
      previousday: shop?.previousday?.updatedAt || null,
      top7days: shop?.top7days?.updatedAt || null,
      syncSummary: shop?.syncSummary?.updatedAt || null,
    },
  };
}

export async function runTopSellerSync({ admin, shop }) {
  const now = new Date();
  const last24HoursStart = new Date(now.getTime() - 86400000);
  const sevenDayStart = new Date(now.getTime() - (7 * 86400000));
  const syncDateStr = formatDateString(now);
  const sevenDayStartStr = formatDateString(sevenDayStart);

  const last24HoursQuery = `created_at:>=${last24HoursStart.toISOString()} AND created_at:<=${now.toISOString()}`;
  const sevenDayQuery = `created_at:>=${sevenDayStart.toISOString()} AND created_at:<=${now.toISOString()}`;

  const [shopGid, yesterdayOrders, sevenDayOrders] = await Promise.all([
    getShopGid(admin),
    fetchOrdersForRange({
      admin,
      queryString: last24HoursQuery,
      contextLabel: `Last 24 hours orders query failed for ${shop}`,
    }),
    fetchOrdersForRange({
      admin,
      queryString: sevenDayQuery,
      contextLabel: `7-day orders query failed for ${shop}`,
    }),
  ]);

  const {
    products: previousDayProductsAll,
    skippedLineItems,
  } = aggregateProducts(yesterdayOrders);
  const previousDayProducts = previousDayProductsAll.slice(0, 10);
  const topProducts = buildSevenDayProducts(sevenDayOrders);
  const syncedAt = new Date().toISOString();

  const summary = {
    syncedAt,
    date: syncDateStr,
    last24HoursStart: last24HoursStart.toISOString(),
    last24HoursEnd: now.toISOString(),
    orderCount: yesterdayOrders.length,
    productsUpdated: previousDayProductsAll.length,
    skippedLineItems,
    sevenDayRangeStart: sevenDayStartStr,
    sevenDayRangeEnd: syncDateStr,
    topProductName: previousDayProducts[0]?.title || null,
    topProductSoldQty: previousDayProducts[0]?.soldQty || 0,
    previousDayProducts,
    sevenDayTopProducts: topProducts,
  };

  await updateTopSellerMetafields({
    admin,
    shopGid,
    previousDayProducts,
    topProducts,
    summary,
  });

  return {
    ok: true,
    shop,
    alreadyProcessed: false,
    orderCount: yesterdayOrders.length,
    updatedProductsCount: previousDayProductsAll.length,
    skippedLineItems,
    date: syncDateStr,
    syncedAt,
    previousDayProducts,
    topProducts,
  };
}
