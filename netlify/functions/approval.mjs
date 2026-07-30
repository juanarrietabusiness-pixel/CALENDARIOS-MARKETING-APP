import { getStore } from "@netlify/blobs";

export default async (req, context) => {
  const store = getStore("calendar-approvals");
  const url = new URL(req.url);
  const calendarId = url.searchParams.get("id");

  if (!calendarId) {
    return new Response("Missing id", { status: 400 });
  }

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method === "GET") {
    try {
      const data = await store.get(calendarId, { type: "json" });
      return new Response(
        JSON.stringify(data || { approvals: {}, calendar: null }),
        { headers: corsHeaders }
      );
    } catch {
      return new Response(
        JSON.stringify({ approvals: {}, calendar: null }),
        { headers: corsHeaders }
      );
    }
  }

  if (req.method === "POST") {
    const body = await req.json();

    if (body.action === "save_calendar") {
      await store.set(calendarId, body.data, { type: "json" });
      return new Response(JSON.stringify({ ok: true }), {
        headers: corsHeaders,
      });
    }

    if (body.action === "approve") {
      let current = {};
      try {
        current =
          (await store.get(calendarId, { type: "json" })) || {};
      } catch {}

      if (!current.approvals) current.approvals = {};
      current.approvals[body.publicacionId] = {
        estado: body.estado,
        comentario: body.comentario || "",
        timestamp: new Date().toISOString(),
      };

      await store.set(calendarId, current, { type: "json" });
      return new Response(JSON.stringify({ ok: true }), {
        headers: corsHeaders,
      });
    }
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config = { path: "/api/approval" };
