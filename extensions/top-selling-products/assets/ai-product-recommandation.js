document.addEventListener("DOMContentLoaded", function () {
    const app_url = "https://top-seller-analytics.onrender.com/api/ai-productds-recommandation";
    const toggleBtn = document.querySelector("#chatbot_toggle");
    const chatBody = document.querySelector(".container_custom");
    const themeToggleBtn = document.querySelector(".theme-toggle");
    const chatContainer = document.querySelector(".chat-container");
    const chatActionsButton = document.querySelector(".action-buttons");
    const messageInput = document.querySelector(".message-input");
    const shop = window.Shopify && window.Shopify.shop ? window.Shopify.shop : "";

    if (toggleBtn && chatBody) {
        toggleBtn.addEventListener("click", () => {
            chatBody.classList.toggle("active_ai_body");
        });
    }

    if (themeToggleBtn && chatBody) {
        themeToggleBtn.addEventListener("click", () => {
            chatBody.classList.remove("active_ai_body");
        });
    }

    if (!chatActionsButton || !chatContainer || !messageInput) {
        return;
    }

    chatActionsButton.addEventListener("click", async () => {
        const userInputTrim = messageInput.value.trim();

        if (!userInputTrim) {
            return;
        }

        const userMessage = `
           <div class="message user-message">
                    <div class="avatar">ðŸ‘¤</div>
                    <div class="message-bubble">
                        <div class="message-content"><p>${userInputTrim}</p></div>
                    </div>
                </div>
            `;

        chatContainer.insertAdjacentHTML("beforeend", userMessage);
        messageInput.value = "";

        try {
            const response = await fetch(
                `${app_url}?shop=${encodeURIComponent(shop)}&userquery=${encodeURIComponent(userInputTrim)}`
            );
            const data = await response.json();

            console.log("API Response: ", data);

            const botText = data.recommendations || data.error || "No response found.";

            setTimeout(() => {
                const botMessage = `
                <div class="message bot-message">
                    <div class="avatar">😊</div>
                    <div class="message-bubble">
                        <div class="message-content"><p>${botText}</p></div>
                    </div>
                </div>
            `;
                chatContainer.insertAdjacentHTML("beforeend", botMessage);
            }, 1000);
        } catch (error) {
            console.error("Error fetching recommendations: ", error);

            const errorMessage = `
                <div class="message bot-message">
                    <div class="avatar">🤖</div>
                    <div class="message-bubble">
                        <div class="message-content"><p>Something went wrong. Please try again.</p></div>
                    </div>
                </div>
            `;
            chatContainer.insertAdjacentHTML("beforeend", errorMessage);
        }
    });
});
