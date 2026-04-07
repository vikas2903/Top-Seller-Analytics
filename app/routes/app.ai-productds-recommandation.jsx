import Groq from "groq-sdk";
import dotenv from "dotenv";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server.js"; 
import { useLoaderData } from "react-router";

dotenv.config();

export const loader = async ({ request }) => {

    const requestUrl = new URL(request.url);
    const userQuery = requestUrl.searchParams.get("userquery");
    console.log("User Query: ", userQuery);
    const { admin, session } = await authenticate.admin(request);
    const shop = session.shop;;
    const accessToken = session.accessToken;

    console.log("Request: ", request);

    const groq = new Groq({
        apiKey: process.env.GROQ_API_KEY,
    });

    const systemPrompt = `You are a helpful assistant for a Shopify store. Your task is to analyze the store's product data and provide recommendations for the top-selling products based on various factors such as sales performance, customer reviews, and market trends. Please use the following data to generate your recommendations:    
    
    `;

    const userMessage = `User query: ${userQuery}`;
    const response = await groq.chat.completions.create({
        model: process.env.MODEL,
        messages: [
            {
                role: "system",
                content: systemPrompt,
            },
            {
                role: "user",
                content: userQuery, 
            }
        ],
    });

    console.log("Groq Response: ", response.choices[0].message.content);
    return json({ recommendations: response.choices[0].message.content });
}


export default function AiProductRecommandation() {

    const { recommendations } = useLoaderData();

    return (
        <div>
            <h1>TEST Recommendation</h1>
          <pre>
            { JSON.stringify(recommendations, null, 2) }
          </pre>
        </div>
    )
}   

