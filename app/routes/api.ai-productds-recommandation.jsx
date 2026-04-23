import { json } from "@remix-run/node";
import { unauthenticated } from "../shopify.server.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const PRODUCT_SEARCH_QUERY = `
  query ProductRecommendations($first: Int!) {
    products(first: $first, sortKey: TITLE) {
      edges {
        node {
          id
          title
          handle
          productType
          vendor
          tags
          description
          featuredImage {
            url
            altText
          }
          variants(first: 1) {
            edges {
              node {
                price
              }
            }
          }
        }
      }
    }
  }
`;

const categoryAliases = {
  perfume: ["perfume", "perfumes", "fragrance", "fragrances", "scent", "attar", "deo", "deodorant", "cologne"],
  skincare: ["skincare", "skin care", "serum", "cleanser", "face wash", "moisturizer", "cream", "sunscreen"],
  makeup: ["makeup", "lipstick", "foundation", "mascara", "compact", "blush", "eyeliner"],
  haircare: ["haircare", "hair care", "shampoo", "conditioner", "hair oil", "hair serum"],
  shoes: ["shoe", "shoes", "sneaker", "sneakers", "heels", "boots", "sandals", "slippers"],
  bags: ["bag", "bags", "handbag", "wallet", "backpack", "purse"],
  clothing: ["dress", "shirt", "tshirt", "t-shirt", "jeans", "kurti", "hoodie", "jacket", "clothing"],
  jewelry: ["jewelry", "jewellery", "ring", "necklace", "earrings", "bracelet"],
  electronics: ["electronics", "phone", "mobile", "laptop", "earbuds", "speaker", "watch", "charger"],
};

const fillerWords = new Set([
  "please",
  "show",
  "me",
  "i",
  "need",
  "want",
  "looking",
  "for",
  "some",
  "best",
  "good",
  "suggest",
  "recommend",
  "product",
  "products",
  "item",
  "items",
  "buy",
  "purchase",
  "give",
  "can",
  "you",
  "help",
  "with",
  "a",
  "an",
  "the",
]);

export const options = async () => {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
};

function extractGraphqlErrorMessage(errors) {
  if (!errors) {
    return null;
  }

  if (Array.isArray(errors)) {
    return errors.map((error) => error?.message || JSON.stringify(error)).join(", ");
  }

  if (typeof errors === "string") {
    return errors;
  }

  if (typeof errors === "object" && typeof errors.message === "string") {
    return errors.message;
  }

  return String(errors);
}

async function parseAdminGraphqlResponse(response, contextLabel) {
  let responseJson;

  try {
    responseJson = await response.json();
  } catch (error) {
    throw new Error(`${contextLabel}: invalid JSON response from Shopify`);
  }

  const errorMessage = extractGraphqlErrorMessage(responseJson?.errors);
  if (errorMessage) {
    throw new Error(`${contextLabel}: ${errorMessage}`);
  }

  return responseJson;
}

function normalizeProducts(edges = []) {
  return edges
    .map((edge) => edge?.node)
    .filter(Boolean)
    .map((product) => ({
      id: product.id,
      title: product.title || "Untitled product",
      handle: product.handle || "",
      productType: product.productType || "",
      vendor: product.vendor || "",
      tags: Array.isArray(product.tags) ? product.tags : [],
      description: product.description || "",
      image: product.featuredImage?.url || "",
      imageAlt: product.featuredImage?.altText || product.title || "Product",
      price: product.variants?.edges?.[0]?.node?.price || "",
    }));
}

function normalizeQuery(query) {
  return String(query || "")
    .toLowerCase()
    .trim();
}

function tokenizeQuery(query) {
  return normalizeQuery(query)
    .split(/\s+/)
    .map((word) => word.replace(/[^a-z]/g, ""))
    .filter((word) => word && !fillerWords.has(word));
}

function detectCategory(query, products) {
  const normalizedQuery = normalizeQuery(query);

  for (const [category, aliases] of Object.entries(categoryAliases)) {
    if (aliases.some((alias) => normalizedQuery.includes(alias))) {
      return category;
    }
  }

  const productCategories = new Map();

  products.forEach((product) => {
    const values = [product.productType]
      .concat(product.tags || [])
      .map((value) => String(value || "").trim())
      .filter((value) => value.length > 2);

    values.forEach((value) => {
      const key = value.toLowerCase();
      if (!productCategories.has(key)) {
        productCategories.set(key, value);
      }
    });
  });

  for (const [key, value] of productCategories.entries()) {
    if (normalizedQuery.includes(key)) {
      return value;
    }
  }

  return "";
}

function detectPreference(query) {
  const normalizedQuery = normalizeQuery(query);

  if (/(men|man|male|boys|gents|him)/.test(normalizedQuery)) {
    return "for men";
  }

  if (/(women|woman|female|girls|ladies|her)/.test(normalizedQuery)) {
    return "for women";
  }

  if (/(premium|luxury)/.test(normalizedQuery)) {
    return "premium";
  }

  if (/(budget|affordable|cheap|low price)/.test(normalizedQuery)) {
    return "budget-friendly";
  }

  return "";
}

function isGreetingOnly(query) {
  return /^(hi+|hello+|hey+|hii+|hola+|good morning|good evening|good afternoon)$/.test(normalizeQuery(query));
}

function isCategoryDiscoveryQuery(query) {
  return /(category|categories|what do you have|show category|product category|suggest category)/.test(normalizeQuery(query));
}

function isVagueShoppingIntent(query) {
  return /(suggest|recommend|show|need|want|looking for|help me|something nice|best product|best products)/.test(normalizeQuery(query));
}

function scoreProducts(products, query, detectedCategory, preference) {
  const queryTokens = tokenizeQuery(query);

  return products
    .map((product) => {
      const haystack = [
        product.title,
        product.productType,
        product.vendor,
        product.description,
        (product.tags || []).join(" "),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      let score = 0;

      queryTokens.forEach((token) => {
        if (haystack.includes(token)) {
          score += 2;
        }
      });

      if (detectedCategory && haystack.includes(detectedCategory.toLowerCase())) {
        score += 8;
      }

      if (preference && haystack.includes(preference.toLowerCase())) {
        score += 3;
      }

      if (product.title && normalizeQuery(query).includes(product.title.toLowerCase())) {
        score += 4;
      }

      return {
        product,
        score,
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.product);
}

function selectProducts(products, query, detectedCategory, preference) {
  const matchedProducts = scoreProducts(products, query, detectedCategory, preference);

  if (matchedProducts.length >= 3) {
    return matchedProducts.slice(0, 3);
  }

  const combinedProducts = matchedProducts.concat(products);
  const uniqueProducts = combinedProducts.filter((product, index, collection) => {
    return collection.findIndex((item) => item.id === product.id) === index;
  });

  return uniqueProducts.slice(0, 3);
}

function buildRecommendationMessages({ category, preference }) {
  let details = `I understood that you want ${category} products`;

  if (preference) {
    details += ` ${preference}`;
  }

  return [
    "Sure, I can help you with that.",
    `${details}.`,
    "Here are 3 suggestions for you.",
  ];
}

function buildChatResponse(products, query) {
  const normalizedQuery = normalizeQuery(query);
  const category = detectCategory(query, products);
  const preference = detectPreference(query);

  if (isGreetingOnly(normalizedQuery)) {
    return {
      messages: [
        "Hi there. Welcome to Digi.",
        "Which category product do you need today? You can ask for perfumes, skincare, shoes, bags, or makeup.",
      ],
      products: [],
      category: "",
    };
  }

  if (isCategoryDiscoveryQuery(normalizedQuery)) {
    return {
      messages: [
        "I can suggest products category-wise.",
        "Please tell me which category you need, like perfumes, skincare, makeup, haircare, shoes, bags, clothing, jewelry, or electronics.",
      ],
      products: [],
      category: "",
    };
  }

  if (!category && isVagueShoppingIntent(normalizedQuery)) {
    return {
      messages: [
        "Sure, I can help you with that.",
        "Which category product would you like me to suggest?",
      ],
      products: [],
      category: "",
    };
  }

  if (!category) {
    return {
      messages: [
        "Please tell me which category product you need.",
        "For example, you can ask for perfumes, skincare, shoes, bags, or makeup.",
      ],
      products: [],
      category: "",
    };
  }

  const selectedProducts = selectProducts(products, query, category, preference);

  if (!selectedProducts.length) {
    return {
      messages: [
        "I could not find a close match yet.",
        "Please try another category or a more specific request.",
      ],
      products: [],
      category,
    };
  }

  return {
    messages: buildRecommendationMessages({
      category,
      preference,
    }),
    products: selectedProducts,
    category,
  };
}

function buildLegacyRecommendation(messages, products) {
  const text = Array.isArray(messages) ? messages.join(" ") : String(messages || "");

  if (!products.length) {
    return text;
  }

  const productList = products.map((product, index) => `${index + 1}. ${product.title}`).join(" ");
  return `${text} ${productList}`.trim();
}

async function getShopProducts(shop) {
  const { admin } = await unauthenticated.admin(shop);
  const response = await admin.graphql(PRODUCT_SEARCH_QUERY, {
    variables: { first: 50 },
  });
  const result = await parseAdminGraphqlResponse(response, `Product query failed for ${shop}`);

  return normalizeProducts(result?.data?.products?.edges || []);
}

export const loader = async ({ request }) => {
  try {
    const requestUrl = new URL(request.url);
    const userQuery = requestUrl.searchParams.get("userquery")?.trim();
    const requestedShop = requestUrl.searchParams.get("shop")?.trim();

    if (!requestedShop || !userQuery) {
      return json(
        { error: "Missing shop or userquery" },
        {
          status: 400,
          headers: corsHeaders,
        },
      );
    }

    const products = await getShopProducts(requestedShop);
    const response = buildChatResponse(products, userQuery);

    return json(
      {
        messages: response.messages,
        products: response.products,
        category: response.category,
        recommendations: buildLegacyRecommendation(response.messages, response.products),
      },
      {
        headers: corsHeaders,
      },
    );
  } catch (error) {
    console.error("AI recommendation error:", error);

    return json(
      { error: error?.message || "Unable to process request" },
      {
        status: 500,
        headers: corsHeaders,
      },
    );
  }
};
