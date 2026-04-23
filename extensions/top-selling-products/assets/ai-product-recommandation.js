document.addEventListener("DOMContentLoaded", function () {
    const chatbotBlocks = document.querySelectorAll("[data-ai-product-chatbot]");

    chatbotBlocks.forEach((block) => {
        const toggleBtn = block.querySelector(".chatbot-toggle");
        const chatBody = block.querySelector(".container_custom");
        const closeBtn = block.querySelector(".theme-toggle");
        const chatContainer = block.querySelector(".chat-container");
        const sendButton = block.querySelector(".send-button");
        const messageInput = block.querySelector(".message-input");
        const typingIndicator = block.querySelector(".typing-indicator");
        const productsUrl = block.dataset.productsUrl || "/products.json?limit=50";
        const shopCurrency =
            (window.Shopify &&
                window.Shopify.currency &&
                window.Shopify.currency.active) ||
            "USD";
        const categoryAliases = {
            perfume: ["perfume", "fragrance", "scent", "attar", "deo", "deodorant", "cologne"],
            skincare: ["skincare", "skin care", "face wash", "serum", "cream", "moisturizer", "cleanser", "sunscreen"],
            makeup: ["makeup", "lipstick", "foundation", "mascara", "compact", "blush", "eyeliner"],
            haircare: ["haircare", "hair care", "shampoo", "conditioner", "hair oil", "hair serum"],
            shoes: ["shoe", "shoes", "sneaker", "sneakers", "sandals", "heels", "boots", "slippers"],
            bags: ["bag", "bags", "handbag", "wallet", "backpack", "purse"],
            clothing: ["dress", "shirt", "tshirt", "t-shirt", "jeans", "kurti", "hoodie", "jacket", "clothing", "fashion"],
            jewelry: ["jewelry", "jewellery", "ring", "necklace", "earrings", "bracelet"],
            electronics: ["electronics", "mobile", "phone", "laptop", "earbuds", "speaker", "watch", "charger"],
        };
        const conversationalFillers = [
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
        ];

        if (!toggleBtn || !chatBody || !chatContainer || !sendButton || !messageInput) {
            return;
        }

        let cachedProducts = null;
        let customerName = "";

        toggleBtn.addEventListener("click", function () {
            chatBody.classList.toggle("active_ai_body");
        });

        if (closeBtn) {
            closeBtn.addEventListener("click", function () {
                chatBody.classList.remove("active_ai_body");
            });
        }

        sendButton.addEventListener("click", handleSend);
        messageInput.addEventListener("keydown", function (event) {
            if (event.key === "Enter") {
                event.preventDefault();
                handleSend();
            }
        });

        async function handleSend() {
            const userQuery = messageInput.value.trim();

            if (!userQuery) {
                return;
            }

            appendUserMessage(userQuery);
            messageInput.value = "";
            setTyping(true);

            try {
                const products = await loadProducts();
                const response = buildChatResponse(products, userQuery);
                appendBotMessage(response.messages, response.products);
            } catch (error) {
                console.error("Error loading products:", error);
                appendErrorMessage();
            } finally {
                setTyping(false);
                scrollToBottom();
            }
        }

        async function loadProducts() {
            if (cachedProducts) {
                return cachedProducts;
            }

            const response = await fetch(productsUrl, {
                headers: {
                    Accept: "application/json",
                },
            });

            if (!response.ok) {
                throw new Error("Unable to fetch products");
            }

            const data = await response.json();
            cachedProducts = Array.isArray(data.products) ? data.products : [];
            return cachedProducts;
        }

        function buildChatResponse(products, query) {
            const normalizedQuery = query.toLowerCase().trim();
            const extractedName = extractName(query);
            const detectedCategory = detectCategory(normalizedQuery, products);
            const customerPreference = detectPreference(normalizedQuery);

            if (extractedName) {
                customerName = extractedName;
                return {
                    messages: [
                        "Nice to meet you, " + customerName + ".",
                        "What type of product are you looking for today? I can help with perfumes, skincare, shoes, bags, makeup, and more.",
                    ],
                    products: [],
                };
            }

            if (isGreetingOnly(normalizedQuery)) {
                return {
                    messages: customerName
                        ? [
                            "Hi " + customerName + ".",
                            "Which category product do you need today? For example perfumes, skincare, shoes, bags, or makeup.",
                        ]
                        : [
                            "Hi there. Welcome to Digi.",
                            "What is your name, and which category product do you need today? You can ask for perfumes, skincare, shoes, bags, or makeup.",
                        ],
                    products: [],
                };
            }

            if (isCategoryDiscoveryQuery(normalizedQuery)) {
                return {
                    messages: [
                        "I can suggest products category-wise.",
                        "Please tell me which category you need, like perfumes, skincare, makeup, haircare, shoes, bags, clothing, jewelry, or electronics.",
                    ],
                    products: [],
                };
            }

            if (!detectedCategory && isVagueShoppingIntent(normalizedQuery)) {
                return {
                    messages: customerName
                        ? [
                            "Sure " + customerName + ", I can help with that.",
                            "Which category product would you like me to suggest?",
                        ]
                        : [
                            "Sure, I can help you with that.",
                            "Which category product would you like me to suggest?",
                        ],
                    products: [],
                };
            }

            const matchedProducts = getRecommendedProducts(products, query, detectedCategory);
            const introName = customerName ? customerName + ", " : "";

            if (!matchedProducts.length) {
                return {
                    messages: [
                        "I could not find a close match yet.",
                        "Please tell me the category you need, for example perfumes, skincare, shoes, bags, or makeup.",
                    ],
                    products: [],
                };
            }

            return {
                messages: detectedCategory
                    ? buildRecommendationMessages(detectedCategory, introName, customerPreference)
                    : [
                        "Here are 3 products I recommend for " + introName + "you.",
                    ],
                products: matchedProducts.slice(0, 3),
            };
        }

        function extractName(query) {
            const patterns = [
                /(?:my name is|i am|i'm|im|this is)\s+([a-zA-Z]{2,30})/i,
            ];

            for (let index = 0; index < patterns.length; index += 1) {
                const match = query.match(patterns[index]);

                if (match && match[1]) {
                    return capitalizeWord(match[1]);
                }
            }

            return "";
        }

        function isGreetingOnly(query) {
            return /^(hi+|hello+|hey+|hii+|hola+|good morning|good evening|good afternoon)$/.test(query);
        }

        function isCategoryDiscoveryQuery(query) {
            return /(category|categories|what do you have|show category|product category|suggest category)/.test(query);
        }

        function isVagueShoppingIntent(query) {
            return /(suggest|recommend|show|need|want|looking for|help me|something nice|best product|best products)/.test(query);
        }

        function detectCategory(query, products) {
            const normalizedWords = query
                .split(/\s+/)
                .map(function (word) {
                    return word.replace(/[^a-z]/g, "");
                })
                .filter(function (word) {
                    return word && conversationalFillers.indexOf(word) === -1;
                })
                .join(" ");
            const aliasEntries = Object.keys(categoryAliases);

            for (let index = 0; index < aliasEntries.length; index += 1) {
                const categoryKey = aliasEntries[index];
                const aliases = categoryAliases[categoryKey];

                if (aliases.some(function (alias) { return normalizedWords.includes(alias); })) {
                    return categoryKey;
                }
            }

            const derivedCategories = getAvailableCategories(products);

            for (let index = 0; index < derivedCategories.length; index += 1) {
                if (normalizedWords.includes(derivedCategories[index].toLowerCase())) {
                    return derivedCategories[index];
                }
            }

            return "";
        }

        function detectPreference(query) {
            if (/(men|man|male|boys|gents|him)/.test(query)) {
                return "for men";
            }

            if (/(women|woman|female|girls|ladies|her)/.test(query)) {
                return "for women";
            }

            if (/(premium|luxury)/.test(query)) {
                return "premium";
            }

            if (/(budget|affordable|cheap|low price)/.test(query)) {
                return "budget-friendly";
            }

            return "";
        }

        function buildRecommendationMessages(category, introName, preference) {
            let message = "I understood that you want " + category + " products";

            if (preference) {
                message += " " + preference;
            }

            return [
                "Sure, I can help you with that.",
                message + ".",
                "Here are 3 suggestions for " + introName + "you.",
            ];
        }

        function getAvailableCategories(products) {
            const categoryMap = {};

            products.forEach(function (product) {
                const possibleCategories = [product.product_type]
                    .concat(Array.isArray(product.tags) ? product.tags : String(product.tags || "").split(","))
                    .map(function (value) {
                        return String(value || "").trim();
                    })
                    .filter(function (value) {
                        return value.length > 2 && value.length < 25;
                    });

                possibleCategories.forEach(function (category) {
                    const key = category.toLowerCase();

                    if (!categoryMap[key]) {
                        categoryMap[key] = category;
                    }
                });
            });

            return Object.keys(categoryMap).map(function (key) {
                return categoryMap[key];
            });
        }

        function getRecommendedProducts(products, query, detectedCategory) {
            const queryTokens = query
                .toLowerCase()
                .split(/\s+/)
                .map(function (token) {
                    return token.trim();
                })
                .filter(Boolean);

            const scoredProducts = products
                .map(function (product) {
                    const haystack = [
                        product.title,
                        product.product_type,
                        product.vendor,
                        product.body_html,
                        Array.isArray(product.tags) ? product.tags.join(" ") : product.tags,
                    ]
                        .filter(Boolean)
                        .join(" ")
                        .toLowerCase();

                    const score = queryTokens.reduce(function (total, token) {
                        if (haystack.includes(token)) {
                            return total + 1;
                        }

                        return total;
                    }, 0);

                    const categoryBoost = detectedCategory && haystack.includes(detectedCategory.toLowerCase()) ? 5 : 0;

                    return {
                        product: product,
                        score: score + categoryBoost,
                    };
                })
                .filter(function (item) {
                    return item.score > 0;
                })
                .sort(function (a, b) {
                    return b.score - a.score;
                });

            const matched = scoredProducts.slice(0, 4).map(function (item) {
                return item.product;
            });

            if (matched.length >= 2) {
                return matched.slice(0, 3);
            }

            const fallbackProducts = products.slice(0, 3);
            const combinedProducts = matched.length ? matched.concat(fallbackProducts) : fallbackProducts;

            return combinedProducts
                .filter(function (product, index, collection) {
                    return (
                        collection.findIndex(function (item) {
                            return item.id === product.id;
                        }) === index
                    );
                })
                .slice(0, 3);
        }

        function appendUserMessage(message) {
            chatContainer.insertAdjacentHTML(
                "beforeend",
                [
                    '<div class="message user-message">',
                    '    <div class="avatar">You</div>',
                    '    <div class="message-bubble">',
                    '        <div class="message-content"><p>' + escapeHtml(message) + "</p></div>",
                    "    </div>",
                    "</div>",
                ].join("")
            );

            scrollToBottom();
        }

        function appendBotMessage(messages, products) {
            const productCards = products
                .slice(0, 3)
                .map(function (product) {
                    return buildProductCard(product);
                })
                .join("");
            const safeMessages = Array.isArray(messages) ? messages : [messages];
            const stackedMessages = safeMessages
                .filter(Boolean)
                .map(function (message, index) {
                    const isLastTextBubble = index === safeMessages.length - 1 && !products.length;

                    return [
                        '<div class="message-bubble' + (isLastTextBubble ? "" : "") + '">',
                        '    <div class="message-content"><p>' + escapeHtml(message) + "</p></div>",
                        "</div>",
                    ].join("");
                })
                .join("");

            chatContainer.insertAdjacentHTML(
                "beforeend",
                [
                    '<div class="message bot-message">',
                    '    <div class="avatar">AI</div>',
                    '    <div class="bot-message-stack">',
                    stackedMessages,
                    products.length
                        ? '        <div class="message-bubble message-bubble-products"><div class="message-content"><div class="product-grid">' + productCards + "</div></div></div>"
                        : "",
                    "    </div>",
                    "</div>",
                ].join("")
            );
        }

        function appendErrorMessage() {
            chatContainer.insertAdjacentHTML(
                "beforeend",
                [
                    '<div class="message bot-message">',
                    '    <div class="avatar">AI</div>',
                    '    <div class="message-bubble">',
                    '        <div class="message-content"><p>Something went wrong while loading products. Please try again.</p></div>',
                    "    </div>",
                    "</div>",
                ].join("")
            );
        }

        function buildProductCard(product) {
            const image = product.images && product.images[0] ? product.images[0].src : "";
            const variant = product.variants && product.variants[0] ? product.variants[0] : null;
            const price = variant ? formatPrice(variant.price) : "";
            const description = stripHtml(product.body_html || "").slice(0, 120);
            const productType = product.product_type ? '<span class="product-chip">' + escapeHtml(product.product_type) + "</span>" : "";
            const vendor = product.vendor ? '<span class="product-chip">' + escapeHtml(product.vendor) + "</span>" : "";

            return [
                '<article class="product-card">',
                image ? '    <img class="product-card-image" src="' + escapeAttribute(image) + '" alt="' + escapeAttribute(product.title || "Product") + '">' : "",
                '    <div class="product-card-body">',
                '        <div class="product-card-title">' + escapeHtml(product.title || "Untitled product") + "</div>",
                '        <div class="product-card-meta">' + productType + vendor + "</div>",
                price ? '        <div class="product-card-price">' + escapeHtml(price) + "</div>" : "",
                description ? '        <div class="product-card-desc">' + escapeHtml(description) + "</div>" : "",
                '        <a class="product-card-link" href="' + escapeAttribute(product.handle ? "/products/" + product.handle : "#") + '">View</a>',
                "    </div>",
                "</article>",
            ].join("");
        }

        function setTyping(isVisible) {
            if (!typingIndicator) {
                return;
            }

            typingIndicator.classList.toggle("is-visible", isVisible);
        }

        function scrollToBottom() {
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }

        function stripHtml(content) {
            const temp = document.createElement("div");
            temp.innerHTML = content;
            return (temp.textContent || temp.innerText || "").trim();
        }

        function formatPrice(price) {
            const numericPrice = Number(price);

            if (Number.isNaN(numericPrice)) {
                return price || "";
            }

            return new Intl.NumberFormat(undefined, {
                style: "currency",
                currency: shopCurrency,
            }).format(numericPrice);
        }

        function escapeHtml(value) {
            return String(value)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/\"/g, "&quot;")
                .replace(/'/g, "&#39;");
        }

        function escapeAttribute(value) {
            return escapeHtml(value);
        }

        function capitalizeWord(value) {
            if (!value) {
                return "";
            }

            return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
        }
    });
});
