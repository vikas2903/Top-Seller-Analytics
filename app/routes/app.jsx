import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";

import 'antd/dist/antd.css';
export const loader = async ({ request }) => {
  await authenticate.admin(request);

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        {/* <s-link href="/app">Home</s-link> */}
        {/* <s-link href="/app/additional">Additional page</s-link> */}
        {/* <s-link href="/app/topselling">Products</s-link> */}
        <s-link href="/app/products">Products</s-link>
        <s-link href="/api/cron-dailyordersync-last30days">Last 30 Days Orders Sync</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  ); 
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
