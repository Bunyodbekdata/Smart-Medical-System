import { getTashkentDateString } from "./formatters";

const STORAGE_KEY = "medclinic_active_ticket_v1";

export interface StoredActiveTicket {
  ticketNumber: string;
  trackingToken: string;
  doctorName: string;
  serviceName: string;
  queueDate: string;
}

export function saveActiveTicket(ticket: Omit<StoredActiveTicket, "queueDate"> & { queueDate?: string }) {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredActiveTicket = {
      ...ticket,
      queueDate: ticket.queueDate ?? getTashkentDateString(),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota / private mode restrictions
  }
}

export function loadActiveTicket(): StoredActiveTicket | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredActiveTicket>;
    if (!parsed.ticketNumber || !parsed.trackingToken || !parsed.queueDate) {
      return null;
    }
    // Only keep tickets for today (Tashkent timezone)
    if (parsed.queueDate !== getTashkentDateString()) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return {
      ticketNumber: parsed.ticketNumber,
      trackingToken: parsed.trackingToken,
      doctorName: parsed.doctorName || "Shifokor",
      serviceName: parsed.serviceName || "Tibbiy xizmat",
      queueDate: parsed.queueDate,
    };
  } catch {
    return null;
  }
}

export function clearActiveTicket(trackingToken?: string) {
  if (typeof window === "undefined") return;
  try {
    if (!trackingToken) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    const existing = loadActiveTicket();
    if (existing && existing.trackingToken === trackingToken) {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}
