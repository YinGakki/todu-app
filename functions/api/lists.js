/**
 * Cloudflare Pages Function - Lists/Groups Configuration API
 * 存储/读取 key='lists' 的 JSON 配置
 */
export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;

  // 1. 鉴权
  const authKey = request.headers.get("x-auth-key");
  const adminPassword = env.ADMIN_PASSWORD || "123456";

  if (authKey !== adminPassword) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  // === GET: 获取列表配置 ===
  if (request.method === "GET") {
    try {
      const result = await db.prepare("SELECT value FROM configs WHERE key = 'lists'").first();
      
      // 如果数据库里还没存过，返回 null，前端会使用默认值
      const lists = result ? JSON.parse(result.value) : null;

      return new Response(JSON.stringify(lists), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
  }

  // === POST: 保存列表配置 ===
  if (request.method === "POST") {
    try {
      const lists = await request.json(); // 前端传来的数组
      
      // 使用 INSERT OR REPLACE，如果存在则更新，不存在则插入
      await db.prepare(
        "INSERT OR REPLACE INTO configs (key, value) VALUES ('lists', ?)"
      ).bind(JSON.stringify(lists)).run();

      return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
  }

  return new Response("Method Not Allowed", { status: 405 });
}