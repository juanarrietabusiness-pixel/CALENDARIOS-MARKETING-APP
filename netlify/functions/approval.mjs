import { getStore } from "@netlify/blobs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const calendarId = url.searchParams.get("id");

  if (!calendarId) {
    return json({ error: "Missing id" }, 400);
  }

  const store = getStore("calendar-approvals");

  if (req.method === "GET") {
    try {
      const data = await store.get(calendarId, { type: "json" });
      return json(data || { approvals: {}, calendar: null });
    } catch {
      return json({ approvals: {}, calendar: null });
    }
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    if (body.action === "save_calendar") {
      await store.set(calendarId, body.data, { type: "json" });
      return json({ ok: true });
    }

    if (body.action === "approve") {
      let current = {};
      try {
        current = (await store.get(calendarId, { type: "json" })) || {};
      } catch { /* first write */ }

      if (!current.approvals) current.approvals = {};
      current.approvals[body.publicacionId] = {
        estado: body.estado,
        comentario: body.comentario || "",
        timestamp: new Date().toISOString(),
      };

      await store.set(calendarId, current, { type: "json" });
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  }

  return json({ error: "Method not allowed" }, 405);
};

export const config = { path: "/api/approval" };
