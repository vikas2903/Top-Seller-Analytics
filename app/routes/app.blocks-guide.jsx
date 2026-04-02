/* eslint-disable react/prop-types */
import { json } from "@remix-run/node";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  Grid,
  InlineGrid,
  InlineStack,
  Layout,
  List,
  Page,
  Select,
  Text,
} from "@shopify/polaris";
import { useEffect, useMemo, useState } from "react";
import { useFetcher, useLoaderData, useRevalidator } from "react-router";
import { ProcessedDay } from "../lib/processeddayschema.js";
import connectDataBase from "../lib/db.js";
import { authenticate } from "../shopify.server";
import { runTopSellerSync } from "../lib/top-seller-sync.server.js";
import { getOrders } from "./app.dailylast30daysproductsync.jsx";

const BLOCKS = [
  {
    title: "Last 7 Days Best Sellers",
    handle: "last_sevendays_topselling_products",
    template: "index",
    target: "newAppsSection",
    accent: "#0f766e",
    eyebrow: "Homepage block",
    location: "Home page",
    summary:
      "Shows the strongest products from the last 7 days so shoppers immediately see what is trending now.",
    bullets: [
      "Best for your home page hero or below featured collections",
      "Builds trust with recent sales momentum",
      "Works well when you want a weekly trend story",
    ],
  },
  {
    title: "Last 24 Hours Best Sellers",
    handle: "daily_topselling_products",
    template: "index",
    target: "newAppsSection",
    accent: "#b45309",
    eyebrow: "Homepage block",
    location: "Home page",
    summary:
      "Highlights what sold in the last 24 hours to create urgency and make the storefront feel live.",
    bullets: [
      "Best for high-frequency stores and daily promotions",
      "Good when you want fresh daily proof",
      "Great for limited-time demand messaging",
    ],
  },
  {
    title: "Collection Best Sellers",
    handle: "daily_collection_wise_bestselling_products",
    template: "collection",
    target: "mainSection",
    accent: "#1d4ed8",
    eyebrow: "Collection page block",
    location: "Collection page",
    summary:
      "Displays the best sellers inside each collection so the products match the shopper's browsing intent.",
    bullets: [
      "Best for collection pages like Shirts, Shoes, or New Arrivals",
      "Keeps recommendations tightly relevant to the current collection",
      "Helps shoppers discover the strongest items faster",
    ],
  },
];

const SETUP_STEPS = [
  "Run sync so the app has recent order data.",
  "Choose the theme you want to customize.",
  "Open the right customizer template from a block card below.",
  "Add the block, place it where you want, then save the theme.",
];

function assertGraphqlSuccess(responseJson, contextLabel) {
  if (responseJson.errors?.length) {
    throw new Error(
      `${contextLabel}: ${responseJson.errors
        .map((error) => error.message)
        .join(", ")}`,
    );
  }
}

