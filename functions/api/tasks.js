/**
 * Cloudflare Pages Function - Task API
 */
export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB; 

  // 1. 验证密码 (默认 123456)
  const authKey = request.headers.get("x-auth-key");
  const adminPassword = env.ADMIN_PASSWORD || "123456";

  if (authKey !== adminPassword) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  const url = new URL(request.url);

  // === GET ===
  if (request.method === "GET") {
    try {
      const { results } = await db.prepare(
        "SELECT * FROM tasks ORDER BY is_done ASC, created_at DESC"
      ).all();

      const tasks = results.map(row => ({
        id: row.id.toString(),
        title: row.title,
        is_done: row.is_done === 1,
        groupId: row.group_id || 'g1',
        subtasks: row.subtasks ? JSON.parse(row.subtasks) : [],
        dueDate: row.due_date,
        createdAt: row.created_at
      }));

      return new Response(JSON.stringify(tasks), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
  }

  // === POST ===
  if (request.method === "POST") {
    try {
      const body = await request.json();
      const { success } = await db.prepare(`
        INSERT INTO tasks (title, is_done, group_id, subtasks, due_date)
        VALUES (?, ?, ?, ?, ?)
      `).bind(
        body.title,
        body.is_done ? 1 : 0,
        body.groupId || 'g1',
        JSON.stringify(body.subtasks || []),
        body.dueDate || null
      ).run();
      return new Response(JSON.stringify({ success }), { status: 201 });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
  }

  // === PUT ===
  if (request.method === "PUT") {
    try {
      const id = url.searchParams.get("id");
      const body = await request.json();
      const updates = [];
      const values = [];

      if (body.title !== undefined) { updates.push("title = ?"); values.push(body.title); }
      if (body.is_done !== undefined) { updates.push("is_done = ?"); values.push(body.is_done ? 1 : 0); }
      if (body.groupId !== undefined) { updates.push("group_id = ?"); values.push(body.groupId); }
      if (body.subtasks !== undefined) { updates.push("subtasks = ?"); values.push(JSON.stringify(body.subtasks)); }
      if (body.dueDate !== undefined) { updates.push("due_date = ?"); values.push(body.dueDate); }

      if (updates.length > 0) {
        values.push(id);
        await db.prepare(`UPDATE tasks SET ${updates.join(", ")} WHERE id = ?`).bind(...values).run();
      }
      return new Response(JSON.stringify({ success: true }));
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
  }

  // === DELETE ===
  if (request.method === "DELETE") {
    try {
      const id = url.searchParams.get("id");
      await db.prepare("DELETE FROM tasks WHERE id = ?").bind(id).run();
      return new Response(JSON.stringify({ success: true }));
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
  }

  return new Response("Method Not Allowed", { status: 405 });
}