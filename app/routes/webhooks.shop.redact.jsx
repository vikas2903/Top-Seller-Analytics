import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { payload, topic, shop } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`, {
    shopId: payload.shop_id,
    shopDomain: payload.shop_domain || shop,
  });

  return new Response(null, { status: 200 });
};
