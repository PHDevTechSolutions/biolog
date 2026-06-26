// pages/api/check-session.ts

import { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "@/lib/supabase";
import { parse } from "cookie";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    console.log("[check-session] Received request, headers:", req.headers);
    
    const cookies = req.headers.cookie ? parse(req.headers.cookie) : {};
    console.log("[check-session] Parsed cookies:", cookies);
    
    const sessionToken = cookies.session;
    console.log("[check-session] Session token from cookie:", sessionToken ? "present" : "missing");

    if (!sessionToken) {
        console.log("[check-session] No session token, returning 401");
        return res.status(401).json({ message: "No session token" });
    }

    // 1. Find the session in the DB
    console.log("[check-session] Looking up session in DB with token:", sessionToken);
    const { data: sessionDoc, error: sessionError } = await supabase
        .from("sessions")
        .select("*")
        .eq("token", sessionToken)
        .single();

    console.log("[check-session] Session lookup result:", { sessionDoc, sessionError });
    
    if (sessionError || !sessionDoc) {
        console.log("[check-session] Invalid session, returning 401");
        return res.status(401).json({ message: "Invalid or expired session" });
    }

    // 2. Check deviceId match (extra security)
    const deviceId = req.headers["x-device-id"];
    console.log("[check-session] Checking device ID:", { requestDeviceId: deviceId, sessionDeviceId: sessionDoc.deviceId });
    if (sessionDoc.deviceId && deviceId && sessionDoc.deviceId !== deviceId) {
        console.log("[check-session] Device mismatch, returning 401");
        return res.status(401).json({ message: "Device mismatch. Please login again." });
    }

    // 3. Find the user associated with the session
    console.log("[check-session] Looking up user with id:", sessionDoc.userId);
    const { data: user, error: userError } = await supabase
        .from("users")
        .select("*")
        .eq("id", sessionDoc.userId)
        .single();

    console.log("[check-session] User lookup result:", { user, userError });
    
    if (userError || !user) {
        console.log("[check-session] User not found, returning 401");
        return res.status(401).json({ message: "User not found" });
    }

    // 4. Update last active
    console.log("[check-session] Updating session last active time");
    await supabase
        .from("sessions")
        .update({ lastActive: new Date().toISOString() })
        .eq("id", sessionDoc.id);

    console.log("[check-session] Session valid, returning 200");
    return res.status(200).json({ 
        message: "Session valid", 
        user: { ...user, _id: user.id } 
    });
}