function formatRole(role) {
  if (!role) return "Unknown";
  return role
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDateTime(value) {
  if (!value) return "Not synced yet";

  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const normalizedShop = session.shop.replace(".myshopify.com", "");

  await connectDataBase();

  const [response, latestProcessedDay] = await Promise.all([
    admin.graphql(`
      query BlocksGuideThemes {
        themes(first: 50) {
          nodes {
            id
            name
            role
          }
        }
      }
    `),
    ProcessedDay.findOne({ shop: session.shop }).sort({ processedAt: -1 }).lean(),
  ]);

  const responseJson = await response.json();
  assertGraphqlSuccess(responseJson, "Themes query failed");

  const themes = (responseJson.data?.themes?.nodes || [])
    .map((theme) => ({
      id: theme.id,
      numericId: theme.id.split("/").pop(),
      name: theme.name || "Untitled theme",
      role: theme.role || "UNPUBLISHED",
    }))
    .sort((firstTheme, secondTheme) => {
      if (firstTheme.role === "MAIN" && secondTheme.role !== "MAIN") return -1;
      if (firstTheme.role !== "MAIN" && secondTheme.role === "MAIN") return 1;
      if (firstTheme.role === "DEVELOPMENT" && secondTheme.role !== "DEVELOPMENT") return -1;
      if (firstTheme.role !== "DEVELOPMENT" && secondTheme.role === "DEVELOPMENT") return 1;
      return firstTheme.name.localeCompare(secondTheme.name);
    });

  return json({
    // eslint-disable-next-line no-undef
    apiKey: process.env.SHOPIFY_API_KEY || "",
    normalizedShop,
    latestProcessedDay: latestProcessedDay
      ? {
          date: latestProcessedDay.date,
          processedAt: latestProcessedDay.processedAt,
          orderCount: latestProcessedDay.orderCount || 0,
          recordsUpdated: latestProcessedDay.recordsUpdated || 0,
        }
      : null,
    themes,
  });
};

export const action = async ({ request }) => {
  await connectDataBase();

  const formData = await request.formData();
  const intent = formData.get("intent");
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  if (intent === "run-daily-sync") {
    const result = await runTopSellerSync({ admin, shop });

    return json({
      ok: true,
      intent,
      message: `Daily sync completed for ${result.date}. Orders: ${result.orderCount}, products updated: ${result.updatedProductsCount}.`,
    });
  }

  if (intent === "run-last30-sync") {
    const allOrders = await getOrders({ admin });

    return json({
      ok: true,
      intent,
      message: `Last 30 days sync completed. Orders processed: ${allOrders.length}.`,
    });
  }

  return json(
    {
      ok: false,
      message: "Unknown sync action.",
    },
    { status: 400 },
  );
};

function BlockPreview({ accent, eyebrow, location }) {
  return (
    <div
      style={{
        borderRadius: 16,
        border: "1px solid rgba(15, 23, 42, 0.08)",
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(248,250,252,1) 100%)",
        padding: 16,
        minHeight: 188,
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          borderRadius: 999,
          background: `${accent}14`,
          color: accent,
          padding: "6px 10px",
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: accent,
          }}
        />
        {eyebrow}
      </div>

      <div
        style={{
          marginTop: 14,
          borderRadius: 14,
          overflow: "hidden",
          border: "1px solid rgba(15, 23, 42, 0.06)",
          background: "#fff",
        }}
      >
        <div
          style={{
            padding: "14px 14px 12px",
            background: "linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)",
            borderBottom: "1px solid rgba(15, 23, 42, 0.06)",
          }}
        >
          <div style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: accent, fontWeight: 700 }}>
            {location}
          </div>
          <div style={{ marginTop: 6, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>
            Best sellers section
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, padding: 12 }}>
          {[1, 2, 3].map((item) => (
            <div key={item}>
              <div
                style={{
                  height: 70,
                  borderRadius: 10,
                  background: `linear-gradient(135deg, ${accent} 0%, #0f172a 180%)`,
                  opacity: 0.9 - item * 0.08,
                }}
              />
              <div style={{ marginTop: 8, height: 8, borderRadius: 999, background: "#dbe4f0" }} />
              <div style={{ marginTop: 6, width: "70%", height: 8, borderRadius: 999, background: "#e8eef6" }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function BlocksGuidePage() {
  const { apiKey, normalizedShop, latestProcessedDay, themes } = useLoaderData();
  const [selectedThemeId, setSelectedThemeId] = useState(themes[0]?.numericId || "");
  const dailySyncFetcher = useFetcher();
  const last30SyncFetcher = useFetcher();
  const revalidator = useRevalidator();

  const selectedTheme = themes.find((theme) => theme.numericId === selectedThemeId) || themes[0] || null;
  const hasSyncData = Boolean(latestProcessedDay?.processedAt);

  useEffect(() => {
    if (dailySyncFetcher.state === "idle" && dailySyncFetcher.data?.ok) {
      revalidator.revalidate();
    }
  }, [dailySyncFetcher.data, dailySyncFetcher.state, revalidator]);

  useEffect(() => {
    if (last30SyncFetcher.state === "idle" && last30SyncFetcher.data?.ok) {
      revalidator.revalidate();
    }
  }, [last30SyncFetcher.data, last30SyncFetcher.state, revalidator]);

  const themeOptions = useMemo(
    () =>
      themes.map((theme) => ({
        label: `${theme.name} (${formatRole(theme.role)})`,
        value: theme.numericId,
      })),
    [themes],
  );

  const buildCustomizerUrl = (block) => {
    if (!selectedTheme || !apiKey) return "";

    return `https://admin.shopify.com/store/${normalizedShop}/themes/${selectedTheme.numericId}/editor?template=${block.template}&addAppBlockId=${apiKey}/${block.handle}&target=${block.target}`;
  };

  return (
    <Page
      title="Blocks guide"
      subtitle="Install the right best-seller block on the right storefront page with less guesswork."
      secondaryActions={[
        {
          content: "Open dashboard",
          url: "/app",
        },
      ]}
    >
      <Layout>
        <Layout.Section>
          {!hasSyncData ? (
            <Banner title="Sync your store data before installing blocks" tone="warning">
              <p>
                We have not found a recent sync yet. Run the last 30 days sync first so your blocks
                can show real best-seller products instead of empty states.
              </p>
            </Banner>
          ) : (
            <Banner title="Your sales data is ready" tone="success">
              <p>
                Last sync: {formatDateTime(latestProcessedDay.processedAt)}. Orders processed:{" "}
                {latestProcessedDay.orderCount}. Products updated: {latestProcessedDay.recordsUpdated}.
              </p>
            </Banner>
          )}
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Run sync from here
              </Text>
              <Text as="p" tone="subdued">
                Use these buttons to refresh your daily top sellers and last 30 days collection data
                without leaving this page.
              </Text>
              <InlineStack gap="200" wrap>
                <dailySyncFetcher.Form method="post">
                  <input type="hidden" name="intent" value="run-daily-sync" />
                  <Button submit loading={dailySyncFetcher.state !== "idle"}>
                    Run daily sync
                  </Button>
                </dailySyncFetcher.Form>
                <last30SyncFetcher.Form method="post">
                  <input type="hidden" name="intent" value="run-last30-sync" />
                  <Button submit loading={last30SyncFetcher.state !== "idle"} variant="primary">
                    Run last 30 days sync
                  </Button>
                </last30SyncFetcher.Form>
              </InlineStack>
              {dailySyncFetcher.data?.message ? (
                <Banner tone={dailySyncFetcher.data.ok ? "success" : "critical"}>
                  <p>{dailySyncFetcher.data.message}</p>
                </Banner>
              ) : null}
              {last30SyncFetcher.data?.message ? (
                <Banner tone={last30SyncFetcher.data.ok ? "success" : "critical"}>
                  <p>{last30SyncFetcher.data.message}</p>
                </Banner>
              ) : null}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={{ xs: 1, md: "2fr 1fr" }} gap="400">
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingLg">
                    AI-assisted storefront block showcase
                  </Text>
                  <Text as="p" tone="subdued">
                    Choose a theme, review what each block is for, and jump straight into Shopify
                    customizer on the correct template.
                  </Text>
                </BlockStack>

                <InlineStack gap="300" align="start" blockAlign="end" wrap>
                  <div style={{ minWidth: 300, flex: "1 1 320px" }}>
                    <Select
                      label="Theme to customize"
                      options={themeOptions}
                      value={selectedThemeId}
                      onChange={setSelectedThemeId}
                      disabled={!themeOptions.length}
                    />
                  </div>
                  <Badge tone={selectedTheme?.role === "MAIN" ? "success" : "info"}>
                    {selectedTheme
                      ? `Selected: ${selectedTheme.name} (${formatRole(selectedTheme.role)})`
                      : "No theme found"}
                  </Badge>
                </InlineStack>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Setup checklist
                </Text>
                <List type="number">
                  {SETUP_STEPS.map((step) => (
                    <List.Item key={step}>{step}</List.Item>
                  ))}
                </List>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <Grid>
            {BLOCKS.map((block) => (
              <Grid.Cell key={block.handle} columnSpan={{ xs: 6, sm: 6, md: 3, lg: 4, xl: 4 }}>
                <Card>
                  <BlockStack gap="400">
                    <BlockPreview accent={block.accent} eyebrow={block.eyebrow} location={block.location} />

                    <BlockStack gap="200">
                      <InlineStack align="space-between" blockAlign="center">
                        <Badge tone="info">{block.eyebrow}</Badge>
                        <Text as="span" variant="bodySm" tone="subdued">
                          {block.location}
                        </Text>
                      </InlineStack>
                      <Text as="h3" variant="headingMd">
                        {block.title}
                      </Text>
                      <Text as="p" tone="subdued">
                        {block.summary}
                      </Text>
                    </BlockStack>

                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd" fontWeight="medium">
                        Best use
                      </Text>
                      <List>
                        {block.bullets.map((bullet) => (
                          <List.Item key={bullet}>{bullet}</List.Item>
                        ))}
                      </List>
                    </BlockStack>

                    <InlineStack align="space-between" blockAlign="center" wrap>
                      <BlockStack gap="050">
                        <Text as="p" variant="bodySm" tone="subdued">
                          Customizer destination
                        </Text>
                        <Text as="p" variant="bodyMd" fontWeight="medium">
                          {block.template === "index" ? "Homepage template" : "Collection template"}
                        </Text>
                      </BlockStack>
                      <Button
                        variant="primary"
                        url={buildCustomizerUrl(block)}
                        target="_top"
                        disabled={!buildCustomizerUrl(block)}
                      >
                        Integrate block
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </Card>
              </Grid.Cell>
            ))}
          </Grid>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Recommended next features
                </Text>
                <List>
                  <List.Item>Theme-level install status for each block</List.Item>
                  <List.Item>Manual re-sync button with success and failure feedback</List.Item>
                  <List.Item>Empty-state fallback when there are not enough orders yet</List.Item>
                  <List.Item>More design controls like product count, badge visibility, and colors</List.Item>
                </List>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Merchant help
                </Text>
                <List>
                  <List.Item>Use the 7-day block when you want stable weekly winners on the homepage.</List.Item>
                  <List.Item>Use the 24-hour block when you want a fast-moving, fresh homepage story.</List.Item>
                  <List.Item>Use the collection block when relevance matters more than global popularity.</List.Item>
                </List>
                <InlineStack gap="200">
                  <Button url="/app/dailylast30daysproductsync">Open sync page</Button>
                  <Button url="/app" variant="plain">
                    Back to dashboard
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
