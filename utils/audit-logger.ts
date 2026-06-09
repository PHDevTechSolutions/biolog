import { supabase } from "@/lib/supabase";

export async function recordAuditLog(adminId: string, adminName: string, action: string, targetId: string, targetName: string, details?: string) {
    try {
        if (!supabase) {
            console.warn("[AuditLogger] Supabase client not initialized. Skipping audit log.");
            return;
        }
        await supabase.from("audit_logs").insert({
            adminId,
            adminName,
            action,
            targetId,
            targetName,
            details,
            date_created: new Date().toISOString()
        });
    } catch (error) {
        console.error("Failed to record audit log:", error);
    }
}
