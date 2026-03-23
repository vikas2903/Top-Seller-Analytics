import { authenticate } from "../shopify.server";
import db from "../db.server";
import { json } from "@remix-run/node";
import InstalledShop from "../lib/store.js";
import connectDataBase from "../lib/db.js";



// ✅ Loader (ONLY for loading data)
export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  return json({ shop: session.shop });
};


export const action = async ({ request }) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  if (topic === "APP_UNINSTALLED") {
    await connectDataBase();

    await InstalledShop.findOneAndUpdate(
      { shopId: shop },
      { active: false },
      { new: true }
    );

    console.log(`❌ Shop marked inactive: ${shop}`);
  }

  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }

  return new Response();
};



// export const action = async ({ request }) => {
//   const { shop, session, topic } = await authenticate.webhook(request);

//   console.log(`Received ${topic} webhook for ${shop}`);

//   // Webhook requests can trigger multiple times and after an app has already been uninstalled.
//   // If this webhook already ran, the session may have been deleted previously.
//   if (session) {
//     await db.session.deleteMany({ where: { shop } });
//   }

//   return new Response();
// };
