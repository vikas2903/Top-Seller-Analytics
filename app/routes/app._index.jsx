import { useEffect } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { json } from "@remix-run/node";
import { Page, Layout, LegacyCard } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import connectDataBase from "../lib/db.js";
import InstalledShop from "../lib/store.js";
import Dashboard from "../dashboard.jsx";

function getUtcDateRanges() {
  const now = new Date();
  const todayDate = now.toISOString().split("T")[0];
  const yesterday = new Date(now.getTime() - 86400000);
  const yesterdayDate = yesterday.toISOString().split("T")[0];

  return {
    todayQuery: `created_at:>=${todayDate}T00:00:00Z AND created_at:<=${now.toISOString()}`,
    yesterdayQuery: `created_at:>=${yesterdayDate}T00:00:00Z AND created_at:<=${yesterdayDate}T23:59:59Z`,
  };
}

async function fetchOrders(admin, query) {
  const orders = [];
  let cursor = null;
  let hasNextPage = true;

  const ORDERS_QUERY = `
    query DashboardOrders($query: String!, $cursor: String) {
      orders(first: 250, after: $cursor, query: $query, sortKey: CREATED_AT) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            id
            name
            createdAt
            lineItems(first: 100) {
              edges {
                node {
                  quantity
                }
              }
            }
          }
        }
      }
      ordersCount(query: $query) {
        count
      }
    }
  `;

  let totalCount = 0;

  while (hasNextPage) {
    const response = await admin.graphql(ORDERS_QUERY, {
      variables: { query, cursor },
    });
    const result = await response.json();

    if (result.errors?.length) {
      throw new Error(result.errors.map((error) => error.message).join(", "));
    }

    const ordersData = result?.data?.orders;
    if (!ordersData) {
      throw new Error("Orders query returned no data");
    }

    totalCount = result?.data?.ordersCount?.count ?? totalCount;
    orders.push(...ordersData.edges);
    hasNextPage = ordersData.pageInfo.hasNextPage;
    cursor = ordersData.pageInfo.endCursor;
  }

  return {
    count: totalCount,
    orders,
  };
}

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
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

  const { todayQuery, yesterdayQuery } = getUtcDateRanges();
  const [todayData, yesterdayData] = await Promise.all([
    fetchOrders(admin, todayQuery),
    fetchOrders(admin, yesterdayQuery),
  ]);

  return json({
    shopName,
    todayQuery,
    yesterdayQuery,
    todayOrdersCount: todayData.count,
    yesterdayOrdersCount: yesterdayData.count,
    todayOrders: todayData.orders,
    yesterdayOrders: yesterdayData.orders,
  });
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const color = ["Red", "Orange", "Yellow", "Green"][
    Math.floor(Math.random() * 4)
  ];
  const response = await admin.graphql(
    `#graphql
      mutation populateProduct($product: ProductCreateInput!) {
        productCreate(product: $product) {
          product {
            id
            title
            handle
            status
            variants(first: 10) {
              edges {
                node {
                  id
                  price
                  barcode
                  createdAt
                }
              }
            }
            demoInfo: metafield(namespace: "$app", key: "demo_info") {
              jsonValue
            }
          }
        }
      }`,
    {
      variables: {
        product: {
          title: `${color} Snowboard`,
          metafields: [
            {
              namespace: "$app",
              key: "demo_info",
              value: "Created by React Router Template",
            },
          ],
        },
      },
    },
  );
  const responseJson = await response.json();
  const product = responseJson.data.productCreate.product;
  const variantId = product.variants.edges[0].node.id;
  const variantResponse = await admin.graphql(
    `#graphql
    mutation shopifyReactRouterTemplateUpdateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants {
          id
          price
          barcode
          createdAt
        }
      }
    }`,
    {
      variables: {
        productId: product.id,
        variants: [{ id: variantId, price: "100.00" }],
      },
    },
  );
  const variantResponseJson = await variantResponse.json();
  const metaobjectResponse = await admin.graphql(
    `#graphql
    mutation shopifyReactRouterTemplateUpsertMetaobject($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
      metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
        metaobject {
          id
          handle
          title: field(key: "title") {
            jsonValue
          }
          description: field(key: "description") {
            jsonValue
          }
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        handle: {
          type: "$app:example",
          handle: "demo-entry",
        },
        metaobject: {
          fields: [
            { key: "title", value: "Demo Entry" },
            {
              key: "description",
              value:
                "This metaobject was created by the Shopify app template to demonstrate the metaobject API.",
            },
          ],
        },
      },
    },
  );
  const metaobjectResponseJson = await metaobjectResponse.json();

  return {
    product: responseJson.data.productCreate.product,
    variant: variantResponseJson.data.productVariantsBulkUpdate.productVariants,
    metaobject: metaobjectResponseJson.data.metaobjectUpsert.metaobject,
  };
};

export default function Index() {
  const data = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  useEffect(() => {
    if (fetcher.data?.product?.id) {
      shopify.toast.show("Product created");
    }
  }, [fetcher.data?.product?.id, shopify]);

  return (
    <Page>
      <Layout>
        <Layout.Section>
          <Dashboard />
          <LegacyCard>
            <pre>{JSON.stringify(data, null, 2)}</pre>
          </LegacyCard>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
