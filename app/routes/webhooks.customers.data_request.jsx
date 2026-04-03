import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { payload, topic, shop } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`, {
    shopId: payload.shop_id,
    customerId: payload.customer?.id || null,
    ordersRequested: payload.orders_requested || [],
    dataRequestId: payload.data_request?.id || null,
  });

  return new Response(null, { status: 200 });
};
