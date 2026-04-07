document.addEventListener("DOMContentLoaded", function () {

    const toggleBtn = document.querySelector("#chatbot_toggle");
    const chatBody = document.querySelector(".container_custom");
    const themeToggleBtn = document.querySelector(".theme-toggle");

    const chatContainer = document.querySelector(".chat-container");
    const chatActionsButton = document.querySelector(".action-buttons");

    
    if (toggleBtn && chatBody) {
        toggleBtn.addEventListener('click', () => {
            chatBody.classList.toggle("active_ai_body");
        });
    }

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            chatBody.classList.remove("active_ai_body");

        });
    }

    chatActionsButton.addEventListener('click', () => {
        let userInput = document.querySelector(".message-input").value;
        let userInputTrim = userInput.trim();

        if (userInputTrim !== "") {

            let userMessage = `
           <div class="message user-message">
                    <div class="avatar">👤</div>
                    <div class="message-bubble">
                        <div class="message-content"><p>${userInputTrim}</p></div>
                    </div>
                </div>
            `;
            chatContainer.insertAdjacentHTML("beforeend", userMessage);
            document.querySelector(".message-input").value = "";

            setTimeout(() => {
                let botMessage = `
                <div class="message bot-message">
                    <div class="avatar">🤖</div>
                    <div class="message-bubble">
                        <div class="message-content"><p>Hello! How can I assist you today? Are you looking for product recommendations or have any other questions?</p></div>
                    </div>
                </div>
            `;
                chatContainer.insertAdjacentHTML("beforeend", botMessage);
            }, 1000);

        }



    
    
    });

});