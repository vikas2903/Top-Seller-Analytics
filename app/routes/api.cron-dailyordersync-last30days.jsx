import { json } from "@remix-run/node";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server.js";
import connectDataBase from "../lib/db.js";

function assertGraphqlSuccess(responseJson, contextLabel) {
  if (responseJson.errors?.length) {
    throw new Error(
      `${contextLabel}: ${responseJson.errors
        .map((error) => error.message)
        .join(", ")}`,
    );
  }
}

export const loader = async ({ request }) => {
  await connectDataBase();

  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const allOrders = await getOrders({ admin });

  return json({ shop, allOrders });
};

const getOrders = async ({ admin }) => {
  let allOrders = [];
  let cursor = null;
  let hasNextPage = true;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const createdAtMin = thirtyDaysAgo.toISOString();

  const query = `
    query getOrders($cursor: String) {
      orders(
        first: 250,
        after: $cursor,
        query: "created_at:>=${createdAtMin}"
      ) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            id
            lineItems(first: 50) {
              edges {
                node {
                  quantity
                  product {
                    id
                    title
                    collections(first: 10) {
                      edges {
                        node {
                          id
                          title
                          handle
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
    }
  `;

  while (hasNextPage) {
    const response = await admin.graphql(query, { variables: { cursor } });
    const responseJson = await response.json();
    assertGraphqlSuccess(responseJson, "Orders query failed");

    const { orders } = responseJson.data;
    allOrders.push(...orders.edges.map((edge) => edge.node));
    hasNextPage = orders.pageInfo.hasNextPage;
    cursor = orders.pageInfo.endCursor;
  }

  await buildCollectionSalesMap(allOrders, admin);

  return allOrders;
};

const buildCollectionSalesMap = async (orders, admin) => {
  const collectionMap = {};

  for (const order of orders) {
    for (const { node: lineItem } of order.lineItems.edges) {
      if (!lineItem.product) {
        continue;
      }

      const { id: productId, title, collections } = lineItem.product;
      const quantity = Number(lineItem.quantity) || 0;

      for (const { node: collection } of collections.edges) {
        const { id: collectionId, title: collectionTitle } = collection;

        if (!collectionMap[collectionId]) {
          collectionMap[collectionId] = {
            title: collectionTitle,
            products: {},
          };
        }

        if (!collectionMap[collectionId].products[productId]) {
          collectionMap[collectionId].products[productId] = {
            productId,
            title,
            totalQuantity: 0,
          };
        }

        collectionMap[collectionId].products[productId].totalQuantity += quantity;
      }
    }
  }

  await getTop10PerCollection(collectionMap, admin);
  return collectionMap;
};

const getTop10PerCollection = async (collectionMap, admin) => {
  const result = {};

  for (const [collectionId, data] of Object.entries(collectionMap)) {
    const sortedProducts = Object.values(data.products)
      .sort((firstProduct, secondProduct) => {
        return secondProduct.totalQuantity - firstProduct.totalQuantity;
      })
      .slice(0, 10);

    result[collectionId] = {
      collectionTitle: data.title,
      topProducts: sortedProducts,
    };
  }

  console.log("Top 10 Products Per Collection:", result);

  await saveAllCollections(result, admin);
  return result;
};

const verifyCollectionMetafield = async (collectionId, admin) => {
  const query = `
    query GetCollectionMetafield($ownerId: ID!) {
      collection(id: $ownerId) {
        id
        metafield(
          namespace: "top_sellers_collection_wise"
          key: "top_products_collection_wise"
        ) {
          id
          key
          namespace
          value
          updatedAt
        }
      }
    }
  `;

  const response = await admin.graphql(query, {
    variables: { ownerId: collectionId },
  });
  const responseJson = await response.json();
  assertGraphqlSuccess(
    responseJson,
    `Metafield verification query failed for ${collectionId}`,
  );

  return responseJson.data?.collection?.metafield || null;
};

const saveToCollectionMetafield = async (collectionId, topProducts, admin) => {
  const mutation = `
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
          key
          namespace
          value
          updatedAt
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const metafieldValue = JSON.stringify({
    updatedAt: new Date().toISOString(),
    products: topProducts,
  });

  const response = await admin.graphql(mutation, {
    variables: {
      metafields: [
        {
          ownerId: collectionId,
          namespace: "top_sellers_collection_wise",
          key: "top_products_collection_wise",
          type: "json",
          value: metafieldValue,
        },
      ],
    },
  });

  const responseJson = await response.json();
  assertGraphqlSuccess(
    responseJson,
    `Metafield save request failed for ${collectionId}`,
  );

  const userErrors = responseJson.data?.metafieldsSet?.userErrors;
  if (userErrors?.length) {
    console.error(`Metafield userErrors for ${collectionId}:`, userErrors);
    throw new Error(userErrors.map((error) => error.message).join(", "));
  }

  const savedMetafield = responseJson.data?.metafieldsSet?.metafields?.[0];
  if (!savedMetafield?.id) {
    throw new Error(
      `Metafield save did not return a saved metafield for ${collectionId}`,
    );
  }

  const verifiedMetafield = await verifyCollectionMetafield(collectionId, admin);
  if (!verifiedMetafield?.id) {
    throw new Error(
      `Metafield verification failed after save for ${collectionId}`,
    );
  }

  console.log("Verified collection metafield save", {
    collectionId,
    metafieldId: verifiedMetafield.id,
    updatedAt: verifiedMetafield.updatedAt,
    productCount: topProducts.length,
  });

  return verifiedMetafield;
};

const saveAllCollections = async (top10PerCollection, admin) => {
  const saveResults = [];

  for (const [collectionId, data] of Object.entries(top10PerCollection)) {
    const verifiedMetafield = await saveToCollectionMetafield(
      collectionId,
      data.topProducts,
      admin,
    );

    saveResults.push({
      collectionId,
      metafieldId: verifiedMetafield.id,
      updatedAt: verifiedMetafield.updatedAt,
    });
  }

  console.log("All collections saved successfully", saveResults);
  return saveResults;
};

export default function Last30DaysOrders() {
  useLoaderData();

  return <>Loading...</>;
}
