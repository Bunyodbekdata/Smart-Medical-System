import { getServiceSupabaseEnv, isCloudSupabaseConfigured } from "@/lib/supabase/env";

export async function broadcastPublicQueueUpdate(params: {
  clinicId: string;
  doctorId: string;
  queueDate: string;
  eventType: "ticket_created" | "status_changed" | "payment_updated";
}) {
  if (!isCloudSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return;
  }

  try {
    const { url, serviceKey } = getServiceSupabaseEnv();
    const topic = `queue-public:${params.clinicId}:${params.doctorId}:${params.queueDate}`;

    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          {
            topic,
            event: "queue_updated",
            payload: {
              event_type: params.eventType,
              doctor_id: params.doctorId,
              queue_date: params.queueDate,
              updated_at: new Date().toISOString(),
            },
          },
        ],
      }),
    });
  } catch (err) {
    console.warn("[realtime-broadcast] Failed to notify public channel:", err);
  }
}
