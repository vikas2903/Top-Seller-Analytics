import Groq from "groq-sdk";
import dotenv from "dotenv";
import { json } from "@remix-run/node";

dotenv.config();

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
          headers: {
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }

    const groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });

    const systemPrompt = `You are a helpful assistant for a Shopify store.

    Suggestions:
    - Provide polite and realistic information to the user based on the query.
    - Do not say "I do not know". Try to answer helpfully and clearly.
    - Keep the response relevant to the user's message.
    `;

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
        },
      ],
    });

    const recommendations = response.choices?.[0]?.message?.content || "";

    return json(
      { recommendations },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  } catch (error) {
    console.error("AI recommendation error:", error);

    return json(
      { error: "Unable to process request" },
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }
};
