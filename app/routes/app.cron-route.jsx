export async function loader({ request }) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (token !== "12345") {
    return new Response("Unauthorized", { status: 401 });
  }

  console.log("⏰ Cron triggered at:", new Date().toISOString());
  console.log("🚀 ALERT: This runs every 2 minutes!");

  return new Response("OK");
}