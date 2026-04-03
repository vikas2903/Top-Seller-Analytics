import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  BlockStack,
  Card,
  InlineStack,
  Layout,
  Link,
  List,
  Page,
  Text,
} from "@shopify/polaris";

export default function HelpPage() {
  return (
    <Page
      title="Help & support"
      subtitle="Support details for merchants using this app."
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">
                  Need help with Top Seller Blocks?
                </Text>
                <Text as="p" tone="subdued">
                  If you need help with syncing, best-seller blocks, theme setup, or storefront
                  integration, contact us using the details below.
                </Text>
              </BlockStack>

              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">
                  Support emails
                </Text>
                <List>
                  <List.Item>
                    Primary support:{" "}
                    <Link url="mailto:support@digisidekick.com">
                      support@digisidekick.com
                    </Link>
                  </List.Item>
                  <List.Item>
                    Direct contact:{" "}
                    <Link url="mailto:vikasprasad@digisidekick.com">
                      vikasprasad@digisidekick.com
                    </Link>
                  </List.Item>
                </List>
              </BlockStack>

              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">
                  We can help with
                </Text>
                <List>
                  <List.Item>Block installation on home and collection pages</List.Item>
                  <List.Item>Daily and last 30 days sync issues</List.Item>
                  <List.Item>Theme customization guidance</List.Item>
                  <List.Item>General app setup and troubleshooting</List.Item>
                </List>
              </BlockStack>

              <InlineStack gap="300">
                <Link url="/app/blocks-guide">Open Blocks Guide</Link>
                <Link url="/app">Back to dashboard</Link>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
