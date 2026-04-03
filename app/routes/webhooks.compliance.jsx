import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { payload, topic, shop } = await authenticate.webhook(request);

  if (topic === "CUSTOMERS_DATA_REQUEST") {
    console.log(`Received ${topic} webhook for ${shop}`, {
      shopId: payload.shop_id,
      customerId: payload.customer?.id || null,
      ordersRequested: payload.orders_requested || [],
      dataRequestId: payload.data_request?.id || null,
    });
  }

  if (topic === "CUSTOMERS_REDACT") {
    console.log(`Received ${topic} webhook for ${shop}`, {
      shopId: payload.shop_id,
      customerId: payload.customer?.id || null,
      ordersToRedact: payload.orders_to_redact || [],
    });
  }

  if (topic === "SHOP_REDACT") {
    console.log(`Received ${topic} webhook for ${shop}`, {
      shopId: payload.shop_id,
      shopDomain: payload.shop_domain || shop,
    });
  }

  return new Response(null, { status: 200 });
};
